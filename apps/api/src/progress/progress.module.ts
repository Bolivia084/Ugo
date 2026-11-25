import { Module } from '@nestjs/common';
import { ContentModule } from '../content/content.module.js';
import { ProgressController } from './progress.controller.js';
import { ProgressService } from './progress.service.js';

@Module({ imports: [ContentModule], controllers: [ProgressController], providers: [ProgressService], exports: [ProgressService] })
export class ProgressModule {}
