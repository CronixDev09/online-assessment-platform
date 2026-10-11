import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { config, isProd } from '../config';
import { prisma } from '../db';

export const ACCESS_COOKIE = 'oat_at';
export const REFRESH_COOKIE = 'oat_rt';

export interface TokenUser {
  id: string;
  role: string;
  email: string;
  name: string;
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function signAccessToken(user: TokenUser): string {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, name: user.name },
    config.JWT_ACCESS_SECRET,
    { expiresIn: config.ACCESS_TOKEN_TTL_SECONDS },
  );
}

function signRefreshToken(userId: string, jti: string): string {
  return jwt.sign({ sub: userId, jti }, config.JWT_REFRESH_SECRET, {
    expiresIn: config.REFRESH_TOKEN_TTL_SECONDS,
  });
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

export async function issueTokens(user: TokenUser): Promise<IssuedTokens> {
  const accessToken = signAccessToken(user);
  const jti = crypto.randomUUID();
  const refreshToken = signRefreshToken(user.id, jti);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): TokenUser & { sub: string } {
  const payload = jwt.verify(token, config.JWT_ACCESS_SECRET) as jwt.JwtPayload & {
    sub: string;
    role: string;
    email: string;
    name: string;
  };
  if (!payload.sub) throw new Error('Invalid access token');
  return { id: payload.sub, sub: payload.sub, role: payload.role, email: payload.email, name: payload.name };
}

export function verifyRefreshToken(token: string): { sub: string; jti: string } {
  const payload = jwt.verify(token, config.JWT_REFRESH_SECRET) as jwt.JwtPayload & {
    sub: string;
    jti: string;
  };
  if (!payload.sub || !payload.jti) throw new Error('Invalid refresh token');
  return { sub: payload.sub, jti: payload.jti };
}

const baseCookie = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.COOKIE_SECURE || isProd,
  path: '/',
};

export function setAuthCookies(res: Response, tokens: IssuedTokens): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookie,
    maxAge: config.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookie,
    maxAge: config.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookie });
}

export function readAccessToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[ACCESS_COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}
