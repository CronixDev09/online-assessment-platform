import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from '../../config';
import {
  getLanguageSpec,
  normalizeOutput,
  type JudgeCase,
  type JudgeCaseResult,
  type JudgeResult,
  type JudgeStatus,
} from './types';

export interface RawRun {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  executionTime: number;
  timedOut: boolean;
}

const MAX_OUTPUT = 64 * 1024;

export function killTree(pid: number) {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* already dead */
      }
    }
  }
}

export function runProcess(
  cmd: string[],
  options: { cwd: string; input?: string; timeoutMs: number },
): Promise<RawRun> {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(cmd[0], cmd.slice(1), {
      cwd: options.cwd,
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONDONTWRITEBYTECODE: '1' },
    });

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: child.exitCode,
        executionTime: Date.now() - start,
        timedOut,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) killTree(child.pid);
      // Give the OS a moment, then resolve regardless.
      setTimeout(finish, 250);
    }, options.timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      if (stderr.length < MAX_OUTPUT) stderr += d.toString('utf8');
    });
    child.on('error', (err) => {
      stderr += `\n${err.message}`;
      finish();
    });
    child.on('close', finish);

    if (options.input !== undefined) child.stdin?.write(options.input);
    child.stdin?.end();
  });
}

function classifyCase(
  run: RawRun,
  testCase: JudgeCase,
): JudgeCaseResult {
  const expected = testCase.expectedOutput;
  let status: JudgeStatus;
  if (run.timedOut) {
    status = 'TIME_LIMIT_EXCEEDED';
  } else if (run.exitCode !== 0) {
    status = 'RUNTIME_ERROR';
  } else if (normalizeOutput(run.stdout) === normalizeOutput(expected)) {
    status = 'ACCEPTED';
  } else {
    status = 'WRONG_ANSWER';
  }

  return {
    testCaseId: testCase.id,
    label: testCase.label,
    isHidden: testCase.isHidden,
    status,
    executionTime: run.executionTime,
    stdout: run.stdout,
    stderr: run.stderr,
    expected: testCase.isHidden ? '[hidden]' : expected,
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
  for (const p of priority) {
    if (cases.some((c) => c.status === p)) return p;
  }
  return 'WRONG_ANSWER';
}

export interface JudgeOptions {
  language: string;
  code: string;
  cases: JudgeCase[];
  timeLimitMs: number;
  memoryLimitMb: number;
  maxCodeBytes?: number;
}

/**
 * Executes code on the host in a temp directory. Real execution with a hard
 * timeout and process-tree kill. NOTE: the host runner cannot enforce a memory
 * ceiling or full filesystem isolation the way the Docker runner does; use
 * Docker in production. This exists so the platform is fully functional
 * without Docker installed.
 */
export async function runLocal(options: JudgeOptions): Promise<JudgeResult> {
  const spec = getLanguageSpec(options.language);
  const engine: 'local' = 'local';
  if (!spec) {
    return {
      status: 'INTERNAL_ERROR',
      executionTime: 0,
      passedCases: 0,
      totalCases: options.cases.length,
      cases: [],
      engine,
      message: `Unsupported language: ${options.language}`,
    };
  }

  const maxBytes = options.maxCodeBytes ?? config.JUDGE_MAX_CODE_BYTES;
  if (Buffer.byteLength(options.code, 'utf8') > maxBytes) {
    return {
      status: 'INTERNAL_ERROR',
      executionTime: 0,
      passedCases: 0,
      totalCases: options.cases.length,
      cases: [],
      engine,
      message: `Source code exceeds the maximum size of ${maxBytes} bytes`,
    };
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oat-judge-'));
  const started = Date.now();
  try {
    await fs.writeFile(path.join(workDir, spec.sourceFile), options.code, 'utf8');

    if (spec.compileLocal && spec.compileLocal.length > 0) {
      const compile = await runProcess(spec.compileLocal, {
        cwd: workDir,
        timeoutMs: config.JUDGE_COMPILE_TIMEOUT_MS,
      });
      if (compile.timedOut || compile.exitCode !== 0) {
        return {
          status: 'COMPILATION_ERROR',
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

    for (const testCase of options.cases) {
      const run = await runProcess(spec.runLocal, {
        cwd: workDir,
        input: testCase.input,
        timeoutMs: testCase.timeoutMs ?? options.timeLimitMs,
      });
      maxTime = Math.max(maxTime, run.executionTime);
      results.push(classifyCase(run, testCase));
    }

    return {
      status: overallStatus(results),
      executionTime: maxTime,
      passedCases: results.filter((r) => r.status === 'ACCEPTED').length,
      totalCases: results.length,
      cases: results,
      engine,
    };
  } catch (err) {
    return {
      status: 'INTERNAL_ERROR',
      executionTime: Date.now() - started,
      passedCases: 0,
      totalCases: options.cases.length,
      cases: [],
      engine,
      message: err instanceof Error ? err.message : 'Unknown judge error',
    };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Detects which local runtimes are available (used for diagnostics/health). */
export async function detectLocalRuntimes(): Promise<Record<string, boolean>> {
  const checks: Record<string, string[]> = {
    python: [process.platform === 'win32' ? 'python' : 'python3', '--version'],
    java: ['java', '-version'],
    javac: ['javac', '-version'],
    cpp: ['g++', '--version'],
  };
  const out: Record<string, boolean> = {};
  for (const [key, cmd] of Object.entries(checks)) {
    try {
      const r = await runProcess(cmd, { cwd: os.tmpdir(), timeoutMs: 5000 });
      out[key] = r.exitCode === 0;
    } catch {
      out[key] = false;
    }
  }
  return out;
}
