import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ageOn, canJoinLeaderboard } from '@ugo/shared';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { confirmPasswordSchema, deleteAccountSchema } from '../auth/auth.schemas.js';
import type { AuthUser } from '../common/auth-user.js';
import { AllowPendingConsent, CurrentUser, Public } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccountDeletionService } from './account-deletion.service.js';

const updateMeSchema = z
  .object({
    displayName: z.string().trim().min(2).max(24).regex(/^[\p{L}\p{N} _.-]+$/u),
    leaderboardOptIn: z.boolean(),
  })
  .partial()
  .strict();

@Controller()
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly deletion: AccountDeletionService,
  ) {}

  @AllowPendingConsent()
  @Get('me')
  async me(@CurrentUser() current: AuthUser) {
    const u = await this.prisma.user.findUniqueOrThrow({
      where: { id: current.id },
      include: { parentLinks: { where: { status: 'ACTIVE' }, select: { parentId: true } } },
    });
    return {
      id: u.id,
      email: u.email,
      role: u.role,
      status: u.status,
      fullName: u.fullName,
      displayName: u.displayName,
      dateOfBirth: u.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      age: u.dateOfBirth ? ageOn(u.dateOfBirth) : null,
      emailVerified: Boolean(u.emailVerifiedAt),
      mfaMethod: u.mfaMethod,
      leaderboardOptIn: u.leaderboardOptIn,
      hasParent: u.parentLinks.length > 0,
    };
  }

  @Patch('me')
  async update(@CurrentUser() current: AuthUser, @Body({ schema: updateMeSchema }) body: z.infer<typeof updateMeSchema>) {
    if (body.leaderboardOptIn === true) {
      const u = await this.prisma.user.findUniqueOrThrow({ where: { id: current.id } });
      if (u.dateOfBirth && !canJoinLeaderboard(u.dateOfBirth, u.parentAllowsLeaderboard)) {
        throw new ForbiddenException({ message: 'Ask a parent to switch on leaderboards for you', code: 'PARENT_PERMISSION_REQUIRED' });
      }
    }
    await this.prisma.user.update({ where: { id: current.id }, data: body });
    return this.me(current);
  }

  /** In app account deletion. Needs the password again. */
  @AllowPendingConsent()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Delete('me')
  @HttpCode(204)
  async deleteMe(@CurrentUser() current: AuthUser, @Body({ schema: confirmPasswordSchema }) body: z.infer<typeof confirmPasswordSchema>) {
    await this.auth.checkPassword(current.id, body.password);
    await this.deletion.deleteUser(current.id);
  }

  /** Account deletion from the website, for people who no longer have the app installed. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('account/delete')
  @HttpCode(204)
  async deleteFromWeb(@Body({ schema: deleteAccountSchema }) body: z.infer<typeof deleteAccountSchema>) {
    const result = await this.auth.login(body.email, body.password);
    // MFA still applies: the web page completes deletion through /auth/mfa/verify then DELETE /me.
    if (result.mfaRequired) return;
    const user = await this.prisma.user.findUniqueOrThrow({ where: { email: body.email } });
    await this.deletion.deleteUser(user.id);
  }
}
