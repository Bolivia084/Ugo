import { Module } from '@nestjs/common';
import { BillingController, WebhooksController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { RenewalRemindersJob } from './renewal-reminders.job.js';
import { AppleVerifier, GoogleVerifier } from './store-verifiers.js';
import { FlutterwaveClient, PaystackClient } from './web-payments.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

@Module({
  imports: [NotificationsModule],
  controllers: [BillingController, WebhooksController],
  providers: [BillingService, AppleVerifier, GoogleVerifier, PaystackClient, FlutterwaveClient, RenewalRemindersJob],
})
export class BillingModule {}
