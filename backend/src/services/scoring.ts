import { prisma } from '../db';
import { parseJson } from '../utils/http';

interface QuestionBreakdown {
  questionId: string;
  title: string;
  type: string;
  status: string;
  score: number;
  marks: number;
  selectedOptionIds?: string[];
  correctOptionIds?: string[];
  passedCases?: number;
  totalCases?: number;
}

function setEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Deterministically evaluates every answer in a session and persists a Result.
 * This is the single source of truth for scoring - never trust the client.
 */
export async function evaluateSession(sessionId: string) {
  const session = await prisma.testSession.findUnique({
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
      codeSubmissions: { where: { kind: 'SUBMIT' } },
      violations: true,
    },
  });

  if (!session) throw new Error(`Session ${sessionId} not found`);

  const test = session.test;
  const negativeEnabled = test.negativeMarkingEnabled;

  let mcqScore = 0;
  let codingScore = 0;
  let maxScore = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let unansweredCount = 0;
  let codingAttempted = 0;
  let codingCasesPassed = 0;
  let codingCasesTotal = 0;

  const details: QuestionBreakdown[] = [];
  const usedSubmissionIds = new Set<string>();

  for (const tq of test.testQuestions) {
    const q = tq.question;
    const marks = tq.marksOverride ?? q.marks;
    maxScore += marks;

    if (q.type === 'MCQ') {
      const answer = session.answers.find((a) => a.questionId === q.id);
      const selected = parseJson<string[]>(answer?.selectedOptionIds ?? null, []);
      const correct = q.options.filter((o) => o.isCorrect).map((o) => o.id);

      if (selected.length === 0) {
        unansweredCount += 1;
        details.push({
          questionId: q.id, title: q.title, type: 'MCQ', status: 'UNANSWERED',
          score: 0, marks, selectedOptionIds: [], correctOptionIds: test.showAnswerKey ? correct : undefined,
        });
      } else if (setEquals(selected, correct)) {
        correctCount += 1;
        mcqScore += marks;
        details.push({
          questionId: q.id, title: q.title, type: 'MCQ', status: 'CORRECT',
          score: round2(marks), marks, selectedOptionIds: selected,
          correctOptionIds: test.showAnswerKey ? correct : undefined,
        });
      } else {
        incorrectCount += 1;
        const penalty = negativeEnabled ? q.negativeMarks : 0;
        mcqScore -= penalty;
        details.push({
          questionId: q.id, title: q.title, type: 'MCQ', status: 'INCORRECT',
          score: round2(-penalty), marks, selectedOptionIds: selected,
          correctOptionIds: test.showAnswerKey ? correct : undefined,
        });
      }
    } else {
      // Coding: use the highest-scoring SUBMIT for this question.
      const subs = session.codeSubmissions
        .filter((s) => s.questionId === q.id)
        .sort((a, b) => b.score - a.score);
      const best = subs[0];
      if (best) {
        usedSubmissionIds.add(best.id);
        codingAttempted += 1;
        codingScore += best.score;
        codingCasesPassed += best.passedCases;
        codingCasesTotal += best.totalCases;
        details.push({
          questionId: q.id, title: q.title, type: 'CODING', status: best.status,
          score: round2(best.score), marks,
          passedCases: best.passedCases, totalCases: best.totalCases,
        });
      } else {
        details.push({
          questionId: q.id, title: q.title, type: 'CODING', status: 'NOT_ATTEMPTED',
          score: 0, marks, passedCases: 0, totalCases: q.coding?.testCases.length ?? 0,
        });
      }
    }
  }

  mcqScore = round2(mcqScore);
  codingScore = round2(codingScore);
  const score = round2(mcqScore + codingScore);
  const percentage = maxScore > 0 ? round2((score / maxScore) * 100) : 0;

  const submittedAt = session.submittedAt ?? new Date();
  const timeTaken = Math.max(0, Math.round((submittedAt.getTime() - session.startedAt.getTime()) / 1000));
  const passed = score >= test.passingMarks;

  const result = await prisma.result.upsert({
    where: { sessionId },
    create: {
      sessionId,
      candidateId: session.candidateId,
      testId: session.testId,
      mcqScore,
      codingScore,
      score,
      maxScore: round2(maxScore),
      percentage,
      passed,
      timeTaken,
      correctCount,
      incorrectCount,
      unansweredCount,
      codingAttempted,
      codingCasesPassed,
      codingCasesTotal,
      violationCount: session.violations.length,
      details: JSON.stringify(details),
      publishedAt: submittedAt,
    },
    update: {
      mcqScore,
      codingScore,
      score,
      maxScore: round2(maxScore),
      percentage,
      passed,
      timeTaken,
      correctCount,
      incorrectCount,
      unansweredCount,
      codingAttempted,
      codingCasesPassed,
      codingCasesTotal,
      violationCount: session.violations.length,
      details: JSON.stringify(details),
      publishedAt: submittedAt,
    },
  });

  await recalculateRanks(test.id);
  return result;
}

/**
 * Recomputes leaderboard ranks for a test.
 * Tie-break: higher score, then higher coding score, then faster completion.
 */
export async function recalculateRanks(testId: string): Promise<void> {
  const results = await prisma.result.findMany({
    where: { testId },
    orderBy: [{ score: 'desc' }, { codingScore: 'desc' }, { timeTaken: 'asc' }],
  });
  let rank = 0;
  for (const r of results) {
    rank += 1;
    if (r.rank !== rank) {
      await prisma.result.update({ where: { id: r.id }, data: { rank } });
    }
  }
}
