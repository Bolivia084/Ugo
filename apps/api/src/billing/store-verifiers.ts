import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Environment, SignedDataVerifier } from '@apple/app-store-server-library';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import type { GoogleSubscriptionV2 } from './status-mapping.js';

/**
 * Verifies StoreKit 2 signed transactions and App Store Server Notifications V2.
 * Needs Apple's root certificates (download from https://www.apple.com/certificateauthority/)
 * in APPLE_ROOT_CERTS_DIR, and the app's Apple ID in production.
 */
@Injectable()
export class AppleVerifier {
  private readonly verifier: SignedDataVerifier | null;

  constructor(@Inject(ENV) env: Env) {
    if (!env.APPLE_ROOT_CERTS_DIR) {
      this.verifier = null;
      return;
    }
    const certs = readdirSync(env.APPLE_ROOT_CERTS_DIR)
      .filter((f) => f.endsWith('.cer'))
      .map((f) => readFileSync(join(env.APPLE_ROOT_CERTS_DIR!, f)));
    const environment = env.APPLE_ENVIRONMENT === 'Production' ? Environment.PRODUCTION : Environment.SANDBOX;
    this.verifier = new SignedDataVerifier(certs, true, environment, env.APPLE_BUNDLE_ID, env.APPLE_APP_ID);
  }

  private get v(): SignedDataVerifier {
    if (!this.verifier) throw new ServiceUnavailableException('App Store verification is not configured');
    return this.verifier;
  }

  transaction(jws: string) {
    return this.v.verifyAndDecodeTransaction(jws);
  }
  renewalInfo(jws: string) {
    return this.v.verifyAndDecodeRenewalInfo(jws);
  }
  notification(signedPayload: string) {
    return this.v.verifyAndDecodeNotification(signedPayload);
  }
}

/** Google Play Developer API (subscriptions v2) and Real-time Developer Notifications. */
@Injectable()
export class GoogleVerifier {
  private readonly logger = new Logger(GoogleVerifier.name);
  private readonly auth: GoogleAuth | null;
  private readonly oidc = new OAuth2Client();
  private readonly base: string;

  constructor(@Inject(ENV) private readonly env: Env) {
    this.auth = env.GOOGLE_SERVICE_ACCOUNT_JSON
      ? new GoogleAuth({ credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON), scopes: ['https://www.googleapis.com/auth/androidpublisher'] })
      : null;
    this.base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(env.GOOGLE_PACKAGE_NAME)}`;
  }

  private async client() {
    if (!this.auth) throw new ServiceUnavailableException('Google Play verification is not configured');
    return this.auth.getClient();
  }

  async subscription(purchaseToken: string): Promise<GoogleSubscriptionV2> {
    const c = await this.client();
    const res = await c.request<GoogleSubscriptionV2>({ url: `${this.base}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}` });
    return res.data;
  }

  /** Google refunds unacknowledged purchases after three days, so every new purchase is acknowledged. */
  async acknowledge(productId: string, purchaseToken: string): Promise<void> {
    const c = await this.client();
    await c.request({
      url: `${this.base}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
      method: 'POST',
      data: {},
    });
  }

  /** Pub/Sub push requests carry a Google signed OIDC token. */
  async verifyPushToken(authorization: string | undefined): Promise<boolean> {
    if (!authorization?.startsWith('Bearer ') || !this.env.GOOGLE_RTDN_AUDIENCE) return false;
    try {
      const ticket = await this.oidc.verifyIdToken({ idToken: authorization.slice(7), audience: this.env.GOOGLE_RTDN_AUDIENCE });
      const p = ticket.getPayload();
      const expectedEmail = this.env.GOOGLE_RTDN_SERVICE_ACCOUNT_EMAIL;
      return Boolean(p?.email_verified && (!expectedEmail || p.email === expectedEmail));
    } catch (e) {
      this.logger.warn(`RTDN token rejected: ${(e as Error).message}`);
      return false;
    }
  }
}
