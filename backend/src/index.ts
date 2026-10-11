import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { ZodError } from 'zod';
import { config, isProd } from './config';
import { disconnectDb } from './db';
import api from './routes';
import { refreshDockerStatus } from './services/judge';
import { autoSubmitExpiredSessions } from './services/sessionService';
import { AppError } from './utils/http';

const app = express();

app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.get('/api/health', async (_req, res) => {
  const dockerAvailable = await refreshDockerStatus(true);
  res.json({
    ok: true,
    time: new Date().toISOString(),
    judge: { mode: config.JUDGE_MODE, dockerAvailable },
  });
});

app.use('/api', api);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' });
});

// Central error handler - never leak internals to clients.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code ?? 'ERROR', details: err.details });
  }
  const status = (err as { status?: number })?.status ?? 500;
  const message = (err as Error)?.message ?? 'Internal server error';
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
  }
  res.status(status).json({
    error: status >= 500 ? 'Something went wrong while processing your request.' : message,
    code: status >= 500 ? 'INTERNAL_ERROR' : 'ERROR',
  });
});

const server = app.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Assessment API listening on http://localhost:${config.PORT} (judge mode: ${config.JUDGE_MODE})`);
  refreshDockerStatus(true).then((available) => {
    console.log(`[judge] docker ${available ? 'available - isolated container execution enabled' : 'unavailable - using local subprocess runner'}`);
  });
});

// Server is the source of truth for timing: sweep and auto-submit on schedule.
const sweep = setInterval(() => {
  autoSubmitExpiredSessions().catch((err) => console.error('[sweep]', err));
}, 15_000);
sweep.unref?.();

async function shutdown() {
  clearInterval(sweep);
  server.close();
  await disconnectDb();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

if (!isProd) {
  console.log('[config] development mode');
}

export default app;
