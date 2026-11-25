import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC = 'isPublic';
/** Opens a route to callers without a token (sign in, sign up, catalogue, signed webhooks). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES = 'roles';
/** Limits a route to the given roles. Routes without @Roles() are open to any signed in, active user. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const ALLOW_PENDING = 'allowPending';
/** Lets a learner still waiting for parental consent call this route. */
export const AllowPendingConsent = () => SetMetadata(ALLOW_PENDING, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest().user as AuthUser;
});
