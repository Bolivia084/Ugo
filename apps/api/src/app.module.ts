import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BillingCoreModule } from './billing/billing-core.module.js';
import { BillingModule } from './billing/billing.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { AuthGuard } from './common/auth.guard.js';
import { CommonModule } from './common/common.module.js';
import { AppConfigModule } from './config/config.module.js';
import { ContentModule } from './content/content.module.js';
import { HealthController } from './health.controller.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ProgressModule } from './progress/progress.module.js';
import { TutorModule } from './tutor/tutor.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    CommonModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: Number(process.env.THROTTLE_LIMIT ?? 120) }],
      getTracker: (req: Record<string, unknown>) => {
        const user = req.user as { id?: string } | undefined;
        return user?.id ? `user:${user.id}` : `ip:${String(req.ip)}`;
      },
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    BillingCoreModule,
    CatalogModule,
    NotificationsModule,
    UsersModule,
    ContentModule,
    ProgressModule,
    BillingModule,
    TutorModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authentication runs first so the rate limiter can key on the user.
    { provide: APP_GUARD, useClass: AuthGuard },
    ThrottlerGuard,
    { provide: APP_GUARD, useExisting: ThrottlerGuard },
  ],
})
export class AppModule {}
