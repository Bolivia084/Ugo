import { Global, Module } from '@nestjs/common';
import { EntitlementSigner } from './entitlement-signer.service.js';
import { EntitlementsService } from './entitlements.service.js';

/** Entitlement checks used across the app (content, tutor, catalogue). */
@Global()
@Module({ providers: [EntitlementSigner, EntitlementsService], exports: [EntitlementSigner, EntitlementsService] })
export class BillingCoreModule {}
