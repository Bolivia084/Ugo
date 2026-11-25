import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { ParentsController } from './parents.controller.js';
import { UsersController } from './users.controller.js';

@Module({ imports: [AuthModule], controllers: [UsersController, ParentsController], providers: [AccountDeletionService], exports: [AccountDeletionService] })
export class UsersModule {}
