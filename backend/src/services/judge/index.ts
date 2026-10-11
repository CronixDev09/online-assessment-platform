import { config } from '../../config';
import { isDockerAvailable, runDocker } from './docker';
import { runLocal, type JudgeOptions } from './local';
import type { JudgeResult } from './types';

let dockerState: { checked: boolean; available: boolean } = { checked: false, available: false };

export async function refreshDockerStatus(force = false): Promise<boolean> {
  if (!force && dockerState.checked) return dockerState.available;
  dockerState = { checked: true, available: await isDockerAvailable() };
  return dockerState.available;
}

export function getJudgeInfo() {
  return {
    mode: config.JUDGE_MODE,
    dockerAvailable: dockerState.available,
    engine: config.JUDGE_MODE === 'local' ? 'local' : dockerState.available ? 'docker' : 'local',
  };
}

/**
 * Runs a submission against the given test cases.
 * - `local`  : always host subprocess (timeout + process-tree kill)
 * - `docker` : always isolated container
 * - `auto`   : container when the Docker daemon answers, host otherwise
 */
export async function judge(options: JudgeOptions): Promise<JudgeResult> {
  if (config.JUDGE_MODE === 'local') return runLocal(options);
  if (config.JUDGE_MODE === 'docker') return runDocker(options);
  const available = await refreshDockerStatus();
  return available ? runDocker(options) : runLocal(options);
}

export { detectLocalRuntimes } from './local';
export type { JudgeOptions } from './local';
export type { JudgeResult, JudgeStatus, JudgeCase } from './types';
