import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { audit } from '../../services/audit';
import {
  DEFAULT_VIOLATION_POLICY,
  getViolationPolicy,
  saveViolationPolicy,
} from '../../services/proctoring';
import { AppError, asyncHandler, parseJson } from '../../utils/http';

const router = Router();

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
router.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const [
      totalCandidates,
      activeTests,
      upcomingTests,
      completedTests,
      activeSessions,
      totalSubmissions,
      totalViolations,
      resultAgg,
      tests,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'CANDIDATE' } }),
      prisma.test.count({ where: { status: 'ACTIVE' } }),
      prisma.test.count({ where: { status: 'SCHEDULED' } }),
      prisma.test.count({ where: { status: 'COMPLETED' } }),
      prisma.testSession.count({ where: { status: 'IN_PROGRESS' } }),
      prisma.testSession.count({ where: { status: { not: 'IN_PROGRESS' } } }),
      prisma.violation.count(),
      prisma.result.aggregate({ _avg: { percentage: true }, _count: true }),
      prisma.test.findMany({
        orderBy: { createdAt: 'desc' },
        take: 12,
        include: { _count: { select: { assignments: true, sessions: true } } },
      }),
    ]);

    const passCount = await prisma.result.count({ where: { passed: true } });
    const failCount = await prisma.result.count({ where: { passed: false } });

    const participation = await Promise.all(
      tests.map(async (t) => {
        const attempted = await prisma.testSession.count({ where: { testId: t.id } });
        const completed = await prisma.testSession.count({ where: { testId: t.id, status: { not: 'IN_PROGRESS' } } });
        return {
          testId: t.id,
          title: t.title,
          status: t.status,
          assigned: t._count.assignments,
          attempted,
          completed,
        };
      }),
    );

    const codingTotal = await prisma.codeSubmission.count({ where: { kind: 'SUBMIT' } });
    const codingAccepted = await prisma.codeSubmission.count({ where: { kind: 'SUBMIT', status: 'ACCEPTED' } });

    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    const recentViolations = await prisma.violation.findMany({
      where: { timestamp: { gte: since } },
      select: { timestamp: true, severity: true },
    });
    const byDay: Record<string, number> = {};
    for (const v of recentViolations) {
      const day = v.timestamp.toISOString().slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + 1;
    }
    const violationsOverTime = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    res.json({
      kpis: {
        totalCandidates,
        activeTests,
        upcomingTests,
        completedTests,
        activeCandidates: activeSessions,
        totalSubmissions,
        totalViolations,
        averageScore: resultAgg._avg.percentage ? Math.round(resultAgg._avg.percentage * 100) / 100 : 0,
        resultCount: resultAgg._count,
        codingAcceptanceRate: codingTotal > 0 ? Math.round((codingAccepted / codingTotal) * 10000) / 100 : 0,
      },
      charts: {
        participation,
        passFail: { passed: passCount, failed: failCount },
        violationsOverTime,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------
router.get(
  '/results',
  asyncHandler(async (req, res) => {
    const testId = typeof req.query.testId === 'string' ? req.query.testId : undefined;
    const results = await prisma.result.findMany({
      where: testId ? { testId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        session: { include: { candidate: { select: { id: true, name: true, email: true } }, test: { select: { id: true, title: true } } } },
      },
    });
    res.json({
      results: results.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        testId: r.testId,
        testTitle: r.session.test.title,
        candidate: r.session.candidate,
        score: r.score,
        maxScore: r.maxScore,
        mcqScore: r.mcqScore,
        codingScore: r.codingScore,
        percentage: r.percentage,
        rank: r.rank,
        passed: r.passed,
        timeTaken: r.timeTaken,
        violationCount: r.violationCount,
        status: r.session.status,
        submissionReason: r.session.submissionReason,
        createdAt: r.createdAt,
      })),
    });
  }),
);

