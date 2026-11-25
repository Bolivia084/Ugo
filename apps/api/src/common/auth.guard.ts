import { type CanActivate, type ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AccessTokenClaims, AuthUser } from './auth-user.js';
import { ALLOW_PENDING, IS_PUBLIC, ROLES } from './decorators.js';

/**
 * Global guard: every route needs a valid access token unless marked @Public().
 * The user is loaded on every request so a suspension, deletion or role change applies at once.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Sign in required');

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(header.slice(7), { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException('Session expired');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: { id: true, role: true, status: true, email: true, dateOfBirth: true, deletedAt: true },
    });
    if (!user || user.deletedAt || user.status === 'DELETED' || user.status === 'SUSPENDED') {
      throw new UnauthorizedException('Account not available');
    }
    const authUser: AuthUser = { ...user, sessionFamilyId: claims.sid };
    req.user = authUser;

    if (user.status === 'PENDING_CONSENT' && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING, targets)) {
      throw new ForbiddenException({ message: 'A parent or guardian must approve this account first', code: 'CONSENT_REQUIRED' });
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (roles?.length && !roles.includes(user.role)) throw new ForbiddenException('Not allowed');
    return true;
  }
}
