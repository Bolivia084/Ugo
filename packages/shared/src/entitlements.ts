import type { Entitlement, EntitlementStatus, ExamCode, SignedEntitlementPayload } from './types';

/** Statuses that still give access, as long as the expiry date has not passed. */
const ACCESS_STATUSES: EntitlementStatus[] = ['ACTIVE', 'GRACE_PERIOD', 'BILLING_RETRY', 'CANCELLED'];

export function grantsAccess(e: Pick<Entitlement, 'status' | 'expiresAt'>, now: Date = new Date()): boolean {
  return ACCESS_STATUSES.includes(e.status) && new Date(e.expiresAt).getTime() > now.getTime();
}

export function hasAccess(
  entitlements: Pick<Entitlement, 'examCode' | 'status' | 'expiresAt'>[],
  examCode: ExamCode,
  now: Date = new Date(),
): boolean {
  return entitlements.some((e) => e.examCode === examCode && grantsAccess(e, now));
}

export function activeExamCodes(
  entitlements: Pick<Entitlement, 'examCode' | 'status' | 'expiresAt'>[],
  now: Date = new Date(),
): ExamCode[] {
  return [...new Set(entitlements.filter((e) => grantsAccess(e, now)).map((e) => e.examCode))];
}

/** A plan lasts 12 months from purchase. Uses calendar months, clamped to the end of shorter months. */
export function addOneYear(start: Date): Date {
  const d = new Date(start.getTime());
  const month = d.getUTCMonth();
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  if (d.getUTCMonth() !== month) d.setUTCDate(0); // 29 Feb -> 28 Feb
  return d;
}

/** Renewal reminders go out 7 days before renewal. */
export const RENEWAL_REMINDER_DAYS = 7;

export function isDueForRenewalReminder(e: Pick<Entitlement, 'status' | 'expiresAt' | 'autoRenew'>, now: Date = new Date()): boolean {
  if (!e.autoRenew || e.status !== 'ACTIVE') return false;
  const ms = new Date(e.expiresAt).getTime() - now.getTime();
  return ms > 0 && ms <= RENEWAL_REMINDER_DAYS * 24 * 3600 * 1000;
}

/**
 * Offline check on the device. The signature is checked separately (see the app's
 * entitlement cache). Content stays unlocked until the plan's own expiry, but the
 * app must recheck with the server once the cache's `exp` passes and it is online.
 */
export function offlineAccess(payload: SignedEntitlementPayload, examCode: ExamCode, now: Date = new Date()): boolean {
  return hasAccess(payload.entitlements, examCode, now);
}
