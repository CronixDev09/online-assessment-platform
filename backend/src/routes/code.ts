import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate } from '../auth/middleware';
import { evaluateAndStore, publicSubmission, runSamples } from '../services/codeService';
import { saveCodeDraft } from '../services/sessionService';
import { AppError, asyncHandler } from '../utils/http';

const router = Router();
router.use(authenticate);

async function loadActiveSession(sessionId: string, userId: string) {
  const session = await prisma.testSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError(404, 'Session not found', 'SESSION_NOT_FOUND');
  if (session.candidateId !== userId) throw new AppError(403, 'Not your session', 'FORBIDDEN');
  if (session.status !== 'IN_PROGRESS') throw new AppError(409, 'This session is no longer active', 'SESSION_CLOSED');
  if (session.expiresAt <= new Date()) throw new AppError(409, 'Time is up for this session', 'SESSION_EXPIRED');
  return session;
}

async function marksForQuestion(sessionId: string, questionId: string): Promise<number> {
  const session = await prisma.testSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new AppError(404, 'Session not found');
  const tq = await prisma.testQuestion.findUnique({
    where: { testId_questionId: { testId: session.testId, questionId } },
    include: { question: true },
  });
  if (!tq) throw new AppError(403, 'This question is not part of the active test', 'NOT_IN_TEST');
  return tq.marksOverride ?? tq.question.marks;
}

const runSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  language: z.string().min(1),
  sourceCode: z.string().max(100_000),
});

router.post(
  '/run',
  asyncHandler(async (req, res) => {
    const body = runSchema.parse(req.body);
    await loadActiveSession(body.sessionId, req.user!.id);
    // Persist the latest code so a crash/refresh never loses work.
    await saveCodeDraft(body.sessionId, req.user!.id, body.questionId, body.language, body.sourceCode);

    const result = await runSamples(body.questionId, body.language, body.sourceCode);
    res.json({ result });
  }),
);

const submitSchema = runSchema;

router.post(
  '/submit',
  asyncHandler(async (req, res) => {
    const body = submitSchema.parse(req.body);
    await loadActiveSession(body.sessionId, req.user!.id);
    await saveCodeDraft(body.sessionId, req.user!.id, body.questionId, body.language, body.sourceCode);

    const marks = await marksForQuestion(body.sessionId, body.questionId);
    const submission = await evaluateAndStore(
      body.sessionId,
      body.questionId,
      body.language,
      body.sourceCode,
      'SUBMIT',
      marks,
    );
    res.status(201).json({ submission: publicSubmission(submission) });
  }),
);

router.get(
  '/submissions/:id',
  asyncHandler(async (req, res) => {
    const submission = await prisma.codeSubmission.findUnique({
      where: { id: req.params.id },
      include: { caseResults: true, session: true },
    });
    if (!submission) throw new AppError(404, 'Submission not found');
    if (req.user!.role !== 'ADMIN' && submission.session.candidateId !== req.user!.id) {
      throw new AppError(403, 'You do not have access to this submission', 'FORBIDDEN');
    }
    res.json({ submission: publicSubmission(submission) });
  }),
);

export default router;
