import { Module } from '@nestjs/common';
import { ContentAdminController, ContentController } from './content.controller.js';
import { ContentService } from './content.service.js';
import { ScheduledPublishJob } from './scheduled-publish.job.js';
import { StorageService } from './storage.service.js';

@Module({ controllers: [ContentController, ContentAdminController], providers: [ContentService, StorageService, ScheduledPublishJob], exports: [ContentService, StorageService] })
export class ContentModule {}
