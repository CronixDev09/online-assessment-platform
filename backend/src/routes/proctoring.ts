import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate } from '../auth/middleware';
import { logActivity } from '../services/audit';
import { DEFAULT_VIOLATION_POLICY, registerViolation } from '../services/proctoring';
import { finalizeSession } from '../services/sessionService';
import { AppError, asyncHandler } from '../utils/http';

const router = Router();
router.use(authenticate);

const KNOWN_EVENTS = new Set(Object.keys(DEFAULT_VIOLATION_POLICY));

async function ownedSession(sessionId: string, userId: string) {
  const session = await prisma.testSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError(404, 'Session not found', 'SESSION_NOT_FOUND');
  if (session.candidateId !== userId) throw new AppError(403, 'Not your session', 'FORBIDDEN');
  return session;
}

router.post(
  '/session',
  asyncHandler(async (req, res) => {
    const body = z.object({ sessionId: z.string().min(1) }).parse(req.body);
    const session = await ownedSession(body.sessionId, req.user!.id);
    await prisma.testSession.update({
      where: { id: session.id },
      data: { lastHeartbeatAt: new Date() },
    });
    await logActivity('PROCTORING_STARTED', { sessionId: session.id, candidateId: session.candidateId });
    res.json({ ok: true, status: session.status });
  }),
);

const eventSchema = z.object({
  sessionId: z.string().min(1),
  type: z.string().min(1),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  description: z.string().max(500).optional(),
  metadata: z.unknown().optional(),
});

router.post(
  '/events',
  asyncHandler(async (req, res) => {
    const body = eventSchema.parse(req.body);
    await ownedSession(body.sessionId, req.user!.id);

    if (!KNOWN_EVENTS.has(body.type)) {
      throw new AppError(400, `Unknown proctoring event type: ${body.type}`, 'UNKNOWN_EVENT');
    }

    const outcome = await registerViolation({
      sessionId: body.sessionId,
      type: body.type,
      severity: body.severity,
      description: body.description,
      metadata: body.metadata,
    });

    res.status(201).json({
      ok: true,
      warningCount: outcome.warningCount,
      severity: outcome.severity,
      // The candidate sees their warning tally; internal detection specifics stay server-side.
      warningsAllowed: outcome.threshold.disqualifyAfter,
      action: outcome.action,
    });
  }),
);

router.post(
  '/heartbeat',
  asyncHandler(async (req, res) => {
    const body = z.object({ sessionId: z.string().min(1) }).parse(req.body);
    const session = await ownedSession(body.sessionId, req.user!.id);

    if (session.status !== 'IN_PROGRESS') {
      return res.json({ status: session.status, remainingSeconds: 0, serverNow: new Date() });
    }

    const now = new Date();
    await prisma.testSession.update({ where: { id: session.id }, data: { lastHeartbeatAt: now } });

    if (session.expiresAt <= now) {
      await finalizeSession(session.id, 'TIME_EXPIRED');
      return res.json({ status: 'EXPIRED', remainingSeconds: 0, serverNow: now });
    }

    res.json({
      status: session.status,
      remainingSeconds: Math.max(0, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000)),
      serverNow: now,
    });
  }),
);

router.post(
  '/disconnect',
  asyncHandler(async (req, res) => {
    const body = z.object({ sessionId: z.string().min(1) }).parse(req.body);
    const session = await ownedSession(body.sessionId, req.user!.id);
    await prisma.testSession.update({
      where: { id: session.id },
      data: { disconnectCount: { increment: 1 } },
    });
    await logActivity('CONNECTION_LOST', {
      sessionId: session.id,
      candidateId: session.candidateId,
      severity: 'LOW',
    });
    res.json({ ok: true, disconnectCount: session.disconnectCount + 1 });
  }),
);

export default router;
