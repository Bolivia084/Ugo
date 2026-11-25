import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { z } from 'zod';
import type { AuthUser } from '../common/auth-user.js';
import { AllowPendingConsent, CurrentUser, Public } from '../common/decorators.js';
import {
  confirmPasswordSchema,
  loginSchema,
  mfaMethodSchema,
  mfaVerifySchema,
  refreshSchema,
  registerSchema,
  resetConfirmSchema,
  resetRequestSchema,
  totpConfirmSchema,
  verifyEmailSchema,
  type RegisterInput,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { TokensService } from './tokens.service.js';

/** Stricter limits on sign in, codes and resets: 10 a minute per IP. */
const STRICT = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
  ) {}

  @Public()
  @Throttle(STRICT)
  @Post('register')
  register(@Body({ schema: registerSchema }) body: RegisterInput, @Req() req: Request) {
    return this.auth.register(body, req.headers['user-agent']);
  }

  @Public()
  @Throttle(STRICT)
  @Post('login')
  @HttpCode(200)
  login(@Body({ schema: loginSchema }) body: z.infer<typeof loginSchema>, @Req() req: Request) {
    return this.auth.login(body.email, body.password, req.headers['user-agent'], req.ip);
  }

  @Public()
  @Throttle(STRICT)
  @Post('mfa/verify')
  @HttpCode(200)
  verifyMfa(@Body({ schema: mfaVerifySchema }) body: z.infer<typeof mfaVerifySchema>, @Req() req: Request) {
    return this.auth.verifyMfa(body.challengeId, body.code, req.headers['user-agent'], req.ip);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body({ schema: refreshSchema }) body: z.infer<typeof refreshSchema>, @Req() req: Request) {
    return this.tokens.rotate(body.refreshToken, req.headers['user-agent']);
  }

  @AllowPendingConsent()
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser) {
    await this.tokens.revokeFamily(user.sessionFamilyId);
  }

  @AllowPendingConsent()
  @Post('logout-all')
  @HttpCode(204)
  async logoutAll(@CurrentUser() user: AuthUser) {
    await this.tokens.revokeAllForUser(user.id);
  }

  @AllowPendingConsent()
  @Throttle(STRICT)
  @Post('verify-email')
  @HttpCode(204)
  async verifyEmail(@CurrentUser() user: AuthUser, @Body({ schema: verifyEmailSchema }) body: z.infer<typeof verifyEmailSchema>) {
    await this.auth.verifyEmail(user.id, body.code);
  }

  @AllowPendingConsent()
  @Throttle(STRICT)
  @Post('verify-email/resend')
  @HttpCode(204)
  async resend(@CurrentUser() user: AuthUser) {
    await this.auth.resendEmailCode(user.id);
  }

  @Public()
  @Throttle(STRICT)
  @Post('password-reset/request')
  @HttpCode(204)
  async resetRequest(@Body({ schema: resetRequestSchema }) body: z.infer<typeof resetRequestSchema>) {
    await this.auth.requestPasswordReset(body.email);
  }

  @Public()
  @Throttle(STRICT)
  @Post('password-reset/confirm')
  @HttpCode(204)
  async resetConfirm(@Body({ schema: resetConfirmSchema }) body: z.infer<typeof resetConfirmSchema>) {
    await this.auth.confirmPasswordReset(body.email, body.code, body.newPassword);
  }

  @Throttle(STRICT)
  @Post('mfa/method')
  @HttpCode(200)
  async setMethod(@CurrentUser() user: AuthUser, @Body({ schema: mfaMethodSchema.extend(confirmPasswordSchema.shape) }) body: z.infer<typeof mfaMethodSchema> & { password: string }) {
    await this.auth.checkPassword(user.id, body.password);
    return this.auth.setMfaMethod(user.id, body.method, body.phone);
  }

  @Throttle(STRICT)
  @Post('mfa/totp/confirm')
  @HttpCode(204)
  async confirmTotp(@CurrentUser() user: AuthUser, @Body({ schema: totpConfirmSchema }) body: z.infer<typeof totpConfirmSchema>) {
    await this.auth.confirmTotp(user.id, body.code);
  }
}
