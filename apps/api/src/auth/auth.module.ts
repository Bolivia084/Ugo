import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OtpService } from './otp.service.js';
import { TokensService } from './tokens.service.js';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ENV],
      useFactory: (env: Env) => ({ secret: env.JWT_ACCESS_SECRET, signOptions: { algorithm: 'HS256', issuer: 'ugo-api' }, verifyOptions: { issuer: 'ugo-api' } }),
    }),
    NotificationsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService, OtpService],
  exports: [AuthService, TokensService],
})
export class AuthModule {}
