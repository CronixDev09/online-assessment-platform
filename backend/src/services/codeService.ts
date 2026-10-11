import { prisma } from '../db';
import { judge } from './judge';
import type { JudgeCase, JudgeResult } from './judge';

export class CodeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function toCases(
  testCases: { id: string; inputData: string; expectedOutput: string; isHidden: boolean; timeoutMs: number; weight: number }[],
  includeHidden: boolean,
): JudgeCase[] {
  return testCases
    .filter((tc) => includeHidden || !tc.isHidden)
    .map((tc, i) => ({
      id: tc.id,
      label: tc.isHidden ? `Hidden #${i + 1}` : `Sample #${i + 1}`,
      input: tc.inputData,
      expectedOutput: tc.expectedOutput,
      isHidden: tc.isHidden,
      timeoutMs: tc.timeoutMs,
      weight: tc.weight,
    }));
}

async function loadCodingQuestion(questionId: string) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { coding: { include: { testCases: true } } },
  });
  if (!question || question.type !== 'CODING' || !question.coding) {
    throw new CodeError(404, 'Coding question not found');
  }
  return question;
}

function assertLanguage(allowed: string, language: string) {
  const list = allowed.split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.includes(language)) {
    throw new CodeError(400, `Language "${language}" is not allowed for this question`);
  }
}

/** Runs code against the visible (sample) cases only. Nothing is persisted. */
export async function runSamples(
  questionId: string,
  language: string,
  sourceCode: string,
): Promise<JudgeResult> {
  const question = await loadCodingQuestion(questionId);
  const coding = question.coding!;
  assertLanguage(coding.allowedLanguages, language);

  const cases = toCases(coding.testCases, false);
  if (cases.length === 0) {
    throw new CodeError(400, 'This question has no sample test cases configured');
  }

  return judge({
    language,
    code: sourceCode,
    cases,
    timeLimitMs: coding.timeLimitMs,
    memoryLimitMb: coding.memoryLimitMb,
    maxCodeBytes: coding.maxCodeLength,
  });
}

/**
 * Runs code against ALL test cases and stores a CodeSubmission with per-case
 * results. Hidden cases never persist their stdout/expected output.
 */
export async function evaluateAndStore(
  sessionId: string,
  questionId: string,
  language: string,
  sourceCode: string,
  kind: 'RUN' | 'SUBMIT',
  marks: number,
) {
  const question = await loadCodingQuestion(questionId);
  const coding = question.coding!;
  assertLanguage(coding.allowedLanguages, language);

  if (Buffer.byteLength(sourceCode, 'utf8') > coding.maxCodeLength) {
    throw new CodeError(400, `Source code exceeds the maximum length of ${coding.maxCodeLength} bytes`);
  }

  const cases = toCases(coding.testCases, true);
  const result =
    cases.length > 0
      ? await judge({
          language,
          code: sourceCode,
          cases,
          timeLimitMs: coding.timeLimitMs,
          memoryLimitMb: coding.memoryLimitMb,
          maxCodeBytes: coding.maxCodeLength,
        })
      : {
          status: 'INTERNAL_ERROR' as const,
          executionTime: 0,
          passedCases: 0,
          totalCases: 0,
          cases: [],
          engine: 'local' as const,
          message: 'No test cases configured for this question',
        };

  const passedWeight = result.cases
    .filter((c) => c.status === 'ACCEPTED')
    .reduce((sum, c) => sum + (c.testCaseId ? (coding.testCases.find((t) => t.id === c.testCaseId)?.weight ?? 1) : 1), 0);
  const totalWeight = coding.testCases.reduce((sum, tc) => sum + tc.weight, 0) || 1;
  const score = Math.round(((passedWeight / totalWeight) * marks + Number.EPSILON) * 100) / 100;

  const submission = await prisma.codeSubmission.create({
    data: {
      sessionId,
      questionId,
      language,
      sourceCode,
      kind,
      status: result.status,
      score,
      maxScore: marks,
      executionTime: result.executionTime,
      memoryUsed: result.memoryUsed ?? null,
      passedCases: result.passedCases,
      totalCases: result.totalCases,
      compileOutput: result.compileOutput ?? (result.message ?? null),
      caseResults: {
        create: result.cases.map((c) => ({
          testCaseId: c.testCaseId,
          label: c.label,
          isHidden: c.isHidden,
          status: c.status,
          executionTime: c.executionTime,
          memoryUsed: c.memoryUsed ?? null,
          stdout: c.isHidden ? null : c.stdout.slice(0, 4000),
          stderr: c.isHidden ? null : c.stderr.slice(0, 4000),
          expected: c.isHidden ? null : c.expected.slice(0, 4000),
        })),
      },
    },
    include: { caseResults: true },
  });

  return submission;
}

export function publicSubmission(submission: {
  id: string;
  language: string;
  status: string;
  score: number;
  maxScore: number;
  executionTime: number | null;
  passedCases: number;
  totalCases: number;
  compileOutput: string | null;
  submittedAt: Date;
  caseResults?: {
    id: string;
    label: string | null;
    isHidden: boolean;
    status: string;
    executionTime: number | null;
    stdout: string | null;
    stderr: string | null;
    expected: string | null;
  }[];
}) {
  return {
    id: submission.id,
    language: submission.language,
    status: submission.status,
    score: submission.score,
    maxScore: submission.maxScore,
    executionTime: submission.executionTime,
    passedCases: submission.passedCases,
    totalCases: submission.totalCases,
    compileOutput: submission.compileOutput,
    submittedAt: submission.submittedAt,
    caseResults: (submission.caseResults ?? []).map((c) => ({
      id: c.id,
      label: c.label,
      isHidden: c.isHidden,
      status: c.status,
      executionTime: c.executionTime,
      // Hidden case details are never exposed to candidates.
      stdout: c.isHidden ? null : c.stdout,
      stderr: c.isHidden ? null : c.stderr,
      expected: c.isHidden ? null : c.expected,
    })),
  };
}
