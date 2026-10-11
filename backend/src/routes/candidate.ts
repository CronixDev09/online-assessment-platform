import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate } from '../auth/middleware';
import {
  getCandidateTestDetail,
  listAssignedTests,
  listCandidateSubmissions,
  startSession,
} from '../services/sessionService';
import { AppError, asyncHandler } from '../utils/http';

const router = Router();
router.use(authenticate);

router.get(
  '/candidate/tests',
  asyncHandler(async (req, res) => {
    const tests = await listAssignedTests(req.user!.id);
    res.json({ tests });
  }),
);

router.get(
  '/candidate/tests/:id',
  asyncHandler(async (req, res) => {
    const detail = await getCandidateTestDetail(req.params.id, req.user!.id);
    if (!detail) throw new AppError(404, 'Test not found or not assigned to you', 'NOT_ASSIGNED');
    res.json({ test: detail });
  }),
);

router.post(
  '/tests/:id/start',
  asyncHandler(async (req, res) => {
    const session = await startSession(req.params.id, req.user!.id);
    res.status(201).json({ sessionId: session.id, expiresAt: session.expiresAt, attempt: session.attempt });
  }),
);

router.get(
  '/candidate/submissions',
  asyncHandler(async (req, res) => {
    const submissions = await listCandidateSubmissions(req.user!.id);
    res.json({ submissions });
  }),
);

router.get(
  '/candidate/profile',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, name: true, email: true, role: true, status: true,
        phone: true, organization: true, candidateCode: true, createdAt: true,
      },
    });
    res.json({ user });
  }),
);

router.get(
  '/candidate/notifications',
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const unread = notifications.filter((n) => !n.isRead).length;
    res.json({ notifications, unread });
  }),
);

router.post(
  '/candidate/notifications/:id/read',
  asyncHandler(async (req, res) => {
    const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!n || n.userId !== req.user!.id) throw new AppError(404, 'Notification not found');
    await prisma.notification.update({ where: { id: n.id }, data: { isRead: true } });
    res.json({ ok: true });
  }),
);

router.post(
  '/candidate/notifications/read-all',
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ ok: true });
  }),
);

// Expose the list of languages actually available on this host/judge, so the
// UI can disable unavailable options honestly.
router.get(
  '/candidate/languages',
  asyncHandler(async (_req, res) => {
    const { detectLocalRuntimes, getJudgeInfo } = await import('../services/judge');
    const local = await detectLocalRuntimes();
    res.json({ judge: getJudgeInfo(), local });
  }),
);

export default router;
