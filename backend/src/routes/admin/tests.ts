import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { audit, notify } from '../../services/audit';
import { AppError, asyncHandler, parseJson } from '../../utils/http';

const router = Router();

async function recomputeTestMarks(testId: string): Promise<number> {
  const rows = await prisma.testQuestion.findMany({
    where: { testId },
    include: { question: { select: { marks: true } } },
  });
  const total = rows.reduce((sum, r) => sum + (r.marksOverride ?? r.question.marks), 0);
  await prisma.test.update({ where: { id: testId }, data: { totalMarks: Math.round(total * 100) / 100 } });
  return total;
}

const testSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  category: z.string().optional(),
  instructions: z.string().optional(),
  durationMinutes: z.number().int().min(1).max(1440).default(60),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  passingMarks: z.number().min(0).default(0),
  negativeMarkingEnabled: z.boolean().default(false),
  randomizeQuestions: z.boolean().default(false),
  randomizeOptions: z.boolean().default(false),
  proctoringEnabled: z.boolean().default(true),
  leaderboardEnabled: z.boolean().default(true),
  autoSubmit: z.boolean().default(true),
  resultVisibility: z.boolean().default(true),
  showAnswerKey: z.boolean().default(false),
  maxAttempts: z.number().int().min(1).max(20).default(1),
  allowedLanguages: z.string().default('python,java,cpp'),
  status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).default('DRAFT'),
});

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

router.get(
  '/tests',
  asyncHandler(async (_req, res) => {
    const tests = await prisma.test.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { testQuestions: true, assignments: true, sessions: true } },
      },
    });
    res.json({ tests });
  }),
);

router.post(
  '/tests',
  asyncHandler(async (req, res) => {
    const body = testSchema.parse(req.body);
    const test = await prisma.test.create({
      data: {
        ...body,
        startAt: toDate(body.startAt),
        endAt: toDate(body.endAt),
        createdById: req.user!.id,
      },
    });
    await audit(req.user!.id, 'TEST_CREATED', 'Test', test.id, { title: test.title });
    res.status(201).json({ test });
  }),
);

router.get(
  '/tests/:id',
  asyncHandler(async (req, res) => {
    const test = await prisma.test.findUnique({
      where: { id: req.params.id },
      include: {
        testQuestions: {
          orderBy: { displayOrder: 'asc' },
          include: { question: { select: { id: true, type: true, title: true, marks: true, difficulty: true, status: true } } },
        },
        assignments: {
          include: { candidate: { select: { id: true, name: true, email: true, status: true } } },
        },
        _count: { select: { sessions: true } },
      },
    });
    if (!test) throw new AppError(404, 'Test not found');
    res.json({ test });
  }),
);

router.put(
  '/tests/:id',
  asyncHandler(async (req, res) => {
    const body = testSchema.partial().parse(req.body);
    const existing = await prisma.test.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Test not found');
    const test = await prisma.test.update({
      where: { id: existing.id },
      data: {
        ...body,
        startAt: toDate(body.startAt),
        endAt: toDate(body.endAt),
      },
    });
    await audit(req.user!.id, 'TEST_UPDATED', 'Test', test.id);
    res.json({ test });
  }),
);

router.delete(
  '/tests/:id',
  asyncHandler(async (req, res) => {
    const test = await prisma.test.findUnique({ where: { id: req.params.id } });
    if (!test) throw new AppError(404, 'Test not found');
    await prisma.test.update({ where: { id: test.id }, data: { status: 'ARCHIVED' } });
    await audit(req.user!.id, 'TEST_ARCHIVED', 'Test', test.id);
    res.json({ ok: true });
  }),
);

router.put(
  '/tests/:id/questions',
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        items: z.array(
          z.object({
            questionId: z.string().min(1),
            displayOrder: z.number().int().min(0).optional(),
            marksOverride: z.number().min(0).nullable().optional(),
          }),
        ),
      })
      .parse(req.body);

    const test = await prisma.test.findUnique({ where: { id: req.params.id } });
    if (!test) throw new AppError(404, 'Test not found');

    await prisma.$transaction(async (tx) => {
      await tx.testQuestion.deleteMany({ where: { testId: test.id } });
      for (let i = 0; i < body.items.length; i += 1) {
        const item = body.items[i];
        await tx.testQuestion.create({
          data: {
            testId: test.id,
            questionId: item.questionId,
            displayOrder: item.displayOrder ?? i,
            marksOverride: item.marksOverride ?? null,
          },
        });
      }
    });

    const total = await recomputeTestMarks(test.id);
    await audit(req.user!.id, 'TEST_QUESTIONS_UPDATED', 'Test', test.id, { count: body.items.length });
    res.json({ ok: true, totalMarks: total });
  }),
);

