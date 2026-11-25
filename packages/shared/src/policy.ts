import type { Role } from './types';

/** Under the Nigeria Data Protection Act 2023, anyone under 18 is a child. */
export const ADULT_AGE = 18;
/** Learners under 13 start with leaderboards off and need a parent to switch them on. */
export const LEADERBOARD_MIN_AGE = 13;

export function ageOn(dateOfBirth: Date | string, now: Date = new Date()): number {
  const dob = new Date(dateOfBirth);
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const m = now.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

export function isChild(dateOfBirth: Date | string, now: Date = new Date()): boolean {
  return ageOn(dateOfBirth, now) < ADULT_AGE;
}

/** Leaderboards use display names only. They start off for learners under 13 and on for everyone else, who can leave at any time. */
export function leaderboardDefaultOn(dateOfBirth: Date | string, now: Date = new Date()): boolean {
  return ageOn(dateOfBirth, now) >= LEADERBOARD_MIN_AGE;
}

export function canJoinLeaderboard(dateOfBirth: Date | string, parentAllowed: boolean, now: Date = new Date()): boolean {
  return ageOn(dateOfBirth, now) >= LEADERBOARD_MIN_AGE || parentAllowed;
}

/** Roles that must use multi factor authentication with no way to turn it off. */
export const MFA_REQUIRED_ROLES: Role[] = ['ADMIN', 'CONTENT_STAFF', 'SUPPORT', 'TUTOR'];

/** Daily AI tutor message limit per learner. Stored as an admin setting; this is the seed value. */
export const DEFAULT_TUTOR_DAILY_LIMIT = 40;
export const FREE_TUTOR_DAILY_LIMIT = 0;

/** Free level: number of sample questions per subject and sample mock length. */
export const FREE_SAMPLE_QUESTIONS_PER_SUBJECT = 10;
export const FREE_SAMPLE_MOCK_QUESTIONS = 10;
export const FREE_SAMPLE_MOCK_MINUTES = 10;

/** Compares dotted version strings such as "1.4.2". Returns -1, 0 or 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function mustUpdate(current: string, minSupported: string): boolean {
  return compareVersions(current, minSupported) < 0;
}
