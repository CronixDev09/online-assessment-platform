import { prisma } from '../db';
import { parseJson } from '../utils/http';
import { notify, logActivity } from './audit';
import { evaluateAndStore } from './codeService';
import { evaluateSession } from './scoring';

// ---------------------------------------------------------------------------
// Seeded randomization (stable per session so refresh never reshuffles)
// ---------------------------------------------------------------------------
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], seedStr: string): T[] {
  const rnd = mulberry32(hashString(seedStr));
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function splitLanguages(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

interface QuestionCounts {
  mcq: number;
  coding: number;
  total: number;
}

async function getQuestionCounts(testId: string): Promise<QuestionCounts> {
  const rows = await prisma.testQuestion.findMany({
    where: { testId },
    select: { question: { select: { type: true } } },
  });
  const mcq = rows.filter((r) => r.question.type === 'MCQ').length;
  const coding = rows.filter((r) => r.question.type === 'CODING').length;
  return { mcq, coding, total: rows.length };
}

// ---------------------------------------------------------------------------
// Candidate test listing / detail
// ---------------------------------------------------------------------------
export type CandidateTestStatus = 'UPCOMING' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';

export async function listAssignedTests(candidateId: string) {
  const assignments = await prisma.testAssignment.findMany({
    where: { candidateId },
    include: {
      test: true,
      },
    orderBy: { assignedAt: 'desc' },
  });

  const out = [];
  for (const assignment of assignments) {
    const test = assignment.test;
    const counts = await getQuestionCounts(test.id);
    const sessions = await prisma.testSession.findMany({
      where: { testId: test.id, candidateId },
      orderBy: { createdAt: 'desc' },
      include: { result: true },
    });
    const inProgress = sessions.find((s) => s.status === 'IN_PROGRESS');
    const latestResult = sessions.find((s) => s.result)?.result ?? null;
    const now = new Date();

    let status: CandidateTestStatus = 'AVAILABLE';
    if (inProgress) status = 'IN_PROGRESS';
    else if (latestResult) status = 'COMPLETED';
    else if (test.startAt && now < test.startAt) status = 'UPCOMING';
    else if (test.endAt && now > test.endAt) status = 'EXPIRED';

    out.push({
      id: test.id,
      title: test.title,
      description: test.description,
      category: test.category,
      durationMinutes: test.durationMinutes,
      totalMarks: test.totalMarks,
      passingMarks: test.passingMarks,
      startAt: test.startAt,
      endAt: test.endAt,
      proctoringEnabled: test.proctoringEnabled,
      status,
      questionCounts: counts,
      attemptsUsed: sessions.filter((s) => s.status !== 'IN_PROGRESS').length,
      maxAttempts: test.maxAttempts,
      result: latestResult
        ? {
            sessionId: latestResult.sessionId,
            score: latestResult.score,
            maxScore: latestResult.maxScore,
            percentage: latestResult.percentage,
            passed: latestResult.passed,
          }
        : null,
    });
  }
  return out;
}

export async function getCandidateTestDetail(testId: string, candidateId: string) {
  const assignment = await prisma.testAssignment.findUnique({
    where: { testId_candidateId: { testId, candidateId } },
    include: { test: true },
  });
  if (!assignment) return null;
  const test = assignment.test;
  const counts = await getQuestionCounts(testId);
  return {
    id: test.id,
    title: test.title,
    description: test.description,
    category: test.category,
    instructions: test.instructions,
    durationMinutes: test.durationMinutes,
    totalMarks: test.totalMarks,
    passingMarks: test.passingMarks,
    negativeMarkingEnabled: test.negativeMarkingEnabled,
    proctoringEnabled: test.proctoringEnabled,
    allowedLanguages: splitLanguages(test.allowedLanguages),
    questionCounts: counts,
    maxAttempts: test.maxAttempts,
    startAt: test.startAt,
    endAt: test.endAt,
  };
}

// ---------------------------------------------------------------------------
// Session start / state
// ---------------------------------------------------------------------------
export async function startSession(testId: string, candidateId: string) {
  const assignment = await prisma.testAssignment.findUnique({
    where: { testId_candidateId: { testId, candidateId } },
    include: { test: true },
  });
  if (!assignment) {
    const err: any = new Error('This test is not assigned to you');
    err.status = 403;
    throw err;
  }

  const test = assignment.test;
  const now = new Date();
  if (test.status === 'DRAFT' || test.status === 'ARCHIVED') {
    const err: any = new Error('This test is not currently available');
    err.status = 400;
    throw err;
  }
  if (test.startAt && now < test.startAt) {
    const err: any = new Error('This test has not started yet');
    err.status = 400;
    throw err;
  }
  if (test.endAt && now > test.endAt) {
    const err: any = new Error('This test window has ended');
    err.status = 400;
    throw err;
  }

  const existing = await prisma.testSession.findFirst({
    where: { testId, candidateId, status: 'IN_PROGRESS' },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    if (existing.expiresAt <= now) {
      await finalizeSession(existing.id, 'TIME_EXPIRED');
      return prisma.testSession.findUniqueOrThrow({ where: { id: existing.id } });
    }
    return existing;
  }

  const usedAttempts = await prisma.testSession.count({
    where: { testId, candidateId, status: { not: 'IN_PROGRESS' } },
  });
  if (usedAttempts >= test.maxAttempts) {
    const err: any = new Error('You have used all allowed attempts for this test');
    err.status = 403;
    throw err;
  }

  let expiresAt = new Date(now.getTime() + test.durationMinutes * 60_000);
  if (test.endAt && test.endAt < expiresAt) expiresAt = test.endAt;

  const session = await prisma.testSession.create({
    data: { testId, candidateId, attempt: usedAttempts + 1, startedAt: now, expiresAt, status: 'IN_PROGRESS' },
  });
  await logActivity('TEST_STARTED', { sessionId: session.id, candidateId, metadata: { testId } });
  return session;
}

interface SessionQuestion {
  id: string;
  type: string;
  title: string;
  description: string | null;
  difficulty: string;
  marks: number;
  negativeMarks: number;
  order: number;
  options?: { id: string; optionText: string }[];
  coding?: {
    inputFormat: string | null;
    outputFormat: string | null;
    constraints: string | null;
    sampleInput: string | null;
    sampleOutput: string | null;
    explanation: string | null;
    timeLimitMs: number;
    memoryLimitMb: number;
    allowedLanguages: string[];
    sampleCases: { id: string; inputData: string; expectedOutput: string }[];
  };
}

export async function getSessionState(sessionId: string, user: { id: string; role: string }) {
  let session = await prisma.testSession.findUnique({
    where: { id: sessionId },
    include: {
      test: {
        include: {
          testQuestions: {
            orderBy: { displayOrder: 'asc' },
            include: {
              question: {
                include: {
                  options: { orderBy: { displayOrder: 'asc' } },
                  coding: { include: { testCases: true } },
                },
              },
            },
          },
        },
      },
      answers: true,
      codeSubmissions: { orderBy: { submittedAt: 'desc' } },
    },
  });

  if (!session) {
    const err: any = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  if (user.role !== 'ADMIN' && session.candidateId !== user.id) {
    const err: any = new Error('You do not have access to this session');
    err.status = 403;
    throw err;
  }

  const now = new Date();
  if (session.status === 'IN_PROGRESS' && session.expiresAt <= now) {
    await finalizeSession(session.id, 'TIME_EXPIRED');
    session = await prisma.testSession.findUniqueOrThrow({
      where: { id: sessionId },
      include: {
        test: {
          include: {
            testQuestions: {
              orderBy: { displayOrder: 'asc' },
              include: {
                question: {
                  include: {
                    options: { orderBy: { displayOrder: 'asc' } },
                    coding: { include: { testCases: true } },
                  },
                },
              },
            },
          },
        },
        answers: true,
        codeSubmissions: { orderBy: { submittedAt: 'desc' } },
      },
    });
  }

  const test = session.test;
  let questions: SessionQuestion[] = test.testQuestions.map((tq) => {
    const q = tq.question;
    const marks = tq.marksOverride ?? q.marks;
    const base: SessionQuestion = {
      id: q.id,
      type: q.type,
      title: q.title,
      description: q.description,
      difficulty: q.difficulty,
      marks,
      negativeMarks: q.negativeMarks,
      order: tq.displayOrder,
    };
    if (q.type === 'MCQ') {
      const opts = q.options.map((o) => ({ id: o.id, optionText: o.optionText }));
      base.options = test.randomizeOptions ? seededShuffle(opts, `${session.id}:${q.id}`) : opts;
    } else if (q.coding) {
      base.coding = {
        inputFormat: q.coding.inputFormat,
        outputFormat: q.coding.outputFormat,
        constraints: q.coding.constraints,
        sampleInput: q.coding.sampleInput,
        sampleOutput: q.coding.sampleOutput,
        explanation: q.coding.explanation,
        timeLimitMs: q.coding.timeLimitMs,
        memoryLimitMb: q.coding.memoryLimitMb,
        allowedLanguages: splitLanguages(q.coding.allowedLanguages),
        sampleCases: q.coding.testCases
          .filter((tc) => !tc.isHidden)
          .map((tc) => ({ id: tc.id, inputData: tc.inputData, expectedOutput: tc.expectedOutput })),
      };
    }
    return base;
  });

  if (test.randomizeQuestions) {
    questions = seededShuffle(questions, session.id);
  }

  const answers = session.answers.map((a) => ({
    questionId: a.questionId,
    selectedOptionIds: parseJson<string[]>(a.selectedOptionIds, []),
    answerText: a.answerText,
    savedAt: a.savedAt,
    version: a.version,
  }));

  const codeDrafts: Record<string, { language: string; sourceCode: string; savedAt: Date }> = {};
  const latestSubmissions: Record<string, unknown> = {};
  for (const sub of session.codeSubmissions) {
    if (!latestSubmissions[sub.questionId]) {
      latestSubmissions[sub.questionId] = {
        id: sub.id,
        status: sub.status,
        score: sub.score,
        passedCases: sub.passedCases,
        totalCases: sub.totalCases,
        language: sub.language,
        submittedAt: sub.submittedAt,
      };
    }
  }
  for (const a of session.answers) {
    const draft = parseJson<{ language: string; sourceCode: string } | null>(a.answerText, null);
    if (draft && typeof draft.sourceCode === 'string') {
      codeDrafts[a.questionId] = { language: draft.language, sourceCode: draft.sourceCode, savedAt: a.savedAt };
    }
  }

  const violationCount = await prisma.violation.count({ where: { sessionId: session.id } });

  return {
    sessionId: session.id,
    testId: test.id,
    test: {
      id: test.id,
      title: test.title,
      durationMinutes: test.durationMinutes,
      proctoringEnabled: test.proctoringEnabled,
      negativeMarkingEnabled: test.negativeMarkingEnabled,
      allowedLanguages: splitLanguages(test.allowedLanguages),
      passingMarks: test.passingMarks,
      totalMarks: test.totalMarks,
    },
    candidate: { id: session.candidateId },
    status: session.status,
    attempt: session.attempt,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    submittedAt: session.submittedAt,
    submissionReason: session.submissionReason,
    serverNow: now,
    remainingSeconds: Math.max(0, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000)),
    questions,
    answers,
    codeDrafts,
    latestSubmissions,
    violationCount,
  };
}

// ---------------------------------------------------------------------------
// Auto-save
// ---------------------------------------------------------------------------
async function assertWritableSession(sessionId: string, candidateId: string) {
  const session = await prisma.testSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    const err: any = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  if (session.candidateId !== candidateId) {
    const err: any = new Error('You do not have access to this session');
    err.status = 403;
    throw err;
  }
  if (session.status !== 'IN_PROGRESS') {
    const err: any = new Error('This test session is no longer active');
    err.status = 409;
    throw err;
  }
  if (session.expiresAt <= new Date()) {
    await finalizeSession(session.id, 'TIME_EXPIRED');
    const err: any = new Error('Time is up; the test was submitted automatically');
    err.status = 409;
    throw err;
  }
  return session;
}

export async function saveAnswer(
  sessionId: string,
  candidateId: string,
  questionId: string,
  selectedOptionIds: string[],
) {
  await assertWritableSession(sessionId, candidateId);
  return prisma.candidateAnswer.upsert({
    where: { sessionId_questionId: { sessionId, questionId } },
    create: { sessionId, questionId, selectedOptionIds: JSON.stringify(selectedOptionIds) },
    update: {
      selectedOptionIds: JSON.stringify(selectedOptionIds),
      savedAt: new Date(),
      version: { increment: 1 },
    },
  });
}

export async function saveCodeDraft(
  sessionId: string,
  candidateId: string,
  questionId: string,
  language: string,
  sourceCode: string,
) {
  await assertWritableSession(sessionId, candidateId);
  const payload = JSON.stringify({ language, sourceCode });
  return prisma.candidateAnswer.upsert({
    where: { sessionId_questionId: { sessionId, questionId } },
    create: { sessionId, questionId, answerText: payload },
    update: { answerText: payload, savedAt: new Date(), version: { increment: 1 } },
  });
}

// ---------------------------------------------------------------------------
// Submission / finalization
// ---------------------------------------------------------------------------
export async function finalizeSession(
  sessionId: string,
  reason: 'CANDIDATE' | 'TIME_EXPIRED' | 'ADMIN_TERMINATED' | 'DISQUALIFIED' | 'SYSTEM',
) {
  const session = await prisma.testSession.findUnique({
    where: { id: sessionId },
    include: {
      test: {
        include: {
          testQuestions: {
            include: { question: { include: { coding: true } } },
          },
        },
      },
      answers: true,
      codeSubmissions: { orderBy: { submittedAt: 'desc' } },
    },
  });
  if (!session) throw new Error('Session not found');

  if (session.status !== 'IN_PROGRESS') {
    const existing = await prisma.result.findUnique({ where: { sessionId } });
    return { session, alreadyFinal: true as const, result: existing };
  }

  // Submit the latest saved code for every coding question if it is newer than
  // the most recent graded SUBMIT.
  for (const tq of session.test.testQuestions) {
    const q = tq.question;
    if (q.type !== 'CODING') continue;
    const marks = tq.marksOverride ?? q.marks;

    const answer = session.answers.find((a) => a.questionId === q.id);
    const draft = parseJson<{ language: string; sourceCode: string } | null>(answer?.answerText ?? null, null);
    if (!draft || typeof draft.sourceCode !== 'string' || draft.sourceCode.trim().length === 0) continue;

    const lastSubmit = session.codeSubmissions.find((s) => s.questionId === q.id && s.kind === 'SUBMIT');
    const draftTime = answer?.savedAt?.getTime() ?? 0;
    const submitTime = lastSubmit?.submittedAt.getTime() ?? 0;
    if (!lastSubmit || draftTime > submitTime) {
      try {
        await evaluateAndStore(session.id, q.id, draft.language, draft.sourceCode, 'SUBMIT', marks);
      } catch {
        /* A judge failure must not block submission. */
      }
    }
  }

  const now = new Date();
  const status =
    reason === 'TIME_EXPIRED'
      ? 'EXPIRED'
      : reason === 'DISQUALIFIED'
        ? 'DISQUALIFIED'
        : reason === 'ADMIN_TERMINATED'
          ? 'TERMINATED'
          : 'SUBMITTED';

  await prisma.testSession.update({
    where: { id: session.id },
    data: { status, submittedAt: now, submissionReason: reason },
  });

  const result = await evaluateSession(session.id);

  await prisma.testAssignment.updateMany({
    where: { testId: session.testId, candidateId: session.candidateId },
    data: { status: 'COMPLETED' },
  });

  await logActivity('TEST_SUBMITTED', {
    sessionId: session.id,
    candidateId: session.candidateId,
    metadata: { reason },
  });

  await notify(
    session.candidateId,
    'Test submitted',
    reason === 'TIME_EXPIRED'
      ? 'Your test was submitted automatically because time expired.'
      : 'Your test was submitted successfully.',
  );

  return { session, alreadyFinal: false as const, result };
}

export async function submitSession(sessionId: string, candidateId: string, reason: 'CANDIDATE' | 'TIME_EXPIRED') {
  const session = await prisma.testSession.findUnique({ where: { id: sessionId } });
  if (!session) {
    const err: any = new Error('Session not found');
    err.status = 404;
    throw err;
  }
  if (session.candidateId !== candidateId) {
    const err: any = new Error('You do not have access to this session');
    err.status = 403;
    throw err;
  }
  const { alreadyFinal, result } = await finalizeSession(sessionId, reason);
  return { alreadyFinal, result };
}

/** Submits every session whose server-side deadline has passed. */
export async function autoSubmitExpiredSessions(): Promise<number> {
  const expired = await prisma.testSession.findMany({
    where: { status: 'IN_PROGRESS', expiresAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const s of expired) {
    try {
      await finalizeSession(s.id, 'TIME_EXPIRED');
    } catch {
      /* continue sweeping */
    }
  }
  return expired.length;
}

// ---------------------------------------------------------------------------
// Results / history
// ---------------------------------------------------------------------------
export async function getResultForSession(sessionId: string, user: { id: string; role: string }) {
  const result = await prisma.result.findUnique({
    where: { sessionId },
    include: {
      session: { include: { test: true, candidate: { select: { id: true, name: true, email: true } } } },
    },
  });
  if (!result) return null;
  if (user.role !== 'ADMIN' && result.candidateId !== user.id) {
    const err: any = new Error('You do not have access to this result');
    err.status = 403;
    throw err;
  }
  const test = result.session.test;
  return {
    id: result.id,
    sessionId: result.sessionId,
    testId: result.testId,
    testTitle: test.title,
    candidate: result.session.candidate,
    score: result.score,
    maxScore: result.maxScore,
    mcqScore: result.mcqScore,
    codingScore: result.codingScore,
    percentage: result.percentage,
    rank: test.leaderboardEnabled ? result.rank : null,
    passed: result.passed,
    timeTaken: result.timeTaken,
    status: result.session.status,
    submissionReason: result.session.submissionReason,
    correctCount: result.correctCount,
    incorrectCount: result.incorrectCount,
    unansweredCount: result.unansweredCount,
    codingAttempted: result.codingAttempted,
    codingCasesPassed: result.codingCasesPassed,
    codingCasesTotal: result.codingCasesTotal,
    violationCount: result.violationCount,
    showAnswerKey: test.showAnswerKey,
    details: parseJson<unknown[]>(result.details, []),
    createdAt: result.createdAt,
  };
}

export async function listCandidateSubmissions(candidateId: string) {
  const sessions = await prisma.testSession.findMany({
    where: { candidateId },
    orderBy: { startedAt: 'desc' },
    include: { test: true, result: true },
  });
  return sessions.map((s) => ({
    sessionId: s.id,
    testId: s.testId,
    testTitle: s.test.title,
    attempt: s.attempt,
    status: s.status,
    submissionReason: s.submissionReason,
    startedAt: s.startedAt,
    submittedAt: s.submittedAt,
    score: s.result?.score ?? null,
    maxScore: s.result?.maxScore ?? null,
    percentage: s.result?.percentage ?? null,
    passed: s.result?.passed ?? null,
  }));
}
