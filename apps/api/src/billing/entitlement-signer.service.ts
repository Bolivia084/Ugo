import { Inject, Injectable, Logger } from '@nestjs/common';
import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject, sign } from 'node:crypto';
import type { SignedEntitlementPayload } from '@ugo/shared';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';

/** How long the app may rely on a cached entitlement before it must ask the server again (when online). */
export const ENTITLEMENT_RECHECK_SECONDS = 7 * 86_400;

/**
 * Signs the list of plans a user holds with Ed25519, so the app can unlock paid content
 * offline and detect tampering. The app ships with the public key and also receives it from /app-config.
 */
@Injectable()
export class EntitlementSigner {
  private readonly logger = new Logger(EntitlementSigner.name);
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;

  constructor(@Inject(ENV) env: Env) {
    if (env.ENTITLEMENT_SIGNING_KEY) {
      this.privateKey = createPrivateKey({ key: Buffer.from(env.ENTITLEMENT_SIGNING_KEY, 'base64'), format: 'der', type: 'pkcs8' });
    } else {
      this.logger.warn('ENTITLEMENT_SIGNING_KEY not set: using a temporary key (development only)');
      this.privateKey = generateKeyPairSync('ed25519').privateKey;
    }
    this.publicKey = createPublicKey(this.privateKey);
  }

  /** Raw 32 byte public key, base64. */
  publicKeyBase64(): string {
    const der = this.publicKey.export({ format: 'der', type: 'spki' });
    return der.subarray(der.length - 32).toString('base64');
  }

  /** Token format: base64url(JSON payload) + "." + base64url(signature over the first part). */
  sign(payload: SignedEntitlementPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = sign(null, Buffer.from(body), this.privateKey).toString('base64url');
    return `${body}.${sig}`;
  }
}