router.post(
  '/tests/:id/assign',
  asyncHandler(async (req, res) => {
    const body = z.object({ candidateIds: z.array(z.string().min(1)).min(1) }).parse(req.body);
    const test = await prisma.test.findUnique({ where: { id: req.params.id } });
    if (!test) throw new AppError(404, 'Test not found');

    const candidates = await prisma.user.findMany({
      where: { id: { in: body.candidateIds }, role: 'CANDIDATE' },
      select: { id: true },
    });

    for (const c of candidates) {
      await prisma.testAssignment.upsert({
        where: { testId_candidateId: { testId: test.id, candidateId: c.id } },
        create: { testId: test.id, candidateId: c.id },
        update: { status: 'ASSIGNED' },
      });
      await notify(c.id, 'New test assigned', `You have been assigned: ${test.title}`);
    }

    await audit(req.user!.id, 'TEST_ASSIGNED', 'Test', test.id, { candidateIds: candidates.map((c) => c.id) });
    res.json({ ok: true, assigned: candidates.length });
  }),
);

router.delete(
  '/tests/:id/assign/:candidateId',
  asyncHandler(async (req, res) => {
    await prisma.testAssignment.deleteMany({
      where: { testId: req.params.id, candidateId: req.params.candidateId },
    });
    await audit(req.user!.id, 'TEST_UNASSIGNED', 'Test', req.params.id, { candidateId: req.params.candidateId });
    res.json({ ok: true });
  }),
);

router.post(
  '/tests/:id/publish',
  asyncHandler(async (req, res) => {
    const body = z.object({ status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'COMPLETED', 'ARCHIVED']).optional() }).parse(req.body ?? {});
    const test = await prisma.test.findUnique({
      where: { id: req.params.id },
      include: { testQuestions: true, assignments: true },
    });
    if (!test) throw new AppError(404, 'Test not found');
    if (test.testQuestions.length === 0) throw new AppError(400, 'Add at least one question before publishing');

    const status = body.status ?? (test.startAt && test.startAt > new Date() ? 'SCHEDULED' : 'ACTIVE');
    await recomputeTestMarks(test.id);
    const updated = await prisma.test.update({ where: { id: test.id }, data: { status } });

    for (const a of test.assignments) {
      await notify(a.candidateId, 'Test published', `${test.title} is now available.`);
    }
    await audit(req.user!.id, 'TEST_PUBLISHED', 'Test', test.id, { status });
    res.json({ test: updated });
  }),
);

router.get(
  '/tests/:id/monitoring',
  asyncHandler(async (req, res) => {
    const sessions = await prisma.testSession.findMany({
      where: { testId: req.params.id, status: 'IN_PROGRESS' },
      include: {
        candidate: { select: { id: true, name: true, email: true } },
        violations: { select: { type: true, severity: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    const now = Date.now();
    res.json({
      active: sessions.map((s) => ({
        sessionId: s.id,
        candidate: s.candidate,
        startedAt: s.startedAt,
        expiresAt: s.expiresAt,
        remainingSeconds: Math.max(0, Math.floor((s.expiresAt.getTime() - now) / 1000)),
        lastHeartbeatAt: s.lastHeartbeatAt,
        connected: s.lastHeartbeatAt ? now - s.lastHeartbeatAt.getTime() < 45_000 : false,
        violationCount: s.violations.length,
        highestSeverity: s.violations.some((v) => v.severity === 'CRITICAL')
          ? 'CRITICAL'
          : s.violations.some((v) => v.severity === 'HIGH')
            ? 'HIGH'
            : s.violations.some((v) => v.severity === 'MEDIUM')
              ? 'MEDIUM'
              : s.violations.length > 0
                ? 'LOW'
                : null,
      })),
    });
  }),
);

router.get(
  '/tests/:id/activity',
  asyncHandler(async (req, res) => {
    const sessions = await prisma.testSession.findMany({
      where: { testId: req.params.id },
      select: { id: true },
    });
    const logs = await prisma.activityLog.findMany({
      where: { sessionId: { in: sessions.map((s) => s.id) } },
      orderBy: { timestamp: 'desc' },
      take: 500,
    });
    res.json({
      logs: logs.map((l) => ({
        id: l.id,
        sessionId: l.sessionId,
        candidateId: l.candidateId,
        eventType: l.eventType,
        severity: l.severity,
        timestamp: l.timestamp,
        metadata: parseJson<unknown>(l.metadata, null),
        ipAddress: l.ipAddress,
        userAgent: l.userAgent,
      })),
    });
  }),
);

export default router;
