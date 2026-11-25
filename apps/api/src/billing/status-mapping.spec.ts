import { appleState, googleState } from './status-mapping.js';

const now = Date.parse('2026-06-01T00:00:00Z');
const day = 86_400_000;

describe('appleState', () => {
  it('active and auto renewing', () => {
    expect(appleState({ expiresDate: now + 30 * day }, { autoRenewStatus: 1 }, now)).toMatchObject({ status: 'ACTIVE', autoRenew: true });
  });
  it('cancelled keeps access until expiry', () => {
    expect(appleState({ expiresDate: now + 30 * day }, { autoRenewStatus: 0 }, now)).toMatchObject({ status: 'CANCELLED', autoRenew: false });
  });
  it('grace period after a failed renewal', () => {
    expect(appleState({ expiresDate: now - day }, { autoRenewStatus: 1, gracePeriodExpiresDate: now + 5 * day }, now)).toMatchObject({ status: 'GRACE_PERIOD' });
  });
  it('billing retry once grace is over', () => {
    expect(appleState({ expiresDate: now - day }, { autoRenewStatus: 1, isInBillingRetryPeriod: true }, now).status).toBe('BILLING_RETRY');
  });
  it('refund or revocation removes access', () => {
    expect(appleState({ expiresDate: now + 30 * day, revocationDate: now - day }, { autoRenewStatus: 1 }, now).status).toBe('REFUNDED');
  });
});

describe('googleState', () => {
  const item = (expiry: number, autoRenewEnabled = true) => [{ productId: 'plan_waec', expiryTime: new Date(expiry).toISOString(), autoRenewingPlan: { autoRenewEnabled } }];
  it('maps each subscription state', () => {
    expect(googleState({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: item(now + day) }, now).status).toBe('ACTIVE');
    expect(googleState({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', lineItems: item(now + day, false) }, now).status).toBe('CANCELLED');
    expect(googleState({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', lineItems: item(now - day, false) }, now).status).toBe('EXPIRED');
    expect(googleState({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', lineItems: item(now + day) }, now).status).toBe('GRACE_PERIOD');
    expect(googleState({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD', lineItems: item(now - day) }, now).status).toBe('BILLING_RETRY');
    expect(googleState({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING', lineItems: item(now + day) }, now).status).toBe('EXPIRED');
  });
});
