import { Injectable, Logger } from '@nestjs/common';
import type { Entitlement, ExamCode, PurchaseSource } from '@prisma/client';
import { activeExamCodes, grantsAccess } from '@ugo/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntitlementSigner, ENTITLEMENT_RECHECK_SECONDS } from './entitlement-signer.service.js';
import type { StoreState } from './status-mapping.js';

@Injectable()
export class EntitlementsService {
  private readonly logger = new Logger(EntitlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signer: EntitlementSigner,
  ) {}

  forUser(userId: string): Promise<Entitlement[]> {
    return this.prisma.entitlement.findMany({ where: { userId }, orderBy: { expiresAt: 'desc' } });
  }

  async activeCodes(userId: string): Promise<ExamCode[]> {
    const rows = await this.forUser(userId);
    return activeExamCodes(rows.map(toShared)) as ExamCode[];
  }

  async hasAccess(userId: string, examCode: ExamCode): Promise<boolean> {
    return (await this.activeCodes(userId)).includes(examCode);
  }

  /** Current plans plus a signed copy the app caches for offline use. */
  async snapshot(userId: string) {
    const rows = await this.forUser(userId);
    const now = Math.floor(Date.now() / 1000);
    const entitlements = rows.map((e) => ({
      examCode: e.examCode,
      source: e.source,
      status: e.status,
      startsAt: e.startsAt.toISOString(),
      expiresAt: e.expiresAt.toISOString(),
      autoRenew: e.autoRenew,
      active: grantsAccess(toShared(e)),
    }));
    const signed = this.signer.sign({
      sub: userId,
      entitlements: rows.filter((e) => grantsAccess(toShared(e))).map((e) => ({ examCode: e.examCode, status: e.status, expiresAt: e.expiresAt.toISOString() })),
      iat: now,
      exp: now + ENTITLEMENT_RECHECK_SECONDS,
    });
    return { entitlements, signed };
  }

  /**
   * Creates or updates the entitlement for one store purchase. Store purchases are keyed by the
   * store's own id (Apple originalTransactionId, Google purchaseToken), so a renewal updates the same row.
   */
  async applyStoreState(input: { userId: string; examCode: ExamCode; source: PurchaseSource; externalId: string; startsAt?: Date; pricePaidKobo?: number } & StoreState) {
    const { userId, examCode, source, externalId, status, expiresAt, autoRenew } = input;
    const existing = await this.prisma.entitlement.findUnique({ where: { source_externalId_examCode: { source, externalId, examCode } } });
    if (existing && existing.userId !== userId) {
      // A store purchase belongs to the account that made it. Restore from another account is refused.
      this.logger.warn(`Purchase ${source} already linked to another account`);
      throw new Error('PURCHASE_OWNED_BY_ANOTHER_ACCOUNT');
    }
    return this.prisma.entitlement.upsert({
      where: { source_externalId_examCode: { source, externalId, examCode } },
      create: { userId, examCode, source, externalId, status, expiresAt, autoRenew, startsAt: input.startsAt ?? new Date(), pricePaidKobo: input.pricePaidKobo },
      update: { status, expiresAt, autoRenew, lastEventAt: new Date(), ...(input.pricePaidKobo ? { pricePaidKobo: input.pricePaidKobo } : {}) },
    });
  }
}

function toShared(e: Pick<Entitlement, 'examCode' | 'status' | 'expiresAt'>) {
  return { examCode: e.examCode, status: e.status, expiresAt: e.expiresAt.toISOString() };
}
