import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import * as argon2 from 'argon2';
import { isChild, leaderboardDefaultOn, MFA_REQUIRED_ROLES } from '@ugo/shared';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AuditService } from '../common/audit.service.js';
import { base32Encode, decryptField, encryptField, numericCode, sha256, verifyTotp } from '../common/crypto.js';
import { EmailService } from '../notifications/email.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RegisterInput } from './auth.schemas.js';
import { OtpService } from './otp.service.js';
import { type TokenPair, TokensService } from './tokens.service.js';
import { randomBytes } from 'node:crypto';

/** OWASP recommended Argon2id settings: 19 MiB memory, 2 iterations, 1 lane. */
const ARGON2 = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
export const CONSENT_VERSION = '2026-11';

export type LoginResult =
  | ({ mfaRequired: false; status: User['status'] } & TokenPair)
  | { mfaRequired: true; challengeId: string; method: User['mfaMethod'] };

@Injectable()
export class AuthService {
  private dummyHash: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly otp: OtpService,
    private readonly email: EmailService,
    private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {
    // Used when the email is unknown, so a wrong email takes as long as a wrong password.
    this.dummyHash = argon2.hash('not-a-real-password-0', ARGON2);
  }

  hashPassword(pw: string) {
    return argon2.hash(pw, ARGON2);
  }

  async register(input: RegisterInput, userAgent?: string) {
    const child = isChild(input.dateOfBirth);
    if (input.role === 'PARENT' && child) throw new BadRequestException('Parent and guardian accounts are for adults (18 and over)');
    if (input.role === 'LEARNER' && child && !input.parentEmail) {
      throw new BadRequestException({ message: 'Learners under 18 need a parent or guardian email', code: 'PARENT_EMAIL_REQUIRED' });
    }
    if (input.parentEmail && input.parentEmail === input.email) throw new BadRequestException('Use your parent or guardian’s own email');

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash: await this.hashPassword(input.password),
          role: input.role,
          status: input.role === 'LEARNER' && child ? 'PENDING_CONSENT' : 'ACTIVE',
          fullName: input.fullName,
          displayName: input.displayName,
          dateOfBirth: new Date(input.dateOfBirth),
          leaderboardOptIn: input.role === 'LEARNER' && leaderboardDefaultOn(input.dateOfBirth),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('An account with this email already exists');
      throw e;
    }

    const { code } = await this.otp.create(user.id, 'VERIFY_EMAIL');
    await this.email.send({ to: user.email, subject: 'Your Ugo verification code', text: `Your Ugo verification code is ${code}. It expires in 10 minutes.` });

    if (user.status === 'PENDING_CONSENT' && input.parentEmail) await this.requestParentConsent(user, input.parentEmail);
    await this.audit.log({ actorId: user.id, action: 'auth.register', targetType: 'User', targetId: user.id, metadata: { role: user.role, status: user.status, terms: input.acceptedTermsVersion } });

