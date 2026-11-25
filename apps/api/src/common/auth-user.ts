import type { Role, UserStatus } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: Role;
  status: UserStatus;
  email: string;
  dateOfBirth: Date | null;
  sessionFamilyId: string;
}

export interface AccessTokenClaims {
  sub: string;
  sid: string; // refresh token family, lets us end one device session
}
