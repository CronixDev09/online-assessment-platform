import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware';
import {
  getResultForSession,
  getSessionState,
  saveAnswer,
  saveCodeDraft,
  submitSession,
} from '../services/sessionService';
import { asyncHandler } from '../utils/http';

const router = Router();
router.use(authenticate);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const state = await getSessionState(req.params.id, req.user!);
    res.json(state);
  }),
);

const answerSchema = z.object({
  questionId: z.string().min(1),
  selectedOptionIds: z.array(z.string()).max(20),
});

router.post(
  '/:id/answer',
  asyncHandler(async (req, res) => {
    const body = answerSchema.parse(req.body);
    const saved = await saveAnswer(req.params.id, req.user!.id, body.questionId, body.selectedOptionIds);
    res.json({ ok: true, savedAt: saved.savedAt, version: saved.version });
  }),
);

const codeDraftSchema = z.object({
  questionId: z.string().min(1),
  language: z.string().min(1),
  sourceCode: z.string().max(100_000),
});

router.post(
  '/:id/code',
  asyncHandler(async (req, res) => {
    const body = codeDraftSchema.parse(req.body);
    const saved = await saveCodeDraft(
      req.params.id,
      req.user!.id,
      body.questionId,
      body.language,
      body.sourceCode,
    );
    res.json({ ok: true, savedAt: saved.savedAt, version: saved.version });
  }),
);

const submitSchema = z.object({ reason: z.enum(['CANDIDATE', 'TIME_EXPIRED']).optional() });

router.post(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    const body = submitSchema.parse(req.body ?? {});
    const { alreadyFinal, result } = await submitSession(
      req.params.id,
      req.user!.id,
      body.reason ?? 'CANDIDATE',
    );
    res.json({ ok: true, alreadyFinal, resultId: result?.id ?? null });
  }),
);

router.get(
  '/:id/result',
  asyncHandler(async (req, res) => {
    const result = await getResultForSession(req.params.id, req.user!);
    res.json({ result });
  }),
);

export default router;
