import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller.js';
import { EmailService } from './email.service.js';
import { PushService } from './push.service.js';

@Module({ controllers: [DevicesController], providers: [EmailService, PushService], exports: [EmailService, PushService] })
export class NotificationsModule {}
