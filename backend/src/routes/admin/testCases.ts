import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { audit } from '../../services/audit';
import { judge } from '../../services/judge';
import { AppError, asyncHandler } from '../../utils/http';

const router = Router();

const caseSchema = z.object({
  questionId: z.string().min(1),
  inputData: z.string().default(''),
  expectedOutput: z.string(),
  weight: z.number().min(0).default(1),
  isHidden: z.boolean().default(true),
  timeoutMs: z.number().int().min(100).max(60_000).default(2000),
});

router.get(
  '/test-cases',
  asyncHandler(async (req, res) => {
    const questionId = typeof req.query.questionId === 'string' ? req.query.questionId : undefined;
    if (!questionId) throw new AppError(400, 'questionId is required');
    const testCases = await prisma.codingTestCase.findMany({
      where: { questionId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ testCases });
  }),
);

router.post(
  '/test-cases',
  asyncHandler(async (req, res) => {
    const body = caseSchema.parse(req.body);
    const coding = await prisma.codingQuestion.findUnique({ where: { questionId: body.questionId } });
    if (!coding) throw new AppError(404, 'Coding question not found');
    const testCase = await prisma.codingTestCase.create({ data: body });
    await audit(req.user!.id, 'TEST_CASE_CREATED', 'CodingTestCase', testCase.id);
    res.status(201).json({ testCase });
  }),
);

router.put(
  '/test-cases/:id',
  asyncHandler(async (req, res) => {
    const body = caseSchema.partial().parse(req.body);
    const existing = await prisma.codingTestCase.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Test case not found');
    const testCase = await prisma.codingTestCase.update({
      where: { id: existing.id },
      data: {
        inputData: body.inputData,
        expectedOutput: body.expectedOutput,
        weight: body.weight,
        isHidden: body.isHidden,
        timeoutMs: body.timeoutMs,
      },
    });
    await audit(req.user!.id, 'TEST_CASE_UPDATED', 'CodingTestCase', testCase.id);
    res.json({ testCase });
  }),
);

router.delete(
  '/test-cases/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.codingTestCase.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Test case not found');
    await prisma.codingTestCase.delete({ where: { id: existing.id } });
    await audit(req.user!.id, 'TEST_CASE_DELETED', 'CodingTestCase', existing.id);
    res.json({ ok: true });
  }),
);

// Admin dry-run: execute a candidate-style solution against a single case.
router.post(
  '/test-cases/:id/test',
  asyncHandler(async (req, res) => {
    const body = z.object({ language: z.string().min(1), sourceCode: z.string().max(100_000) }).parse(req.body);
    const testCase = await prisma.codingTestCase.findUnique({
      where: { id: req.params.id },
      include: { question: true },
    });
    if (!testCase) throw new AppError(404, 'Test case not found');

    const result = await judge({
      language: body.language,
      code: body.sourceCode,
      cases: [
        {
          id: testCase.id,
          label: 'Admin test case',
          input: testCase.inputData,
          expectedOutput: testCase.expectedOutput,
          isHidden: false,
          timeoutMs: testCase.timeoutMs,
        },
      ],
      timeLimitMs: testCase.question.timeLimitMs,
      memoryLimitMb: testCase.question.memoryLimitMb,
      maxCodeBytes: testCase.question.maxCodeLength,
    });

    res.json({ result });
  }),
);

router.post(
  '/test-cases/reorder',
  asyncHandler(async (req, res) => {
    const body = z.object({ orderedIds: z.array(z.string()) }).parse(req.body);
    await audit(req.user!.id, 'TEST_CASES_REORDERED', 'CodingTestCase', undefined, { count: body.orderedIds.length });
    res.json({ ok: true, orderedIds: body.orderedIds });
  }),
);

export default router;
