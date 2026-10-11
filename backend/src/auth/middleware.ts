import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../db';
import { AppError } from '../utils/http';
import { readAccessToken, verifyAccessToken } from './tokens';

/** Requires a valid access token. Verifies the user still exists and is active. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readAccessToken(req);
    if (!token) throw new AppError(401, 'Authentication required', 'UNAUTHENTICATED');

    let claims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      throw new AppError(401, 'Invalid or expired session', 'TOKEN_INVALID');
    }

    const user = await prisma.user.findUnique({
      where: { id: claims.id },
      select: { id: true, role: true, email: true, name: true, status: true },
    });
    if (!user) throw new AppError(401, 'Account no longer exists', 'NO_USER');
    if (user.status !== 'ACTIVE') throw new AppError(403, 'Account is disabled', 'ACCOUNT_DISABLED');

    req.user = { id: user.id, role: user.role, email: user.email, name: user.name };
    next();
  } catch (err) {
    next(err);
  }
}

/** Attaches the user if a valid token is present, but never rejects. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = readAccessToken(req);
    if (!token) return next();
    const claims = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: claims.id },
      select: { id: true, role: true, email: true, name: true, status: true },
    });
    if (user && user.status === 'ACTIVE') {
      req.user = { id: user.id, role: user.role, email: user.email, name: user.name };
    }
  } catch {
    /* ignore */
  }
  next();
}

/** Role guard. Must run after `authenticate`. */
export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'Authentication required', 'UNAUTHENTICATED'));
    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, 'You do not have permission to perform this action', 'FORBIDDEN'));
    }
    next();
  };
}
