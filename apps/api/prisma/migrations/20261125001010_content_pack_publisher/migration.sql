-- AlterTable
ALTER TABLE "ContentPack" ALTER COLUMN "publishedById" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "PaymentEvent" ADD COLUMN     "entitlementId" UUID;
