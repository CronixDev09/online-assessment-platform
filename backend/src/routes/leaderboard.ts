import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { authenticate } from '../auth/middleware';
import { AppError, asyncHandler } from '../utils/http';

const router = Router();

const configSchema = z.object({
  publicLeaderboard: z.boolean().default(true),
  maskNames: z.boolean().default(false),
  topN: z.number().int().min(1).max(1000).nullable().default(null),
  showScores: z.boolean().default(true),
});

function maskName(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length <= 1 ? w : `${w[0]}***${w[w.length - 1]}`))
    .join(' ');
}

router.get(
  '/leaderboard/:testId',
  authenticate,
  asyncHandler(async (req, res) => {
    const test = await prisma.test.findUnique({ where: { id: req.params.testId } });
    if (!test) throw new AppError(404, 'Test not found');
    if (!test.leaderboardEnabled) throw new AppError(403, 'Leaderboard is disabled for this test', 'LEADERBOARD_DISABLED');

    const isAdmin = req.user!.role === 'ADMIN';
    const setting = await prisma.setting.findUnique({ where: { key: 'leaderboard_config' } });
    const config = setting ? configSchema.parse(JSON.parse(setting.value)) : configSchema.parse({});

    if (!config.publicLeaderboard && !isAdmin) {
      throw new AppError(403, 'The leaderboard is not public for this test', 'LEADERBOARD_PRIVATE');
    }

    const results = await prisma.result.findMany({
      where: { testId: test.id },
      orderBy: { rank: 'asc' },
      include: { session: { include: { candidate: { select: { id: true, name: true } } } } },
    });

    const limited = config.topN ? results.slice(0, config.topN) : results;

    const leaderboard = limited.map((r) => ({
      rank: r.rank,
      candidateName: config.maskNames && !isAdmin ? maskName(r.session.candidate.name) : r.session.candidate.name,
      candidateId: config.maskNames && !isAdmin ? null : r.session.candidate.id,
      score: config.showScores ? r.score : null,
      maxScore: config.showScores ? r.maxScore : null,
      percentage: config.showScores ? r.percentage : null,
      timeTaken: r.timeTaken,
      passed: r.passed,
      isMe: r.session.candidate.id === req.user!.id,
    }));

    const mine = leaderboard.find((l) => l.isMe) ?? null;

    res.json({
      test: { id: test.id, title: test.title },
      config: { maskNames: config.maskNames, showScores: config.showScores, topN: config.topN },
      leaderboard,
      me: mine,
      total: results.length,
    });
  }),
);

export default router;
