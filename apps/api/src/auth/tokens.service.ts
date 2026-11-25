import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { randomToken, sha256 } from '../common/crypto.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

/**
 * Short lived access tokens (JWT, 15 minutes by default) and opaque refresh tokens that
 * rotate on every use. Only a SHA-256 hash of each refresh token is stored. Presenting a
 * refresh token twice means it was stolen, so the whole family (that device's session) is revoked.
 */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async issue(userId: string, userAgent?: string, familyId: string = randomUUID()): Promise<TokenPair> {
    const refreshToken = randomToken(48);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
        userAgent: userAgent?.slice(0, 200),
      },
    });
    const accessToken = await this.jwt.signAsync({ sub: userId, sid: familyId }, { expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS, algorithm: 'HS256' });
    return { accessToken, refreshToken, accessTokenExpiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS };
  }

  async rotate(refreshToken: string, userAgent?: string): Promise<TokenPair> {
    const hash = sha256(refreshToken);
    const now = new Date();
    // Mark used in the same statement that checks it, so two parallel refreshes cannot both win.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash }, include: { user: { select: { status: true, deletedAt: true } } } });
    if (!row) throw new UnauthorizedException('Sign in again');
    if (claimed.count === 0) {
      if (row.usedAt && !row.revokedAt) await this.revokeFamily(row.familyId); // reuse detected
      throw new UnauthorizedException('Sign in again');
    }
    if (row.user.deletedAt || row.user.status === 'DELETED' || row.user.status === 'SUSPENDED') {
      await this.revokeFamily(row.familyId);
      throw new UnauthorizedException('Account not available');
    }
    return this.issue(row.userId, userAgent, row.familyId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
