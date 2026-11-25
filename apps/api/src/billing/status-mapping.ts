import type { EntitlementStatus } from '@prisma/client';

export interface StoreState {
  status: EntitlementStatus;
  expiresAt: Date;
  autoRenew: boolean;
}

/** Apple: from a verified transaction and renewal info (App Store Server API / Notifications V2). */
export function appleState(
  tx: { expiresDate?: number; revocationDate?: number },
  renewal: { autoRenewStatus?: number; isInBillingRetryPeriod?: boolean; gracePeriodExpiresDate?: number } | undefined,
  now = Date.now(),
): StoreState {
  const expires = tx.expiresDate ?? 0;
  const autoRenew = renewal?.autoRenewStatus === 1;
  if (tx.revocationDate) return { status: 'REFUNDED', expiresAt: new Date(tx.revocationDate), autoRenew: false };
  if (renewal?.gracePeriodExpiresDate && renewal.gracePeriodExpiresDate > now && expires <= now) {
    return { status: 'GRACE_PERIOD', expiresAt: new Date(renewal.gracePeriodExpiresDate), autoRenew };
  }
  if (expires <= now) return { status: renewal?.isInBillingRetryPeriod ? 'BILLING_RETRY' : 'EXPIRED', expiresAt: new Date(expires), autoRenew };
  return { status: autoRenew ? 'ACTIVE' : 'CANCELLED', expiresAt: new Date(expires), autoRenew };
}

/** Google Play: from purchases.subscriptionsv2.get. */
export interface GoogleSubscriptionV2 {
  subscriptionState?: string;
  lineItems?: { productId?: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean } }[];
  acknowledgementState?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  startTime?: string;
}

export function googleState(sub: GoogleSubscriptionV2, now = Date.now()): StoreState {
  const item = sub.lineItems?.[0];
  const expiresAt = new Date(item?.expiryTime ?? now);
  const autoRenew = Boolean(item?.autoRenewingPlan?.autoRenewEnabled);
  switch (sub.subscriptionState) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return { status: autoRenew ? 'ACTIVE' : 'CANCELLED', expiresAt, autoRenew };
    case 'SUBSCRIPTION_STATE_CANCELED':
      return { status: expiresAt.getTime() > now ? 'CANCELLED' : 'EXPIRED', expiresAt, autoRenew: false };
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      return { status: 'GRACE_PERIOD', expiresAt, autoRenew };
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      return { status: 'BILLING_RETRY', expiresAt, autoRenew };
    case 'SUBSCRIPTION_STATE_PAUSED':
    case 'SUBSCRIPTION_STATE_EXPIRED':
    case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED':
      return { status: 'EXPIRED', expiresAt, autoRenew: false };
    case 'SUBSCRIPTION_STATE_PENDING':
    default:
      // Not paid yet (for example a cash payment still pending): no access.
      return { status: 'EXPIRED', expiresAt: new Date(now), autoRenew };
  }
}