router.get(
  '/results/:id',
  asyncHandler(async (req, res) => {
    const result = await prisma.result.findUnique({
      where: { id: req.params.id },
      include: {
        session: {
          include: {
            candidate: { select: { id: true, name: true, email: true } },
            test: true,
            violations: { orderBy: { timestamp: 'desc' } },
          },
        },
      },
    });
    if (!result) throw new AppError(404, 'Result not found');
    res.json({
      result: {
        id: result.id,
        sessionId: result.sessionId,
        testId: result.testId,
        testTitle: result.session.test.title,
        candidate: result.session.candidate,
        score: result.score,
        maxScore: result.maxScore,
        mcqScore: result.mcqScore,
        codingScore: result.codingScore,
        percentage: result.percentage,
        rank: result.rank,
        passed: result.passed,
        timeTaken: result.timeTaken,
        correctCount: result.correctCount,
        incorrectCount: result.incorrectCount,
        unansweredCount: result.unansweredCount,
        codingAttempted: result.codingAttempted,
        codingCasesPassed: result.codingCasesPassed,
        codingCasesTotal: result.codingCasesTotal,
        violationCount: result.violationCount,
        details: parseJson<unknown[]>(result.details, []),
        violations: result.session.violations.map((v) => ({
          id: v.id,
          type: v.type,
          severity: v.severity,
          description: v.description,
          timestamp: v.timestamp,
          metadata: parseJson<unknown>(v.metadata, null),
        })),
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Leaderboard + violations + monitoring
// ---------------------------------------------------------------------------
router.get(
  '/leaderboard',
  asyncHandler(async (req, res) => {
    const testId = typeof req.query.testId === 'string' ? req.query.testId : undefined;
    if (!testId) throw new AppError(400, 'testId is required');
    const results = await prisma.result.findMany({
      where: { testId },
      orderBy: { rank: 'asc' },
      include: { session: { include: { candidate: { select: { id: true, name: true, email: true } } } } },
    });
    res.json({
      leaderboard: results.map((r) => ({
        rank: r.rank,
        candidate: r.session.candidate,
        score: r.score,
        maxScore: r.maxScore,
        percentage: r.percentage,
        codingScore: r.codingScore,
        timeTaken: r.timeTaken,
        status: r.session.status,
        passed: r.passed,
      })),
    });
  }),
);

router.get(
  '/violations',
  asyncHandler(async (req, res) => {
    const testId = typeof req.query.testId === 'string' ? req.query.testId : undefined;
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    const severity = typeof req.query.severity === 'string' ? req.query.severity : undefined;
    const violations = await prisma.violation.findMany({
      where: {
        ...(testId ? { testId } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(severity ? { severity } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: 1000,
      include: {
        session: { include: { candidate: { select: { id: true, name: true, email: true } }, test: { select: { id: true, title: true } } } },
      },
    });
    res.json({
      violations: violations.map((v) => ({
        id: v.id,
        sessionId: v.sessionId,
        testId: v.testId,
        testTitle: v.session.test.title,
        candidate: v.session.candidate,
        type: v.type,
        severity: v.severity,
        description: v.description,
        metadata: parseJson<unknown>(v.metadata, null),
        timestamp: v.timestamp,
      })),
    });
  }),
);

router.get(
  '/monitoring',
  asyncHandler(async (_req, res) => {
    const sessions = await prisma.testSession.findMany({
      where: { status: 'IN_PROGRESS' },
      include: {
        candidate: { select: { id: true, name: true, email: true } },
        test: { select: { id: true, title: true } },
        violations: { select: { severity: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    const now = Date.now();
    res.json({
      active: sessions.map((s) => ({
        sessionId: s.id,
        candidate: s.candidate,
        test: s.test,
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

// ---------------------------------------------------------------------------
// Reports + CSV export
// ---------------------------------------------------------------------------
function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

async function buildTestReport(testId: string) {
  const test = await prisma.test.findUnique({ where: { id: testId } });
  if (!test) throw new AppError(404, 'Test not found');

  const assigned = await prisma.testAssignment.count({ where: { testId } });
  const sessions = await prisma.testSession.findMany({
    where: { testId },
    include: { result: true },
  });
  const attempted = sessions.length;
  const completed = sessions.filter((s) => s.status !== 'IN_PROGRESS').length;
  const results = sessions.map((s) => s.result).filter((r): r is NonNullable<typeof r> => r !== null);
  const scores = results.map((r) => r.score);
  const percentages = results.map((r) => r.percentage);
  const times = results.map((r) => r.timeTaken);
  const passedCount = results.filter((r) => r.passed).length;

  const questions = await prisma.testQuestion.findMany({
    where: { testId },
    include: { question: { select: { id: true, title: true, type: true } } },
  });

  const questionStats = questions.map((tq) => {
    let attemptedQ = 0;
    let correctQ = 0;
    for (const r of results) {
      const details = parseJson<{ questionId: string; status: string }[]>(r.details, []);
      const d = details.find((x) => x.questionId === tq.question.id);
      if (!d || d.status === 'UNANSWERED' || d.status === 'NOT_ATTEMPTED') continue;
      attemptedQ += 1;
      if (d.status === 'CORRECT') correctQ += 1;
    }
    return {
      questionId: tq.question.id,
      title: tq.question.title,
      type: tq.question.type,
      attempts: attemptedQ,
      correct: correctQ,
      accuracy: attemptedQ > 0 ? Math.round((correctQ / attemptedQ) * 10000) / 100 : 0,
    };
  });

  const codingSubs = await prisma.codeSubmission.count({ where: { kind: 'SUBMIT', session: { testId } } });
  const codingAccepted = await prisma.codeSubmission.count({
    where: { kind: 'SUBMIT', status: 'ACCEPTED', session: { testId } },
  });
  const codingCompileErrors = await prisma.codeSubmission.count({
    where: { kind: 'SUBMIT', status: 'COMPILATION_ERROR', session: { testId } },
  });
  const codingRuntimeErrors = await prisma.codeSubmission.count({
    where: { kind: 'SUBMIT', status: 'RUNTIME_ERROR', session: { testId } },
  });

  const violations = await prisma.violation.findMany({ where: { testId }, select: { type: true, severity: true } });
  const violationsByType: Record<string, number> = {};
  for (const v of violations) violationsByType[v.type] = (violationsByType[v.type] ?? 0) + 1;
  const disqualified = sessions.filter((s) => s.status === 'DISQUALIFIED').length;

  return {
    test: { id: test.id, title: test.title, status: test.status },
    summary: {
      assigned,
      attempted,
      completed,
      averageScore: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100 : 0,
      highestScore: scores.length ? Math.max(...scores) : 0,
      lowestScore: scores.length ? Math.min(...scores) : 0,
      averagePercentage: percentages.length ? Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 100) / 100 : 0,
      passRate: results.length ? Math.round((passedCount / results.length) * 10000) / 100 : 0,
      averageTime: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0,
    },
    questions: questionStats,
    coding: {
      submissions: codingSubs,
      accepted: codingAccepted,
      acceptanceRate: codingSubs ? Math.round((codingAccepted / codingSubs) * 10000) / 100 : 0,
      compilationErrors: codingCompileErrors,
      runtimeErrors: codingRuntimeErrors,
    },
    proctoring: {
      totalViolations: violations.length,
      violationsByType,
      disqualified,
    },
  };
}

router.get(
  '/reports',
  asyncHandler(async (req, res) => {
    const testId = typeof req.query.testId === 'string' ? req.query.testId : undefined;
    if (!testId) throw new AppError(400, 'testId is required');
    res.json({ report: await buildTestReport(testId) });
  }),
);

router.get(
  '/reports/export',
  asyncHandler(async (req, res) => {
    const testId = typeof req.query.testId === 'string' ? req.query.testId : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : 'results';
    if (!testId) throw new AppError(400, 'testId is required');

    let csv = '';
    if (type === 'results') {
      const results = await prisma.result.findMany({
        where: { testId },
        orderBy: { rank: 'asc' },
        include: { session: { include: { candidate: true } } },
      });
      csv = toCsv(
        ['Rank', 'Candidate', 'Email', 'Score', 'MaxScore', 'Percentage', 'MCQ', 'Coding', 'Passed', 'TimeTakenSeconds', 'Violations', 'Status'],
        results.map((r) => [
          r.rank, r.session.candidate.name, r.session.candidate.email, r.score, r.maxScore,
          r.percentage, r.mcqScore, r.codingScore, r.passed ? 'PASS' : 'FAIL',
          r.timeTaken, r.violationCount, r.session.status,
        ]),
      );
    } else if (type === 'violations') {
      const violations = await prisma.violation.findMany({
        where: { testId },
        orderBy: { timestamp: 'asc' },
        include: { session: { include: { candidate: true } } },
      });
      csv = toCsv(
        ['Timestamp', 'Candidate', 'Email', 'Type', 'Severity', 'Description'],
        violations.map((v) => [
          v.timestamp.toISOString(), v.session.candidate.name, v.session.candidate.email,
          v.type, v.severity, v.description,
        ]),
      );
    } else if (type === 'questions') {
      const report = await buildTestReport(testId);
      csv = toCsv(
        ['QuestionId', 'Title', 'Type', 'Attempts', 'Correct', 'Accuracy%'],
        report.questions.map((q) => [q.questionId, q.title, q.type, q.attempts, q.correct, q.accuracy]),
      );
    } else {
      throw new AppError(400, 'Unknown export type');
    }

    await audit(req.user!.id, 'REPORT_EXPORTED', 'Test', testId, { type });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-${testId}.csv"`);
    res.send(csv);
  }),
);

// ---------------------------------------------------------------------------
// Settings + audit
// ---------------------------------------------------------------------------
const leaderboardConfigSchema = z.object({
  publicLeaderboard: z.boolean().default(true),
  maskNames: z.boolean().default(false),
  topN: z.number().int().min(1).max(1000).nullable().default(null),
  showScores: z.boolean().default(true),
});

async function getLeaderboardConfig() {
  const s = await prisma.setting.findUnique({ where: { key: 'leaderboard_config' } });
  if (!s) return { publicLeaderboard: true, maskNames: false, topN: null, showScores: true };
  try {
    return leaderboardConfigSchema.parse(JSON.parse(s.value));
  } catch {
    return { publicLeaderboard: true, maskNames: false, topN: null, showScores: true };
  }
}

router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json({
      violationPolicy: await getViolationPolicy(),
      defaultViolationPolicy: DEFAULT_VIOLATION_POLICY,
      leaderboardConfig: await getLeaderboardConfig(),
    });
  }),
);

router.put(
  '/settings/violation-policy',
  asyncHandler(async (req, res) => {
    const policy = z.record(
      z.object({
        severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
        warnAfter: z.number().int().min(1),
        disqualifyAfter: z.number().int().min(1).nullable(),
        pauseTest: z.boolean(),
        autoSubmit: z.boolean(),
      }),
    ).parse(req.body);
    await saveViolationPolicy(policy);
    await audit(req.user!.id, 'SETTINGS_UPDATED', 'Setting', 'violation_policy');
    res.json({ ok: true, violationPolicy: await getViolationPolicy() });
  }),
);

router.put(
  '/settings/leaderboard',
  asyncHandler(async (req, res) => {
    const config = leaderboardConfigSchema.parse(req.body);
    await prisma.setting.upsert({
      where: { key: 'leaderboard_config' },
      create: { key: 'leaderboard_config', value: JSON.stringify(config) },
      update: { value: JSON.stringify(config) },
    });
    await audit(req.user!.id, 'SETTINGS_UPDATED', 'Setting', 'leaderboard_config');
    res.json({ ok: true, leaderboardConfig: config });
  }),
);

router.get(
  '/audit-logs',
  asyncHandler(async (_req, res) => {
    const logs = await prisma.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 500,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.json({
      logs: logs.map((l) => ({
        id: l.id,
        user: l.user,
        action: l.action,
        entityType: l.entityType,
        entityId: l.entityId,
        metadata: parseJson<unknown>(l.metadata, null),
        timestamp: l.timestamp,
      })),
    });
  }),
);

// Admin: terminate an active session.
router.post(
  '/sessions/:id/terminate',
  asyncHandler(async (req, res) => {
    const { finalizeSession } = await import('../../services/sessionService');
    const session = await prisma.testSession.findUnique({ where: { id: req.params.id } });
    if (!session) throw new AppError(404, 'Session not found');
    await finalizeSession(session.id, 'ADMIN_TERMINATED');
    await audit(req.user!.id, 'SESSION_TERMINATED', 'TestSession', session.id);
    res.json({ ok: true });
  }),
);

export default router;
