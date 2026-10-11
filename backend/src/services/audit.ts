import type { Request } from 'express';
import { prisma } from '../db';
import { clientIp } from '../utils/http';

export async function audit(
  userId: string,
  action: string,
  entityType?: string,
  entityId?: string,
  metadata?: unknown,
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entityType,
      entityId,
      metadata: metadata === undefined ? null : JSON.stringify(metadata),
    },
  });
}

export async function notify(userId: string, title: string, message: string): Promise<void> {
  await prisma.notification.create({ data: { userId, title, message } });
}

export async function logActivity(
  eventType: string,
  options: {
    sessionId?: string;
    candidateId?: string;
    severity?: string;
    metadata?: unknown;
    req?: Request;
  } = {},
): Promise<void> {
  await prisma.activityLog.create({
    data: {
      sessionId: options.sessionId,
      candidateId: options.candidateId,
      eventType,
      severity: options.severity,
      metadata: options.metadata === undefined ? null : JSON.stringify(options.metadata),
      ipAddress: options.req ? clientIp(options.req) : undefined,
      userAgent: options.req?.headers['user-agent'],
    },
  });
}
