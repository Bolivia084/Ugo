/** Roles used for role based access control across the API, app and admin dashboard. */
export type Role = 'LEARNER' | 'PARENT' | 'TUTOR' | 'CONTENT_STAFF' | 'SUPPORT' | 'ADMIN';

export type ExamCode = 'FSLC' | 'COMMON_ENTRANCE' | 'BECE' | 'WAEC' | 'NECO' | 'JAMB' | 'SAT' | 'IELTS';

export type ExamLevel = 'PRIMARY' | 'JUNIOR_SECONDARY' | 'SENIOR_SECONDARY' | 'SENIOR_SECONDARY_AND_ABOVE';

export type QuestionType = 'MULTIPLE_CHOICE' | 'SHORT_ANSWER' | 'ESSAY';

export type ContentStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

export type PurchaseSource = 'APPLE' | 'GOOGLE' | 'PAYSTACK' | 'FLUTTERWAVE' | 'PROMO';

export type EntitlementStatus =
  | 'ACTIVE'
  | 'GRACE_PERIOD'
  | 'BILLING_RETRY'
  | 'CANCELLED' // auto renew switched off, access continues until expiry
  | 'EXPIRED'
  | 'REFUNDED'
  | 'REVOKED';

export interface QuestionOption {
  key: string; // "A", "B", ...
  text: string;
  imageUrl?: string;
}

export interface Question {
  id: string;
  examCode: ExamCode;
  subjectId: string;
  topicId: string;
  topicName?: string;
  type: QuestionType;
  year?: number | null;
  body: string;
  imageUrl?: string | null;
  options?: QuestionOption[];
  /** For multiple choice: the option key. For short answer: accepted answers separated by "|". Essays are not auto marked. */
  answer?: string | null;
  explanation: string;
  isSample: boolean;
}

export interface AnswerRecord {
  questionId: string;
  chosen: string | null;
  timeSpentMs: number;
}

export interface Entitlement {
  examCode: ExamCode;
  source: PurchaseSource;
  status: EntitlementStatus;
  startsAt: string; // ISO date
  expiresAt: string; // ISO date
  autoRenew: boolean;
}

export interface SignedEntitlementPayload {
  sub: string; // user id
  entitlements: Pick<Entitlement, 'examCode' | 'status' | 'expiresAt'>[];
  iat: number; // seconds
  /** The app must recheck with the server before this time (seconds). */
  exp: number;
}

export interface ContentPackManifest {
  examCode: ExamCode;
  version: number;
  publishedAt: string;
  sizeBytes: number;
  sha256: string;
  url: string; // signed, expiring
  whatsNew: string;
  isSampleOnly: boolean;
}

export interface AppConfig {
  minSupportedVersion: string;
  latestVersion: string;
  maintenanceMessage?: string | null;
}
