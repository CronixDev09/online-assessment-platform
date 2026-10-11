import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { hashPassword } from '../../auth/password';
import { audit, notify } from '../../services/audit';
import { AppError, asyncHandler } from '../../utils/http';

const router = Router();

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const users = await prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(search
          ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, email: true, role: true, status: true, phone: true,
        organization: true, candidateCode: true, createdAt: true,
        _count: { select: { sessions: true, assignments: true } },
      },
    });
    res.json({ users });
  }),
);

const createSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  role: z.enum(['ADMIN', 'CANDIDATE']).default('CANDIDATE'),
  phone: z.string().max(40).optional(),
  organization: z.string().max(200).optional(),
  candidateCode: z.string().max(60).optional(),
});

router.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, name: true, email: true, role: true, status: true, phone: true,
        organization: true, candidateCode: true, createdAt: true,
      },
    });
    if (!user) throw new AppError(404, 'User not found');

    const assignments = await prisma.testAssignment.findMany({
      where: { candidateId: user.id },
      include: { test: { select: { id: true, title: true, status: true } } },
      orderBy: { assignedAt: 'desc' },
    });
    const sessions = await prisma.testSession.findMany({
      where: { candidateId: user.id },
      orderBy: { startedAt: 'desc' },
      include: { test: { select: { id: true, title: true } }, result: true },
    });

    res.json({
      user,
      assignments: assignments.map((a) => ({
        id: a.id, testId: a.testId, testTitle: a.test.title, testStatus: a.test.status,
        status: a.status, assignedAt: a.assignedAt,
      })),
      sessions: sessions.map((s) => ({
        sessionId: s.id, testId: s.testId, testTitle: s.test.title, attempt: s.attempt,
        status: s.status, submissionReason: s.submissionReason, startedAt: s.startedAt,
        submittedAt: s.submittedAt, score: s.result?.score ?? null,
        maxScore: s.result?.maxScore ?? null, percentage: s.result?.percentage ?? null,
        resultId: s.result?.id ?? null,
      })),
    });
  }),
);

router.post(
  '/users',
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const email = body.email.toLowerCase().trim();
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new AppError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
    }
    const user = await prisma.user.create({
      data: {
        name: body.name.trim(),
        email,
        passwordHash: await hashPassword(body.password),
        role: body.role,
        phone: body.phone,
        organization: body.organization,
        candidateCode: body.candidateCode,
      },
      select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    });
    await audit(req.user!.id, 'USER_CREATED', 'User', user.id, { role: user.role });
    await notify(user.id, 'Welcome', 'Your assessment platform account has been created.');
    res.status(201).json({ user });
  }),
);

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().max(40).nullable().optional(),
  organization: z.string().max(200).nullable().optional(),
  role: z.enum(['ADMIN', 'CANDIDATE']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  candidateCode: z.string().max(60).nullable().optional(),
});

router.put(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'User not found');
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: body,
      select: { id: true, name: true, email: true, role: true, status: true, phone: true, organization: true, candidateCode: true },
    });
    await audit(req.user!.id, 'USER_UPDATED', 'User', user.id, body);
    res.json({ user });
  }),
);

// Soft delete: disable the account, preserving examination records.
router.delete(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new AppError(404, 'User not found');
    if (user.id === req.user!.id) throw new AppError(400, 'You cannot disable your own account');
    await prisma.user.update({ where: { id: user.id }, data: { status: 'DISABLED' } });
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(req.user!.id, 'USER_DISABLED', 'User', user.id);
    res.json({ ok: true });
  }),
);

router.post(
  '/users/:id/reset-password',
  asyncHandler(async (req, res) => {
    const body = z.object({ password: z.string().min(8).max(200) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new AppError(404, 'User not found');
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(body.password) } });
    await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(req.user!.id, 'USER_PASSWORD_RESET', 'User', user.id);
    res.json({ ok: true });
  }),
);

router.post(
  '/users/:id/reset-attempt',
  asyncHandler(async (req, res) => {
    const body = z.object({ testId: z.string().min(1) }).parse(req.body);
    const sessions = await prisma.testSession.findMany({
      where: { candidateId: req.params.id, testId: body.testId },
      select: { id: true },
    });
    const ids = sessions.map((s) => s.id);
    // Cascade deletes answers, submissions, results, violations and logs.
    await prisma.testSession.deleteMany({ where: { id: { in: ids } } });
    await prisma.testAssignment.updateMany({
      where: { candidateId: req.params.id, testId: body.testId },
      data: { status: 'ASSIGNED' },
    });
    await audit(req.user!.id, 'ATTEMPT_RESET', 'Test', body.testId, { candidateId: req.params.id, sessions: ids.length });
    res.json({ ok: true, deletedSessions: ids.length });
  }),
);

export default router;
