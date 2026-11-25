import { Global, Module } from '@nestjs/common';
import { BillingCoreModule } from '../billing/billing-core.module.js';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';
import { SettingsService } from './settings.service.js';

@Global()
@Module({ imports: [BillingCoreModule], controllers: [CatalogController], providers: [CatalogService, SettingsService], exports: [CatalogService, SettingsService] })
export class CatalogModule {}
