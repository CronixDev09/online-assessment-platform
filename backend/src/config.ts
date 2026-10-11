import 'dotenv/config';
import { z } from 'zod';

const boolFromEnv = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true'));

const schema = z.object({
  DATABASE_URL: z.string().default('file:./dev.db'),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.string().default('development'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  JWT_ACCESS_SECRET: z.string().min(8).default('dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(8).default('dev-refresh-secret-change-me'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().default(604800),
  COOKIE_SECURE: boolFromEnv(false),

  JUDGE_MODE: z.enum(['auto', 'docker', 'local']).default('auto'),
  JUDGE_WORKDIR: z.string().default('../judge-work'),
  JUDGE_MAX_CODE_BYTES: z.coerce.number().default(20000),
  JUDGE_COMPILE_TIMEOUT_MS: z.coerce.number().default(15000),
});

export const config = schema.parse(process.env);
export const isProd = config.NODE_ENV === 'production';
