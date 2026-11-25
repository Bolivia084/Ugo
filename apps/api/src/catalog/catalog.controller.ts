import { Controller, Get, Inject } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { Public } from '../common/decorators.js';
import { EntitlementSigner } from '../billing/entitlement-signer.service.js';
import { CatalogService } from './catalog.service.js';
import { SettingsService } from './settings.service.js';

@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly settings: SettingsService,
    private readonly signer: EntitlementSigner,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Get('catalog')
  list() {
    return this.catalog.list();
  }

  /** Read by the app at start up: forced update check, maintenance notice and the offline entitlement key. */
  @Public()
  @Get('app-config')
  async appConfig() {
    const s = await this.settings.all();
    return {
      minSupportedVersion: s.minSupportedVersion,
      latestVersion: s.latestVersion,
      maintenanceMessage: s.maintenanceMessage,
      freeSampleMockQuestions: s.freeSampleMockQuestions,
      freeSampleMockMinutes: s.freeSampleMockMinutes,
      showWebCheckoutInApp: s.showWebCheckoutInApp,
      entitlementPublicKey: this.signer.publicKeyBase64(),
      environment: this.env.NODE_ENV,
    };
  }
}
