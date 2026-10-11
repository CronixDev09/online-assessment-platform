import { spawn } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../../config';
import { killTree, runProcess, type RawRun } from './local';
import {
  getLanguageSpec,
  normalizeOutput,
  type JudgeCase,
  type JudgeCaseResult,
  type JudgeResult,
  type JudgeStatus,
} from './types';

/** Locates the docker CLI, which is often not on PATH right after install. */
function resolveDockerBin(): string {
  if (process.env.DOCKER_BIN) return process.env.DOCKER_BIN;
  const candidates = [
    'docker',
    'C:/Program Files/Docker/Docker/resources/bin/docker.exe',
    '/usr/local/bin/docker',
    '/Applications/Docker.app/Contents/Resources/bin/docker',
    '/usr/bin/docker',
  ];
  for (const c of candidates) {
    if (c === 'docker') continue;
    if (existsSync(c)) return c;
  }
  return 'docker';
}

export const DOCKER_BIN = resolveDockerBin();

export async function isDockerAvailable(): Promise<boolean> {
  try {
    const res = await runProcess([DOCKER_BIN, 'info', '--format', '{{.ServerVersion}}'], {
      cwd: os.tmpdir(),
      timeoutMs: 8000,
    });
    return res.exitCode === 0 && res.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function toMountPath(p: string): string {
  // Docker Desktop accepts forward-slash Windows paths (C:/Users/...).
  return path.resolve(p).replace(/\\/g, '/');
}

interface DockerRunOutcome extends RawRun {
  oom: boolean;
}

async function runContainer(
  image: string,
  dir: string,
  memoryLimitMb: number,
  cmd: string[],
  options: { input?: string; timeoutMs: number },
): Promise<DockerRunOutcome> {
  const name = `oat-judge-${randomUUID()}`;
  const args = [
    'run',
    '--rm',
    '--name',
    name,
    '--network',
    'none',
    '--cpus',
    '1',
    '--memory',
    `${memoryLimitMb}m`,
    '--memory-swap',
    `${memoryLimitMb}m`,
    '--pids-limit',
    '128',
    '--read-only',
    '--tmpfs',
    '/tmp:size=64m',
    '-v',
    `${toMountPath(dir)}:/box`,
    '-w',
    '/box',
    '-i',
    image,
    ...cmd,
  ];

  const result = await runProcess([DOCKER_BIN, ...args], {
    cwd: os.tmpdir(),
    input: options.input,
    timeoutMs: options.timeoutMs,
  });

  const oom = result.exitCode === 137 && !result.timedOut;

  if (result.timedOut) {
    // The CLI was killed; make sure the container is gone too.
    spawn(DOCKER_BIN, ['rm', '-f', name], { windowsHide: true, stdio: 'ignore' }).on('error', () => undefined);
  }

  return { ...result, oom };
}

/**
 * Executes code inside a locked-down Docker container:
 * no network, CPU limit, memory limit, PID limit, read-only root filesystem,
 * a small tmpfs, and a hard wall-clock timeout. This is the production judge.
 */
export async function runDocker(options: {
  language: string;
  code: string;
  cases: JudgeCase[];
  timeLimitMs: number;
  memoryLimitMb: number;
  maxCodeBytes?: number;
}): Promise<JudgeResult> {
  const spec = getLanguageSpec(options.language);
  const engine: 'docker' = 'docker';
  if (!spec) {
    return emptyError(engine, options.cases.length, `Unsupported language: ${options.language}`);
  }

  const maxBytes = options.maxCodeBytes ?? config.JUDGE_MAX_CODE_BYTES;
  if (Buffer.byteLength(options.code, 'utf8') > maxBytes) {
    return emptyError(engine, options.cases.length, `Source code exceeds ${maxBytes} bytes`);
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oat-docker-'));
  const started = Date.now();
  try {
    await fs.writeFile(path.join(workDir, spec.sourceFile), options.code, 'utf8');
    await fs.chmod(workDir, 0o777).catch(() => undefined);

    if (spec.compileDocker && spec.compileDocker.length > 0) {
      const compile = await runContainer(
        spec.dockerImage,
        workDir,
        options.memoryLimitMb,
        spec.compileDocker,
        { timeoutMs: config.JUDGE_COMPILE_TIMEOUT_MS },
      );
      if (compile.timedOut || compile.exitCode !== 0) {
        return {
          status: compile.timedOut ? 'TIME_LIMIT_EXCEEDED' : 'COMPILATION_ERROR',
          compileOutput: `${compile.stdout}\n${compile.stderr}`.trim(),
          executionTime: Date.now() - started,
          passedCases: 0,
          totalCases: options.cases.length,
          cases: [],
          engine,
        };
      }
    }

    const results: JudgeCaseResult[] = [];
    let maxTime = 0;
    let memoryUsed: number | undefined;

    for (const testCase of options.cases) {
      const run = await runContainer(
        spec.dockerImage,
        workDir,
        options.memoryLimitMb,
        spec.runDocker,
        { input: testCase.input, timeoutMs: testCase.timeoutMs ?? options.timeLimitMs },
      );
      maxTime = Math.max(maxTime, run.executionTime);
      results.push(classify(run, testCase));
    }

    return {
      status: overallStatus(results),
      executionTime: maxTime,
      memoryUsed,
      passedCases: results.filter((r) => r.status === 'ACCEPTED').length,
      totalCases: results.length,
      cases: results,
      engine,
    };
  } catch (err) {
    return emptyError(engine, options.cases.length, err instanceof Error ? err.message : 'Unknown judge error');
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

function classify(run: DockerRunOutcome, testCase: JudgeCase): JudgeCaseResult {
  let status: JudgeStatus;
  if (run.timedOut) status = 'TIME_LIMIT_EXCEEDED';
  else if (run.oom) status = 'MEMORY_LIMIT_EXCEEDED';
  else if (run.exitCode !== 0) status = 'RUNTIME_ERROR';
  else if (normalizeOutput(run.stdout) === normalizeOutput(testCase.expectedOutput)) status = 'ACCEPTED';
  else status = 'WRONG_ANSWER';

  return {
    testCaseId: testCase.id,
    label: testCase.label,
    isHidden: testCase.isHidden,
    status,
    executionTime: run.executionTime,
    stdout: run.stdout,
    stderr: run.stderr,
    expected: testCase.isHidden ? '[hidden]' : testCase.expectedOutput,
  };
}

function overallStatus(cases: JudgeCaseResult[]): JudgeStatus {
  if (cases.length === 0) return 'INTERNAL_ERROR';
  if (cases.every((c) => c.status === 'ACCEPTED')) return 'ACCEPTED';
  const priority: JudgeStatus[] = [
    'TIME_LIMIT_EXCEEDED',
    'MEMORY_LIMIT_EXCEEDED',
    'RUNTIME_ERROR',
    'WRONG_ANSWER',
  ];
  for (const p of priority) if (cases.some((c) => c.status === p)) return p;
  return 'WRONG_ANSWER';
}

function emptyError(engine: 'docker' | 'local', total: number, message: string): JudgeResult {
  return {
    status: 'INTERNAL_ERROR',
    executionTime: 0,
    passedCases: 0,
    totalCases: total,
    cases: [],
    engine,
    message,
  };
}

// Keep killTree referenced for symmetry / future streaming-abort support.
export { killTree };
