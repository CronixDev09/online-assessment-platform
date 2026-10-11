import { Router } from 'express';
import adminRouter from './admin';
import authRouter from './auth';
import candidateRouter from './candidate';
import codeRouter from './code';
import leaderboardRouter from './leaderboard';
import proctoringRouter from './proctoring';
import sessionRouter from './session';

const api = Router();

api.use('/auth', authRouter);
api.use('/admin', adminRouter);
api.use('/sessions', sessionRouter);
api.use('/code', codeRouter);
api.use('/proctoring', proctoringRouter);
// Candidate + shared routes (/candidate/*, /tests/:id/start, /leaderboard/:testId)
api.use('/', candidateRouter);
api.use('/', leaderboardRouter);

export default api;
