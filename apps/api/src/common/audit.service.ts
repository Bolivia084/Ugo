import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const SECRET_KEYS = /password|token|secret|code|otp|authorization|card/i;

/** Writes the audit trail. Values that look like secrets are never stored. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: { actorId?: string | null; action: string; targetType?: string; targetId?: string; metadata?: Record<string, unknown>; ip?: string }) {
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata ? (scrub(entry.metadata) as Prisma.InputJsonValue) : undefined,
        ip: entry.ip,
      },
    });
  }
}

export function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '[redacted]' : scrub(v)]),
    );
  }
  return value;
}
