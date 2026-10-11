import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { audit } from '../../services/audit';
import { AppError, asyncHandler } from '../../utils/http';

const router = Router();

const questionInclude = {
  options: { orderBy: { displayOrder: 'asc' as const } },
  coding: { include: { testCases: { orderBy: { createdAt: 'asc' as const } } } },
  _count: { select: { testQuestions: true } },
};

const optionSchema = z.object({
  optionText: z.string().min(1),
  isCorrect: z.boolean().default(false),
  displayOrder: z.number().int().min(0).default(0),
});

const codingSchema = z.object({
  inputFormat: z.string().optional(),
  outputFormat: z.string().optional(),
  constraints: z.string().optional(),
  sampleInput: z.string().optional(),
  sampleOutput: z.string().optional(),
  explanation: z.string().optional(),
  timeLimitMs: z.number().int().min(100).max(60_000).default(2000),
  memoryLimitMb: z.number().int().min(16).max(2048).default(256),
  maxCodeLength: z.number().int().min(100).max(200_000).default(20000),
  allowedLanguages: z.string().default('python,java,cpp'),
});

const testCaseSchema = z.object({
  inputData: z.string().default(''),
  expectedOutput: z.string(),
  weight: z.number().min(0).default(1),
  isHidden: z.boolean().default(true),
  timeoutMs: z.number().int().min(100).max(60_000).default(2000),
});

const questionSchema = z.object({
  type: z.enum(['MCQ', 'CODING']),
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).default('MEDIUM'),
  category: z.string().optional(),
  tags: z.string().optional(),
  marks: z.number().min(0).max(1000).default(1),
  negativeMarks: z.number().min(0).max(1000).default(0),
  explanation: z.string().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).default('ACTIVE'),
  options: z.array(optionSchema).optional(),
  coding: codingSchema.optional(),
  testCases: z.array(testCaseSchema).optional(),
});

function validateMcq(body: z.infer<typeof questionSchema>) {
  if (body.type !== 'MCQ') return;
  const options = body.options ?? [];
  if (options.length < 2) throw new AppError(400, 'An MCQ needs at least two options');
  if (!options.some((o) => o.isCorrect)) throw new AppError(400, 'Mark at least one option as correct');
}

