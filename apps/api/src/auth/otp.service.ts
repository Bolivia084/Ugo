import { BadRequestException, Injectable } from '@nestjs/common';
import type { OtpPurpose } from '@prisma/client';
import { numericCode, safeEqual, sha256 } from '../common/crypto.js';
import { PrismaService } from '../prisma/prisma.service.js';

const OTP_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

/** One time codes for email or SMS. Codes are stored hashed, expire after 10 minutes and allow 5 tries. */
@Injectable()
export class OtpService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, purpose: OtpPurpose): Promise<{ challengeId: string; code: string }> {
    await this.prisma.otpChallenge.updateMany({ where: { userId, purpose, consumedAt: null }, data: { consumedAt: new Date() } });
    const code = numericCode(6);
    const row = await this.prisma.otpChallenge.create({
      data: { userId, purpose, codeHash: sha256(`${userId}:${code}`), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
    });
    return { challengeId: row.id, code };
  }

  /** Returns the user id when the code is right. */
  async verify(where: { challengeId?: string; userId?: string }, purpose: OtpPurpose, code: string): Promise<string> {
    const row = await this.prisma.otpChallenge.findFirst({
      where: { ...(where.challengeId ? { id: where.challengeId } : {}), ...(where.userId ? { userId: where.userId } : {}), purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!row || row.expiresAt < new Date() || row.attempts >= MAX_ATTEMPTS) throw new BadRequestException('Code expired. Request a new one.');
    if (!safeEqual(row.codeHash, sha256(`${row.userId}:${code}`))) {
      await this.prisma.otpChallenge.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Wrong code');
    }
    const consumed = await this.prisma.otpChallenge.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
    if (consumed.count !== 1) throw new BadRequestException('Code already used');
    return row.userId;
  }
}
