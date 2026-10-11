import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db';
import { hashPassword, verifyPassword } from '../auth/password';
import { authenticate } from '../auth/middleware';
import {
  clearAuthCookies,
  issueTokens,
  REFRESH_COOKIE,
  setAuthCookies,
  sha256,
  verifyRefreshToken,
} from '../auth/tokens';
import { config } from '../config';
import { AppError, asyncHandler } from '../utils/http';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again shortly.', code: 'RATE_LIMITED' },
});

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  organization: z.string().max(200).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function publicUser(u: { id: string; name: string; email: string; role: string; status: string }) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status };
}

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = registerSchema.parse(req.body);
    const email = body.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError(409, 'An account with this email already exists', 'EMAIL_TAKEN');

    // The very first account bootstraps as the platform admin.
    const count = await prisma.user.count();
    const role = count === 0 ? 'ADMIN' : 'CANDIDATE';

    const user = await prisma.user.create({
      data: {
        name: body.name.trim(),
        email,
        passwordHash: await hashPassword(body.password),
        role,
        organization: body.organization,
      },
    });

    const tokens = await issueTokens(publicUser(user));
    setAuthCookies(res, tokens);
    res.status(201).json({ user: publicUser(user) });
  }),
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = loginSchema.parse(req.body);
    const email = body.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    if (user.status !== 'ACTIVE') throw new AppError(403, 'This account is disabled', 'ACCOUNT_DISABLED');

    const ok = await verifyPassword(body.password, user.passwordHash);
    if (!ok) throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');

    const tokens = await issueTokens(publicUser(user));
    setAuthCookies(res, tokens);
    res.json({ user: publicUser(user) });
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) {
      await prisma.refreshToken.updateMany({
        where: { tokenHash: sha256(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new AppError(401, 'No refresh token', 'NO_REFRESH_TOKEN');

    let claims;
    try {
      claims = verifyRefreshToken(token);
    } catch {
      clearAuthCookies(res);
      throw new AppError(401, 'Invalid refresh token', 'REFRESH_INVALID');
    }

    const stored = await prisma.refreshToken.findFirst({ where: { tokenHash: sha256(token) } });
    if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
      clearAuthCookies(res);
      throw new AppError(401, 'Refresh token expired or revoked', 'REFRESH_EXPIRED');
    }

    const user = await prisma.user.findUnique({ where: { id: claims.sub } });
    if (!user || user.status !== 'ACTIVE') {
      clearAuthCookies(res);
      throw new AppError(401, 'Account unavailable', 'ACCOUNT_UNAVAILABLE');
    }

    // Rotate: revoke the used token, issue a fresh pair.
    await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    const tokens = await issueTokens(publicUser(user));
    setAuthCookies(res, tokens);
    res.json({ user: publicUser(user) });
  }),
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError(404, 'User not found');
    res.json({ user: publicUser(user) });
  }),
);

router.post(
  '/forgot-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ email: z.string().email() }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase().trim() } });

    // Always respond 200 to avoid account enumeration.
    const response: Record<string, unknown> = { ok: true, message: 'If the account exists, a reset link has been generated.' };

    if (user) {
      const raw = crypto.randomBytes(32).toString('hex');
      await prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3_600_000) },
      });
      // Email delivery is not configured in this environment; surface the token
      // outside production so the flow is genuinely testable.
      if (config.NODE_ENV !== 'production') response.resetToken = raw;
    }

    res.json(response);
  }),
);

router.post(
  '/reset-password',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = z.object({ token: z.string().min(10), password: z.string().min(8).max(200) }).parse(req.body);
    const record = await prisma.passwordResetToken.findFirst({ where: { tokenHash: sha256(body.token) } });
    if (!record || record.usedAt || record.expiresAt <= new Date()) {
      throw new AppError(400, 'This reset link is invalid or has expired', 'RESET_INVALID');
    }

    await prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(body.password) },
    });
    await prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    res.json({ ok: true });
  }),
);

export default router;
