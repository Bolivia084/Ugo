import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { isChild, leaderboardDefaultOn } from '@ugo/shared';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AuthService, CONSENT_VERSION } from '../auth/auth.service.js';
import { password } from '../auth/auth.schemas.js';
import { TokensService } from '../auth/tokens.service.js';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { safeEqual, sha256 } from '../common/crypto.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccountDeletionService, CHILD_EMAIL_DOMAIN } from './account-deletion.service.js';

const createChildSchema = z
  .object({
    fullName: z.string().trim().min(1).max(80),
    displayName: z.string().trim().min(2).max(24).regex(/^[\p{L}\p{N} _.-]+$/u),
    dateOfBirth: z.iso.date(),
    /** Optional: older learners can have their own sign in. Younger children use their parent's device. */
    email: z.email().transform((v) => v.toLowerCase()).optional(),
    password: password.optional(),
  })
  .strict()
  .refine((v) => !v.email || v.password, { message: 'A password is needed when the child has their own email', path: ['password'] });

const consentSchema = z.object({ code: z.string().regex(/^\d{8}$/) }).strict();
const childSettingsSchema = z.object({ allowLeaderboard: z.boolean() }).strict();

@Controller('parents')
@Roles('PARENT')
export class ParentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    private readonly deletion: AccountDeletionService,
  ) {}

  @Get('children')
  async children(@CurrentUser() parent: AuthUser) {
    const links = await this.prisma.parentLink.findMany({
      where: { parentId: parent.id, status: 'ACTIVE' },
      include: { child: { select: { id: true, displayName: true, fullName: true, dateOfBirth: true, email: true, parentAllowsLeaderboard: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return links.map((l) => ({
      id: l.child.id,
      displayName: l.child.displayName,
      fullName: l.child.fullName,
      dateOfBirth: l.child.dateOfBirth?.toISOString().slice(0, 10) ?? null,
      hasOwnLogin: !l.child.email.endsWith(`@${CHILD_EMAIL_DOMAIN}`),
      allowLeaderboard: l.child.parentAllowsLeaderboard,
      consentGivenAt: l.consentGivenAt,
    }));
  }

  /** A parent creates a learner profile. Consent is given by the verified, MFA protected parent in the same step. */
  @Post('children')
  async createChild(@CurrentUser() parent: AuthUser, @Body({ schema: createChildSchema }) body: z.infer<typeof createChildSchema>) {
    await this.requireVerifiedParent(parent.id);
    const id = randomUUID();
    const child = await this.prisma.user
      .create({
        data: {
          id,
          email: body.email ?? `child-${id}@${CHILD_EMAIL_DOMAIN}`,
          passwordHash: await this.auth.hashPassword(body.password ?? randomUUID()),
          role: 'LEARNER',
          status: 'ACTIVE',
          fullName: body.fullName,
          displayName: body.displayName,
          dateOfBirth: new Date(body.dateOfBirth),
          emailVerifiedAt: body.email ? null : new Date(),
          mfaEnabled: Boolean(body.email),
          leaderboardOptIn: leaderboardDefaultOn(body.dateOfBirth),
          parentLinks: {
            create: { parentId: parent.id, status: 'ACTIVE', consentGivenAt: new Date(), consentMethod: 'PARENT_CREATED_PROFILE', consentVersion: CONSENT_VERSION },
          },
        },
      })
      .catch((e: { code?: string }) => {
        if (e.code === 'P2002') throw new ConflictException('An account with this email already exists');
        throw e;
      });
    await this.audit.log({ actorId: parent.id, action: 'parent.child_created', targetType: 'User', targetId: child.id });
    return { id: child.id, displayName: child.displayName };
  }

  /** Approves a learner who signed up alone and named this parent's email. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('consent')
  @HttpCode(200)
  async consent(@CurrentUser() parent: AuthUser, @Body({ schema: consentSchema }) body: z.infer<typeof consentSchema>) {
    const p = await this.requireVerifiedParent(parent.id);
    const requests = await this.prisma.consentRequest.findMany({ where: { parentEmail: p.email, consumedAt: null, expiresAt: { gt: new Date() } } });
    const match = requests.find((r) => safeEqual(r.codeHash, sha256(`${r.childId}:${body.code}`)));
    if (!match) throw new BadRequestException('That code is not valid for your email address');
    await this.prisma.$transaction([
      this.prisma.consentRequest.update({ where: { id: match.id }, data: { consumedAt: new Date() } }),
      this.prisma.parentLink.upsert({
        where: { parentId_childId: { parentId: parent.id, childId: match.childId } },
        create: { parentId: parent.id, childId: match.childId, status: 'ACTIVE', consentGivenAt: new Date(), consentMethod: 'EMAIL_CODE_VERIFIED_PARENT', consentVersion: CONSENT_VERSION },
        update: { status: 'ACTIVE', consentGivenAt: new Date(), consentMethod: 'EMAIL_CODE_VERIFIED_PARENT', consentVersion: CONSENT_VERSION },
      }),
      this.prisma.user.update({ where: { id: match.childId }, data: { status: 'ACTIVE' } }),
    ]);
    await this.audit.log({ actorId: parent.id, action: 'parent.consent_given', targetType: 'User', targetId: match.childId });
    return { childId: match.childId };
  }

  /** Lets a child use the parent's phone: signs in to the child's profile with its own session. */
  @Post('children/:id/session')
  @HttpCode(200)
  async childSession(@CurrentUser() parent: AuthUser, @Param('id', ParseUUIDPipe) childId: string, @Req() req: Request) {
    await this.requireLink(parent.id, childId);
    await this.audit.log({ actorId: parent.id, action: 'parent.child_session', targetType: 'User', targetId: childId });
    return this.tokens.issue(childId, req.headers['user-agent']);
  }

  @Patch('children/:id')
  async settings(@CurrentUser() parent: AuthUser, @Param('id', ParseUUIDPipe) childId: string, @Body({ schema: childSettingsSchema }) body: z.infer<typeof childSettingsSchema>) {
    await this.requireLink(parent.id, childId);
    await this.prisma.user.update({
      where: { id: childId },
      data: { parentAllowsLeaderboard: body.allowLeaderboard, ...(body.allowLeaderboard ? {} : { leaderboardOptIn: false }) },
    });
    return { allowLeaderboard: body.allowLeaderboard };
  }

  /** Withdrawing consent deletes the child's data unless another parent still consents. */
  @Delete('children/:id')
  @HttpCode(204)
  async withdraw(@CurrentUser() parent: AuthUser, @Param('id', ParseUUIDPipe) childId: string) {
    await this.requireLink(parent.id, childId);
    const others = await this.prisma.parentLink.count({ where: { childId, status: 'ACTIVE', parentId: { not: parent.id } } });
    if (others > 0) {
      await this.prisma.parentLink.update({ where: { parentId_childId: { parentId: parent.id, childId } }, data: { status: 'REVOKED' } });
      return;
    }
    const child = await this.prisma.user.findUniqueOrThrow({ where: { id: childId } });
    if (child.dateOfBirth && !isChild(child.dateOfBirth)) {
      await this.prisma.parentLink.update({ where: { parentId_childId: { parentId: parent.id, childId } }, data: { status: 'REVOKED' } });
      return; // an adult learner keeps their own account
    }
    await this.deletion.deleteUser(childId, parent.id);
  }

  private async requireVerifiedParent(parentId: string) {
    const p = await this.prisma.user.findUniqueOrThrow({ where: { id: parentId } });
    if (!p.emailVerifiedAt) throw new BadRequestException({ message: 'Verify your email address first', code: 'EMAIL_NOT_VERIFIED' });
    return p;
  }

  private async requireLink(parentId: string, childId: string) {
    const link = await this.prisma.parentLink.findUnique({ where: { parentId_childId: { parentId, childId } } });
    if (!link || link.status !== 'ACTIVE') throw new NotFoundException('Child not found');
    return link;
  }
}