router.get(
  '/questions',
  asyncHandler(async (req, res) => {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const difficulty = typeof req.query.difficulty === 'string' ? req.query.difficulty : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

    const questions = await prisma.question.findMany({
      where: {
        ...(type ? { type } : {}),
        ...(difficulty ? { difficulty } : {}),
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        ...(search
          ? { OR: [{ title: { contains: search } }, { tags: { contains: search } }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: questionInclude,
    });
    res.json({ questions });
  }),
);

router.get(
  '/questions/:id',
  asyncHandler(async (req, res) => {
    const question = await prisma.question.findUnique({
      where: { id: req.params.id },
      include: questionInclude,
    });
    if (!question) throw new AppError(404, 'Question not found');
    res.json({ question });
  }),
);

router.post(
  '/questions',
  asyncHandler(async (req, res) => {
    const body = questionSchema.parse(req.body);
    validateMcq(body);

    const question = await prisma.question.create({
      data: {
        type: body.type,
        title: body.title,
        description: body.description,
        difficulty: body.difficulty,
        category: body.category,
        tags: body.tags,
        marks: body.marks,
        negativeMarks: body.negativeMarks,
        explanation: body.explanation,
        status: body.status,
        createdById: req.user!.id,
        options:
          body.type === 'MCQ' && body.options
            ? { create: body.options.map((o, i) => ({ ...o, displayOrder: o.displayOrder ?? i })) }
            : undefined,
        coding:
          body.type === 'CODING' && body.coding
            ? {
                create: {
                  ...body.coding,
                  testCases:
                    body.testCases && body.testCases.length > 0 ? { create: body.testCases } : undefined,
                },
              }
            : undefined,
      },
      include: questionInclude,
    });

    await audit(req.user!.id, 'QUESTION_CREATED', 'Question', question.id, { type: question.type });
    res.status(201).json({ question });
  }),
);

router.put(
  '/questions/:id',
  asyncHandler(async (req, res) => {
    const body = questionSchema.parse(req.body);
    validateMcq(body);
    const existing = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError(404, 'Question not found');

    const question = await prisma.$transaction(async (tx) => {
      await tx.questionOption.deleteMany({ where: { questionId: existing.id } });
      if (body.type === 'CODING') {
        await tx.codingTestCase.deleteMany({ where: { questionId: existing.id } });
      }

      return tx.question.update({
        where: { id: existing.id },
        data: {
          type: body.type,
          title: body.title,
          description: body.description,
          difficulty: body.difficulty,
          category: body.category,
          tags: body.tags,
          marks: body.marks,
          negativeMarks: body.negativeMarks,
          explanation: body.explanation,
          status: body.status,
          options:
            body.type === 'MCQ' && body.options
              ? { create: body.options.map((o, i) => ({ ...o, displayOrder: o.displayOrder ?? i })) }
              : undefined,
          coding:
            body.type === 'CODING' && body.coding
              ? {
                  upsert: {
                    create: {
                      ...body.coding,
                      testCases:
                        body.testCases && body.testCases.length > 0 ? { create: body.testCases } : undefined,
                    },
                    update: {
                      ...body.coding,
                      testCases:
                        body.testCases && body.testCases.length > 0 ? { create: body.testCases } : undefined,
                    },
                  },
                }
              : undefined,
        },
        include: questionInclude,
      });
    });

    await audit(req.user!.id, 'QUESTION_UPDATED', 'Question', question.id);
    res.json({ question });
  }),
);

router.post(
  '/questions/:id/duplicate',
  asyncHandler(async (req, res) => {
    const source = await prisma.question.findUnique({
      where: { id: req.params.id },
      include: { options: true, coding: { include: { testCases: true } } },
    });
    if (!source) throw new AppError(404, 'Question not found');

    const copy = await prisma.question.create({
      data: {
        type: source.type,
        title: `${source.title} (copy)`,
        description: source.description,
        difficulty: source.difficulty,
        category: source.category,
        tags: source.tags,
        marks: source.marks,
        negativeMarks: source.negativeMarks,
        explanation: source.explanation,
        status: source.status,
        createdById: req.user!.id,
        options:
          source.type === 'MCQ'
            ? {
                create: source.options.map((o) => ({
                  optionText: o.optionText,
                  isCorrect: o.isCorrect,
                  displayOrder: o.displayOrder,
                })),
              }
            : undefined,
        coding: source.coding
          ? {
              create: {
                inputFormat: source.coding.inputFormat,
                outputFormat: source.coding.outputFormat,
                constraints: source.coding.constraints,
                sampleInput: source.coding.sampleInput,
                sampleOutput: source.coding.sampleOutput,
                explanation: source.coding.explanation,
                timeLimitMs: source.coding.timeLimitMs,
                memoryLimitMb: source.coding.memoryLimitMb,
                maxCodeLength: source.coding.maxCodeLength,
                allowedLanguages: source.coding.allowedLanguages,
                testCases: {
                  create: source.coding.testCases.map((tc) => ({
                    inputData: tc.inputData,
                    expectedOutput: tc.expectedOutput,
                    weight: tc.weight,
                    isHidden: tc.isHidden,
                    timeoutMs: tc.timeoutMs,
                  })),
                },
              },
            }
          : undefined,
      },
      include: questionInclude,
    });

    await audit(req.user!.id, 'QUESTION_DUPLICATED', 'Question', copy.id, { from: source.id });
    res.status(201).json({ question: copy });
  }),
);

// Archive when in use; hard-delete only when not referenced by any test.
router.delete(
  '/questions/:id',
  asyncHandler(async (req, res) => {
    const question = await prisma.question.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { testQuestions: true } } },
    });
    if (!question) throw new AppError(404, 'Question not found');

    if (question._count.testQuestions > 0) {
      await prisma.question.update({ where: { id: question.id }, data: { status: 'ARCHIVED' } });
      await audit(req.user!.id, 'QUESTION_ARCHIVED', 'Question', question.id);
      return res.json({ ok: true, archived: true });
    }

    await prisma.question.delete({ where: { id: question.id } });
    await audit(req.user!.id, 'QUESTION_DELETED', 'Question', question.id);
    res.json({ ok: true, archived: false });
  }),
);

export default router;
