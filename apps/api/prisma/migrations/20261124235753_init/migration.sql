-- CreateEnum
CREATE TYPE "Role" AS ENUM ('LEARNER', 'PARENT', 'TUTOR', 'CONTENT_STAFF', 'SUPPORT', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'PENDING_CONSENT', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "MfaMethod" AS ENUM ('EMAIL_OTP', 'SMS_OTP', 'TOTP');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN_MFA', 'VERIFY_EMAIL', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "ExamCode" AS ENUM ('FSLC', 'COMMON_ENTRANCE', 'BECE', 'WAEC', 'NECO', 'JAMB', 'SAT', 'IELTS');

-- CreateEnum
CREATE TYPE "ExamLevel" AS ENUM ('PRIMARY', 'JUNIOR_SECONDARY', 'SENIOR_SECONDARY', 'SENIOR_SECONDARY_AND_ABOVE');

-- CreateEnum
CREATE TYPE "ContentKind" AS ENUM ('QUESTION', 'NOTE', 'FLASHCARD_DECK', 'VIDEO');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('ORIGINAL', 'LICENSED');

-- CreateEnum
CREATE TYPE "PackStatus" AS ENUM ('PUBLISHED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "AttemptMode" AS ENUM ('PRACTICE', 'MOCK', 'SAMPLE_MOCK');

-- CreateEnum
CREATE TYPE "PurchaseSource" AS ENUM ('APPLE', 'GOOGLE', 'PAYSTACK', 'FLUTTERWAVE', 'PROMO');

-- CreateEnum
CREATE TYPE "EntitlementStatus" AS ENUM ('ACTIVE', 'GRACE_PERIOD', 'BILLING_RETRY', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ParentLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'LEARNER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "fullName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "emailVerifiedAt" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT true,
    "mfaMethod" "MfaMethod" NOT NULL DEFAULT 'EMAIL_OTP',
    "totpSecretEnc" TEXT,
    "leaderboardOptIn" BOOLEAN NOT NULL DEFAULT false,
    "parentAllowsLeaderboard" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentLink" (
    "id" UUID NOT NULL,
    "parentId" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "status" "ParentLinkStatus" NOT NULL DEFAULT 'PENDING',
    "consentGivenAt" TIMESTAMP(3),
    "consentMethod" TEXT,
    "consentVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRequest" (
    "id" UUID NOT NULL,
    "childId" UUID NOT NULL,
    "parentEmail" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamCategory" (
    "id" UUID NOT NULL,
    "code" "ExamCode" NOT NULL,
    "name" TEXT NOT NULL,
    "level" "ExamLevel" NOT NULL,
    "description" TEXT NOT NULL,
    "minAge" INTEGER NOT NULL,
    "priceKobo" INTEGER NOT NULL,
    "pendingPriceKobo" INTEGER,
    "pendingPriceFrom" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "disclaimer" TEXT,
    "electiveCount" INTEGER,
    "mockMinutes" INTEGER NOT NULL,
    "mockSections" JSONB NOT NULL,
    "tutorDailyLimit" INTEGER NOT NULL DEFAULT 40,
    "appleProductId" TEXT,
    "googleProductId" TEXT,
    "paystackPlanCode" TEXT,
    "flutterwavePlanId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subject" (
    "id" UUID NOT NULL,
    "examCategoryId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" UUID NOT NULL,
    "kind" "ContentKind" NOT NULL,
    "examCategoryId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "topicId" UUID,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "year" INTEGER,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "ContentSource" NOT NULL DEFAULT 'ORIGINAL',
    "rightsNote" TEXT,
    "createdById" UUID NOT NULL,
    "reviewedById" UUID,
    "approvedById" UUID,
    "scheduledFor" TIMESTAMP(3),
    "publishedInPack" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentReview" (
    "id" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPack" (
    "id" UUID NOT NULL,
    "examCategoryId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "isSampleOnly" BOOLEAN NOT NULL,
    "status" "PackStatus" NOT NULL DEFAULT 'PUBLISHED',
    "whatsNew" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "publishedById" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolledBackAt" TIMESTAMP(3),

    CONSTRAINT "ContentPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clientId" TEXT NOT NULL,
    "examCode" "ExamCode" NOT NULL,
    "subjectId" UUID,
    "mode" "AttemptMode" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3) NOT NULL,
    "score" INTEGER NOT NULL,
    "markable" INTEGER NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "totalTimeMs" INTEGER NOT NULL,
    "answers" JSONB NOT NULL,
    "topicResults" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomFlashcard" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "clientId" TEXT NOT NULL,
    "deckName" TEXT NOT NULL,
    "front" TEXT NOT NULL,
    "back" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomFlashcard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "userId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "examCode" "ExamCode" NOT NULL,
    "source" "PurchaseSource" NOT NULL,
    "status" "EntitlementStatus" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "externalId" TEXT NOT NULL,
    "pricePaidKobo" INTEGER,
    "lastEventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reminderSentFor" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL,
    "source" "PurchaseSource" NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "examCode" "ExamCode",
    "percentOff" INTEGER NOT NULL DEFAULT 0,
    "grantsPlan" BOOLEAN NOT NULL DEFAULT false,
    "maxRedemptions" INTEGER NOT NULL,
    "redeemed" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorUsage" (
    "userId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "refusals" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TutorUsage_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "token" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "OtpChallenge_userId_purpose_idx" ON "OtpChallenge"("userId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "ParentLink_parentId_childId_key" ON "ParentLink"("parentId", "childId");

-- CreateIndex
CREATE INDEX "ConsentRequest_parentEmail_idx" ON "ConsentRequest"("parentEmail");

-- CreateIndex
CREATE UNIQUE INDEX "ExamCategory_code_key" ON "ExamCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_examCategoryId_slug_key" ON "Subject"("examCategoryId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_subjectId_name_key" ON "Topic"("subjectId", "name");

-- CreateIndex
CREATE INDEX "ContentItem_examCategoryId_status_idx" ON "ContentItem"("examCategoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPack_examCategoryId_isSampleOnly_version_key" ON "ContentPack"("examCategoryId", "isSampleOnly", "version");

-- CreateIndex
CREATE INDEX "Attempt_userId_finishedAt_idx" ON "Attempt"("userId", "finishedAt");

-- CreateIndex
CREATE INDEX "Attempt_examCode_finishedAt_idx" ON "Attempt"("examCode", "finishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Attempt_userId_clientId_key" ON "Attempt"("userId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFlashcard_userId_clientId_key" ON "CustomFlashcard"("userId", "clientId");

-- CreateIndex
CREATE INDEX "Entitlement_userId_idx" ON "Entitlement"("userId");

-- CreateIndex
CREATE INDEX "Entitlement_status_expiresAt_idx" ON "Entitlement"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_source_externalId_examCode_key" ON "Entitlement"("source", "externalId", "examCode");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_source_externalEventId_key" ON "PaymentEvent"("source", "externalEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentLink" ADD CONSTRAINT "ParentLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentLink" ADD CONSTRAINT "ParentLink_childId_fkey" FOREIGN KEY ("childId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRequest" ADD CONSTRAINT "ConsentRequest_childId_fkey" FOREIGN KEY ("childId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_examCategoryId_fkey" FOREIGN KEY ("examCategoryId") REFERENCES "ExamCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_examCategoryId_fkey" FOREIGN KEY ("examCategoryId") REFERENCES "ExamCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentReview" ADD CONSTRAINT "ContentReview_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPack" ADD CONSTRAINT "ContentPack_examCategoryId_fkey" FOREIGN KEY ("examCategoryId") REFERENCES "ExamCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomFlashcard" ADD CONSTRAINT "CustomFlashcard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorUsage" ADD CONSTRAINT "TutorUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
