-- AlterTable
ALTER TABLE "public"."Session" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "userAgent" TEXT;