    // A new account has just proved control of nothing yet, so it signs in without MFA once; MFA applies from the next sign in.
    const pair = await this.tokens.issue(user.id, userAgent);
    return { ...pair, status: user.status, userId: user.id };
  }

  async requestParentConsent(child: Pick<User, 'id' | 'displayName'>, parentEmail: string) {
    const code = numericCode(8);
    await this.prisma.consentRequest.create({
      data: { childId: child.id, parentEmail, codeHash: sha256(`${child.id}:${code}`), expiresAt: new Date(Date.now() + 14 * 86_400_000) },
    });
    await this.email.send({
      to: parentEmail,
      subject: `${child.displayName} wants to use Ugo`,
      text:
        `${child.displayName} has signed up for Ugo, an exam practice app, and named you as their parent or guardian.\n\n` +
        `Under the Nigeria Data Protection Act 2023 we need your consent before we process their data. ` +
        `To approve, sign in to (or create) a Ugo parent account and enter this code: ${code}\n\n` +
        `The code expires in 14 days. If you do not know this child, ignore this email and the account will not be activated.`,
    });
  }

  async login(emailAddr: string, pw: string, userAgent?: string, ip?: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email: emailAddr } });
    const ok = await argon2.verify(user?.passwordHash ?? (await this.dummyHash), pw).catch(() => false);
    if (!user || user.deletedAt || user.status === 'DELETED') throw new UnauthorizedException('Wrong email or password');
    if (user.lockedUntil && user.lockedUntil > new Date()) throw new UnauthorizedException('Too many attempts. Try again in a few minutes.');
    if (!ok) {
      const failed = user.failedLoginCount + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: failed >= MAX_FAILED_LOGINS ? 0 : failed, lockedUntil: failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined },
      });
      await this.audit.log({ actorId: user.id, action: 'auth.login_failed', ip });
      throw new UnauthorizedException('Wrong email or password');
    }
    if (user.status === 'SUSPENDED') throw new ForbiddenException('This account is suspended. Contact support.');
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });

    const mfaRequired = user.mfaEnabled || MFA_REQUIRED_ROLES.includes(user.role);
    if (!mfaRequired) {
      await this.audit.log({ actorId: user.id, action: 'auth.login', ip });
      return { mfaRequired: false, status: user.status, ...(await this.tokens.issue(user.id, userAgent)) };
    }
    const { challengeId, code } = await this.otp.create(user.id, 'LOGIN_MFA');
    if (user.mfaMethod === 'EMAIL_OTP') {
      await this.email.send({ to: user.email, subject: 'Your Ugo sign in code', text: `Your Ugo sign in code is ${code}. It expires in 10 minutes. If you did not try to sign in, change your password.` });
    }
    // SMS_OTP: sent by the SMS provider once configured (see docs/DEPLOYMENT.md). TOTP: the code comes from the user's authenticator app.
    return { mfaRequired: true, challengeId, method: user.mfaMethod };
  }

  async verifyMfa(challengeId: string, code: string, userAgent?: string, ip?: string) {
    const challenge = await this.prisma.otpChallenge.findUnique({ where: { id: challengeId }, include: { user: true } });
    if (!challenge || challenge.purpose !== 'LOGIN_MFA') throw new UnauthorizedException('Sign in again');
    const user = challenge.user;
    if (user.mfaMethod === 'TOTP' && user.totpSecretEnc) {
      if (challenge.consumedAt || challenge.expiresAt < new Date()) throw new UnauthorizedException('Sign in again');
      const secret = decryptField(user.totpSecretEnc, this.requireFieldKey());
      if (!verifyTotp(secret, code)) throw new BadRequestException('Wrong code');
      await this.prisma.otpChallenge.update({ where: { id: challengeId }, data: { consumedAt: new Date() } });
    } else {
      await this.otp.verify({ challengeId }, 'LOGIN_MFA', code);
    }
    await this.audit.log({ actorId: user.id, action: 'auth.login', ip, metadata: { mfa: user.mfaMethod } });
    return { status: user.status, ...(await this.tokens.issue(user.id, userAgent)) };
  }

  async verifyEmail(userId: string, code: string) {
    await this.otp.verify({ userId }, 'VERIFY_EMAIL', code);
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  }

  async resendEmailCode(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.emailVerifiedAt) return;
    const { code } = await this.otp.create(user.id, 'VERIFY_EMAIL');
    await this.email.send({ to: user.email, subject: 'Your Ugo verification code', text: `Your Ugo verification code is ${code}.` });
  }

  /** Always answers the same way, whether or not the email exists. */
  async requestPasswordReset(emailAddr: string) {
    const user = await this.prisma.user.findUnique({ where: { email: emailAddr } });
    if (!user || user.deletedAt) return;
    const { code } = await this.otp.create(user.id, 'RESET_PASSWORD');
    await this.email.send({ to: user.email, subject: 'Reset your Ugo password', text: `Your password reset code is ${code}. It expires in 10 minutes. If you did not ask for this, ignore this email.` });
  }

  async confirmPasswordReset(emailAddr: string, code: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { email: emailAddr } });
    if (!user) throw new BadRequestException('Code expired. Request a new one.');
    await this.otp.verify({ userId: user.id }, 'RESET_PASSWORD', code);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash: await this.hashPassword(newPassword), failedLoginCount: 0, lockedUntil: null } });
    await this.tokens.revokeAllForUser(user.id);
    await this.audit.log({ actorId: user.id, action: 'auth.password_reset' });
  }

  async checkPassword(userId: string, pw: string): Promise<User> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await argon2.verify(user.passwordHash, pw).catch(() => false))) throw new UnauthorizedException('Wrong password');
    return user;
  }

  async setMfaMethod(userId: string, method: 'EMAIL_OTP' | 'SMS_OTP' | 'TOTP', phone?: string) {
    if (method === 'SMS_OTP') {
      // The SMS provider is chosen at launch (see docs/DEPLOYMENT.md). Until then SMS cannot be selected.
      throw new BadRequestException({ message: 'SMS codes are not available yet', code: 'SMS_NOT_CONFIGURED', phone: Boolean(phone) });
    }
    if (method === 'TOTP') {
      const secret = base32Encode(randomBytes(20));
      await this.prisma.user.update({ where: { id: userId }, data: { totpSecretEnc: encryptField(secret, this.requireFieldKey()) } });
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      // The method switches to TOTP only after the user proves the app works (confirmTotp).
      return { otpauthUrl: `otpauth://totp/Ugo:${encodeURIComponent(user.email)}?secret=${secret}&issuer=Ugo&digits=6&period=30`, secret };
    }
    await this.prisma.user.update({ where: { id: userId }, data: { mfaMethod: 'EMAIL_OTP', mfaEnabled: true, totpSecretEnc: null } });
    return {};
  }

  async confirmTotp(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpSecretEnc || !verifyTotp(decryptField(user.totpSecretEnc, this.requireFieldKey()), code)) throw new BadRequestException('Wrong code');
    await this.prisma.user.update({ where: { id: userId }, data: { mfaMethod: 'TOTP', mfaEnabled: true } });
    await this.audit.log({ actorId: userId, action: 'auth.mfa_totp_enabled' });
  }

  private requireFieldKey(): string {
    if (this.env.FIELD_ENCRYPTION_KEY) return this.env.FIELD_ENCRYPTION_KEY;
    if (this.env.NODE_ENV === 'development' || this.env.NODE_ENV === 'test') return Buffer.alloc(32, 7).toString('base64');
    throw new Error('FIELD_ENCRYPTION_KEY is not set');
  }
}
