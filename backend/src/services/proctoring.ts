import { prisma } from '../db';
import { logActivity } from './audit';
import { evaluateSession } from './scoring';

export interface ViolationTypePolicy {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  warnAfter: number;
  disqualifyAfter: number | null;
  pauseTest: boolean;
  autoSubmit: boolean;
}

export type ViolationPolicy = Record<string, ViolationTypePolicy>;

/** Editable defaults; persisted to Settings and configurable from the admin UI. */
export const DEFAULT_VIOLATION_POLICY: ViolationPolicy = {
  TAB_SWITCH: { severity: 'MEDIUM', warnAfter: 1, disqualifyAfter: 5, pauseTest: false, autoSubmit: false },
  WINDOW_BLUR: { severity: 'MEDIUM', warnAfter: 1, disqualifyAfter: 8, pauseTest: false, autoSubmit: false },
  FULLSCREEN_EXIT: { severity: 'MEDIUM', warnAfter: 1, disqualifyAfter: 3, pauseTest: false, autoSubmit: false },
  CAMERA_STOPPED: { severity: 'HIGH', warnAfter: 1, disqualifyAfter: 4, pauseTest: false, autoSubmit: false },
  CAMERA_DENIED: { severity: 'HIGH', warnAfter: 1, disqualifyAfter: 2, pauseTest: false, autoSubmit: false },
  MICROPHONE_STOPPED: { severity: 'HIGH', warnAfter: 1, disqualifyAfter: 4, pauseTest: false, autoSubmit: false },
  MICROPHONE_DENIED: { severity: 'HIGH', warnAfter: 1, disqualifyAfter: 2, pauseTest: false, autoSubmit: false },
  NETWORK_LOST: { severity: 'LOW', warnAfter: 999, disqualifyAfter: null, pauseTest: false, autoSubmit: false },
  NETWORK_RESTORED: { severity: 'LOW', warnAfter: 999, disqualifyAfter: null, pauseTest: false, autoSubmit: false },
  UNAUTHORIZED_API_ATTEMPT: { severity: 'CRITICAL', warnAfter: 1, disqualifyAfter: 1, pauseTest: false, autoSubmit: true },
  DUPLICATE_SUBMISSION: { severity: 'HIGH', warnAfter: 1, disqualifyAfter: 5, pauseTest: false, autoSubmit: false },
};

export async function getViolationPolicy(): Promise<ViolationPolicy> {
  const setting = await prisma.setting.findUnique({ where: { key: 'violation_policy' } });
  if (!setting) return DEFAULT_VIOLATION_POLICY;
  try {
    return { ...DEFAULT_VIOLATION_POLICY, ...(JSON.parse(setting.value) as ViolationPolicy) };
  } catch {
    return DEFAULT_VIOLATION_POLICY;
  }
}

export async function saveViolationPolicy(policy: ViolationPolicy): Promise<void> {
  await prisma.setting.upsert({
    where: { key: 'violation_policy' },
    create: { key: 'violation_policy', value: JSON.stringify(policy) },
    update: { value: JSON.stringify(policy) },
  });
}

export interface RegisterViolationInput {
  sessionId: string;
  type: string;
  severity?: string;
  description?: string;
  metadata?: unknown;
}

export interface ViolationOutcome {
  violationId: string;
  warningCount: number;
  severity: string;
  threshold: ViolationTypePolicy;
  action: 'NONE' | 'WARN' | 'DISQUALIFY_AND_SUBMIT';
}

/**
 * Records a real proctoring event and applies the configured policy.
 * Thresholds are data (Settings), never hard-coded in the request path.
 */
export async function registerViolation(input: RegisterViolationInput): Promise<ViolationOutcome> {
  const session = await prisma.testSession.findUnique({ where: { id: input.sessionId } });
  if (!session) throw new Error('Session not found');

  const policy = await getViolationPolicy();
  const threshold =
    policy[input.type] ??
    ({ severity: 'MEDIUM', warnAfter: 1, disqualifyAfter: null, pauseTest: false, autoSubmit: false } as ViolationTypePolicy);

  const severity = input.severity ?? threshold.severity;

  const violation = await prisma.violation.create({
    data: {
      sessionId: session.id,
      candidateId: session.candidateId,
      testId: session.testId,
      type: input.type,
      severity,
      description: input.description,
      metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata),
    },
  });

  await logActivity(input.type, {
    sessionId: session.id,
    candidateId: session.candidateId,
    severity,
    metadata: input.metadata,
  });

  const warningCount = await prisma.violation.count({
    where: { sessionId: session.id, type: input.type },
  });

  let action: ViolationOutcome['action'] = 'NONE';
  if (threshold.disqualifyAfter !== null && warningCount >= threshold.disqualifyAfter) {
    action = 'DISQUALIFY_AND_SUBMIT';
    if (session.status === 'IN_PROGRESS') {
      await prisma.testSession.update({
        where: { id: session.id },
        data: { status: 'DISQUALIFIED', submittedAt: new Date(), submissionReason: 'DISQUALIFIED' },
      });
      await evaluateSession(session.id);
    }
  } else if (warningCount >= threshold.warnAfter) {
    action = 'WARN';
  }

  return {
    violationId: violation.id,
    warningCount,
    severity,
    threshold,
    action,
  };
}
