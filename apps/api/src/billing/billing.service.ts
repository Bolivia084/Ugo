import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type ExamCode, type PurchaseSource } from '@prisma/client';
import { addOneYear } from '@ugo/shared';
import { randomUUID } from 'node:crypto';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AuditService } from '../common/audit.service.js';
import { CatalogService } from '../catalog/catalog.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntitlementsService } from './entitlements.service.js';
import { appleState, googleState } from './status-mapping.js';
import { AppleVerifier, GoogleVerifier } from './store-verifiers.js';
import { FlutterwaveClient, PaystackClient, type PaystackTransaction } from './web-payments.js';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly catalog: CatalogService,
    private readonly apple: AppleVerifier,
    private readonly google: GoogleVerifier,
    private readonly paystack: PaystackClient,
    private readonly flutterwave: FlutterwaveClient,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---------- Apple (StoreKit 2) ----------

  /** Called by the app right after a purchase or on "Restore purchases", with the transaction's JWS. */
  async verifyApple(userId: string, signedTransaction: string) {
    const tx = await this.apple.transaction(signedTransaction);
    if (!tx.appAccountToken || tx.appAccountToken.toLowerCase() !== userId.toLowerCase()) {
      throw new ForbiddenException({ message: 'This purchase belongs to another Ugo account', code: 'PURCHASE_OWNED_BY_ANOTHER_ACCOUNT' });
    }
    return this.applyApple(userId, tx, undefined);
  }

  private async applyApple(
    userId: string,
    tx: Awaited<ReturnType<AppleVerifier['transaction']>>,
    renewal: Awaited<ReturnType<AppleVerifier['renewalInfo']>> | undefined,
  ) {
    const examCode = await this.examForProduct('APPLE', tx.productId);
    const state = appleState(tx, renewal ?? { autoRenewStatus: 1 });
    return this.safeApply({
      userId,
      examCode,
      source: 'APPLE',
      externalId: tx.originalTransactionId ?? tx.transactionId ?? '',
      startsAt: tx.purchaseDate ? new Date(tx.purchaseDate) : undefined,
      ...state,
    });
  }

  async handleAppleNotification(signedPayload: string) {
    const n = await this.apple.notification(signedPayload);
    const eventId = n.notificationUUID ?? randomUUID();
    if (!(await this.recordEvent('APPLE', eventId, `${n.notificationType}:${n.subtype ?? ''}`, { notificationType: n.notificationType, subtype: n.subtype }))) return;
    if (!n.data?.signedTransactionInfo) return this.markProcessed('APPLE', eventId);
    const tx = await this.apple.transaction(n.data.signedTransactionInfo);
    const renewal = n.data.signedRenewalInfo ? await this.apple.renewalInfo(n.data.signedRenewalInfo) : undefined;
    const userId = tx.appAccountToken ?? (await this.ownerOf('APPLE', tx.originalTransactionId));
    if (!userId) {
      this.logger.warn('Apple notification for unknown account');
      return this.markProcessed('APPLE', eventId, 'unknown account');
    }
    const ent = await this.applyApple(userId, tx, renewal);
    await this.markProcessed('APPLE', eventId, undefined, ent?.id);
  }

  // ---------- Google Play Billing ----------

  async verifyGoogle(userId: string, purchaseToken: string, productId: string) {
    const sub = await this.google.subscription(purchaseToken);
    const owner = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId;
    if (owner && owner !== userId) throw new ForbiddenException({ message: 'This purchase belongs to another Ugo account', code: 'PURCHASE_OWNED_BY_ANOTHER_ACCOUNT' });
    const examCode = await this.examForProduct('GOOGLE', sub.lineItems?.[0]?.productId ?? productId);
    const ent = await this.safeApply({ userId, examCode, source: 'GOOGLE', externalId: purchaseToken, startsAt: sub.startTime ? new Date(sub.startTime) : undefined, ...googleState(sub) });
    if (sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING') await this.google.acknowledge(productId, purchaseToken);
    return ent;
  }

  async handleGoogleRtdn(messageId: string, data: { subscriptionNotification?: { purchaseToken?: string; subscriptionId?: string; notificationType?: number }; voidedPurchaseNotification?: { purchaseToken?: string }; testNotification?: unknown }) {
    if (!(await this.recordEvent('GOOGLE', messageId, 'rtdn', data as Prisma.InputJsonValue))) return;
    if (data.voidedPurchaseNotification?.purchaseToken) {
      const res = await this.prisma.entitlement.updateMany({ where: { source: 'GOOGLE', externalId: data.voidedPurchaseNotification.purchaseToken }, data: { status: 'REFUNDED', autoRenew: false, lastEventAt: new Date() } });
      return this.markProcessed('GOOGLE', messageId, res.count ? undefined : 'unknown purchase');
    }
    const token = data.subscriptionNotification?.purchaseToken;
    if (!token) return this.markProcessed('GOOGLE', messageId);
    const sub = await this.google.subscription(token);
    const userId = sub.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? (await this.ownerOf('GOOGLE', token));
    if (!userId) return this.markProcessed('GOOGLE', messageId, 'unknown account');
    const examCode = await this.examForProduct('GOOGLE', sub.lineItems?.[0]?.productId ?? data.subscriptionNotification?.subscriptionId);
    const ent = await this.safeApply({ userId, examCode, source: 'GOOGLE', externalId: token, ...googleState(sub) });
    await this.markProcessed('GOOGLE', messageId, undefined, ent?.id);
  }

  // ---------- Web checkout: Paystack (primary) and Flutterwave (backup) ----------

  async startWebCheckout(userId: string, examCode: ExamCode, provider: 'PAYSTACK' | 'FLUTTERWAVE', promoCode?: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.email.endsWith('@children.ugo.local')) throw new BadRequestException('A parent account must pay for this profile');
    const cat = await this.catalog.byCode(examCode);
    let amountKobo = this.catalog.effectivePriceKobo(cat);
    let promo: { code: string; percentOff: number } | null = null;
    if (promoCode) {
      const p = await this.findPromo(promoCode, examCode);
      if (p.grantsPlan) throw new BadRequestException('Redeem this code in the app instead of paying');
      promo = { code: p.code, percentOff: p.percentOff };
      amountKobo = Math.round((amountKobo * (100 - p.percentOff)) / 100);
    }
    const reference = `ugo_${examCode}_${randomUUID()}`;
    const metadata = { userId, examCode, promo: promo?.code ?? null };
    if (provider === 'PAYSTACK') {
      // A discounted first payment is a one off charge; full price uses the auto renewing plan.
      const res = await this.paystack.initialize({ email: user.email, amountKobo, planCode: promo ? undefined : cat.paystackPlanCode ?? undefined, reference, metadata, callbackUrl: this.env.WEB_CHECKOUT_CALLBACK_URL });
      return { provider, checkoutUrl: res.authorization_url, reference, amountKobo };
    }
    const res = await this.flutterwave.createPayment({ txRef: reference, amountKobo, email: user.email, planId: promo ? undefined : cat.flutterwavePlanId ?? undefined, meta: metadata, redirectUrl: this.env.WEB_CHECKOUT_CALLBACK_URL });
    return { provider, checkoutUrl: res.link, reference, amountKobo };
  }

  async handlePaystackEvent(event: { event?: string; data?: Record<string, unknown> }) {
    const data = (event.data ?? {}) as Record<string, unknown>;
    const type = event.event ?? 'unknown';
    const ref = str(data.reference) || str(data.subscription_code) || str(data.id) || randomUUID();
    if (!(await this.recordEvent('PAYSTACK', `${type}:${ref}`, type, redactPaystack(data)))) return;

    if (type === 'charge.success') {
      // Never trust the webhook body alone: confirm with Paystack.
      const tx = await this.paystack.verify(str(data.reference));
      if (tx.status !== 'success' || tx.currency !== 'NGN') return this.markProcessed('PAYSTACK', `${type}:${ref}`, 'not successful');
      const ent = await this.grantWebYear('PAYSTACK', tx);
      return this.markProcessed('PAYSTACK', `${type}:${ref}`, ent ? undefined : 'no matching user', ent?.id);
    }
    const subCode = str(data.subscription_code) || str((data.subscription as { subscription_code?: string } | undefined)?.subscription_code);
    const customerCode = (data.customer as { customer_code?: string } | undefined)?.customer_code;
    const planCode = (data.plan as { plan_code?: string } | undefined)?.plan_code ?? (data.subscription as { plan?: { plan_code?: string } } | undefined)?.plan?.plan_code;
    const examCode = planCode ? await this.examForProduct('PAYSTACK', planCode).catch(() => null) : null;
    const where = { source: 'PAYSTACK' as const, ...(customerCode ? { externalId: customerCode } : {}), ...(examCode ? { examCode } : {}) };
    if (!customerCode && !subCode) return this.markProcessed('PAYSTACK', `${type}:${ref}`, 'no customer');

    if (type === 'subscription.not_renew' || type === 'subscription.disable') {
      await this.prisma.entitlement.updateMany({ where: { ...where, status: { in: ['ACTIVE', 'BILLING_RETRY', 'GRACE_PERIOD'] } }, data: { status: 'CANCELLED', autoRenew: false, lastEventAt: new Date() } });
    } else if (type === 'invoice.payment_failed') {
      await this.prisma.entitlement.updateMany({ where: { ...where, status: 'ACTIVE' }, data: { status: 'BILLING_RETRY', lastEventAt: new Date() } });
    } else if (type === 'refund.processed') {
      const original = await this.prisma.paymentEvent.findUnique({ where: { source_externalEventId: { source: 'PAYSTACK', externalEventId: `charge.success:${str(data.transaction_reference)}` } } });
      if (original?.entitlementId) await this.prisma.entitlement.update({ where: { id: original.entitlementId }, data: { status: 'REFUNDED', autoRenew: false, lastEventAt: new Date() } });
    }
    await this.markProcessed('PAYSTACK', `${type}:${ref}`);
  }

  async handleFlutterwaveEvent(event: { event?: string; data?: { id?: number; status?: string } }) {
    const id = event.data?.id;
    if (!id) return;
    if (!(await this.recordEvent('FLUTTERWAVE', `${event.event}:${id}`, event.event ?? 'unknown', { id, status: event.data?.status ?? null }))) return;
    if (event.event !== 'charge.completed') return this.markProcessed('FLUTTERWAVE', `${event.event}:${id}`);
    const tx = await this.flutterwave.verify(id);
    if (tx.status !== 'successful' || tx.currency !== 'NGN') return this.markProcessed('FLUTTERWAVE', `${event.event}:${id}`, 'not successful');
    const meta = (tx.meta ?? {}) as { userId?: string; examCode?: ExamCode };
    if (!meta.userId || !meta.examCode) return this.markProcessed('FLUTTERWAVE', `${event.event}:${id}`, 'missing meta');
    const ent = await this.extendYear({ userId: meta.userId, examCode: meta.examCode, source: 'FLUTTERWAVE', externalId: `fw:${meta.userId}`, pricePaidKobo: Math.round(tx.amount * 100), autoRenew: false });
    await this.markProcessed('FLUTTERWAVE', `${event.event}:${id}`, undefined, ent.id);
  }

  private async grantWebYear(source: 'PAYSTACK', tx: PaystackTransaction) {
    const meta = (typeof tx.metadata === 'string' ? safeJson(tx.metadata) : tx.metadata ?? {}) as { userId?: string; examCode?: ExamCode; promo?: string | null };
    const customerCode = tx.customer?.customer_code ?? '';
    const planCode = typeof tx.plan === 'string' ? tx.plan : tx.plan?.plan_code ?? tx.plan_object?.plan_code;
    let userId = meta.userId;
    let examCode = meta.examCode;
    if (!examCode && planCode) examCode = await this.examForProduct('PAYSTACK', planCode);
    if (!userId && customerCode && examCode) {
      // A renewal charge carries no metadata: find the user from the earlier purchase.
      userId = (await this.prisma.entitlement.findFirst({ where: { source, externalId: customerCode, examCode } }))?.userId;
    }
    if (!userId || !examCode) return null;
    if (meta.promo) await this.prisma.promoCode.update({ where: { code: meta.promo }, data: { redeemed: { increment: 1 } } }).catch(() => undefined);
    return this.extendYear({ userId, examCode, source, externalId: customerCode || `ps:${userId}`, pricePaidKobo: tx.amount, autoRenew: Boolean(planCode) && !meta.promo });
  }

  /** Web plans: each successful payment adds 12 months, starting from the current expiry if the plan is still running. */
  private async extendYear(input: { userId: string; examCode: ExamCode; source: PurchaseSource; externalId: string; pricePaidKobo?: number; autoRenew: boolean }) {
    const existing = await this.prisma.entitlement.findUnique({ where: { source_externalId_examCode: { source: input.source, externalId: input.externalId, examCode: input.examCode } } });
    const now = new Date();
    const from = existing && existing.expiresAt > now && ['ACTIVE', 'CANCELLED', 'BILLING_RETRY', 'GRACE_PERIOD'].includes(existing.status) ? existing.expiresAt : now;
    const ent = await this.entitlements.applyStoreState({
      ...input,
      startsAt: existing?.startsAt ?? now,
      status: input.autoRenew ? 'ACTIVE' : 'CANCELLED',
      expiresAt: addOneYear(from),
    });
    await this.audit.log({ action: 'billing.plan_extended', targetType: 'Entitlement', targetId: ent.id, metadata: { source: input.source, examCode: input.examCode } });
    return ent;
  }

  // ---------- Promo codes ----------

  async redeemPromo(userId: string, code: string, examCode: ExamCode) {
    const p = await this.findPromo(code, examCode);
    if (!p.grantsPlan) throw new BadRequestException('This code gives a discount at web checkout');
    const updated = await this.prisma.promoCode.updateMany({ where: { id: p.id, redeemed: { lt: p.maxRedemptions } }, data: { redeemed: { increment: 1 } } });
    if (updated.count !== 1) throw new BadRequestException('This code has been fully used');
    try {
      return await this.extendYear({ userId, examCode, source: 'PROMO', externalId: `promo:${p.code}:${userId}`, autoRenew: false });
    } catch (e) {
      throw e instanceof Prisma.PrismaClientKnownRequestError ? new ConflictException('Code already used on this account') : e;
    }
  }

  private async findPromo(code: string, examCode: ExamCode) {
    const p = await this.prisma.promoCode.findUnique({ where: { code: code.trim().toUpperCase() } });
    if (!p || p.expiresAt < new Date() || p.redeemed >= p.maxRedemptions || (p.examCode && p.examCode !== examCode)) throw new NotFoundException('This code is not valid');
    return p;
  }

  // ---------- helpers ----------

  private async examForProduct(source: PurchaseSource, productId: string | undefined): Promise<ExamCode> {
    if (!productId) throw new BadRequestException('Missing product');
    const field = source === 'APPLE' ? 'appleProductId' : source === 'GOOGLE' ? 'googleProductId' : source === 'PAYSTACK' ? 'paystackPlanCode' : 'flutterwavePlanId';
    const cat = await this.prisma.examCategory.findFirst({ where: { [field]: productId } });
    if (!cat) throw new BadRequestException(`Unknown product ${productId}`);
    return cat.code;
  }

  private async ownerOf(source: PurchaseSource, externalId: string | undefined): Promise<string | undefined> {
    if (!externalId) return undefined;
    return (await this.prisma.entitlement.findFirst({ where: { source, externalId } }))?.userId;
  }

  private async safeApply(input: Parameters<EntitlementsService['applyStoreState']>[0]) {
    try {
      return await this.entitlements.applyStoreState(input);
    } catch (e) {
      if ((e as Error).message === 'PURCHASE_OWNED_BY_ANOTHER_ACCOUNT') {
        throw new ForbiddenException({ message: 'This purchase belongs to another Ugo account', code: 'PURCHASE_OWNED_BY_ANOTHER_ACCOUNT' });
      }
      throw e;
    }
  }

  /** Stores each event once. Returns false when it was already processed (stores and gateways retry). */
  private async recordEvent(source: PurchaseSource, externalEventId: string, type: string, payload: Prisma.InputJsonValue): Promise<boolean> {
    try {
      await this.prisma.paymentEvent.create({ data: { source, externalEventId, type, payload } });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const prev = await this.prisma.paymentEvent.findUnique({ where: { source_externalEventId: { source, externalEventId } } });
        return !prev?.processedAt; // retry an event that failed half way
      }
      throw e;
    }
  }

  private async markProcessed(source: PurchaseSource, externalEventId: string, error?: string, entitlementId?: string) {
    await this.prisma.paymentEvent.update({ where: { source_externalEventId: { source, externalEventId } }, data: { processedAt: new Date(), error, entitlementId } });
  }
}

/** Keeps only what reconciliation needs. Card fields (bin, last4, authorization codes) are dropped. */
function redactPaystack(data: Record<string, unknown>): Prisma.InputJsonValue {
  const keep = ['reference', 'status', 'amount', 'currency', 'paid_at', 'subscription_code', 'transaction_reference', 'id'];
  const out: Record<string, unknown> = {};
  for (const k of keep) if (k in data) out[k] = data[k];
  const plan = data.plan as { plan_code?: string } | undefined;
  if (plan?.plan_code) out.plan_code = plan.plan_code;
  const customer = data.customer as { customer_code?: string } | undefined;
  if (customer?.customer_code) out.customer_code = customer.customer_code;
  return out as Prisma.InputJsonValue;
}

function str(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' ? String(v) : '';
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
