/*
  Warnings:

  - Added the required column `completionPayoutKobo` to the `quotes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `materialsAdvanceCapKobo` to the `quotes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `materialsAdvanceKobo` to the `quotes` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "QuoteReviewStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "FileKind" ADD VALUE 'MATERIALS_RECEIPT';

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "commissionFromMaterialsKobo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completionPayoutKobo" INTEGER NOT NULL,
ADD COLUMN     "materialsAdvanceCapKobo" INTEGER NOT NULL,
ADD COLUMN     "materialsAdvanceKobo" INTEGER NOT NULL,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewStatus" "QuoteReviewStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT;

-- CreateIndex
CREATE INDEX "quotes_reviewStatus_idx" ON "quotes"("reviewStatus");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Commission now comes from labour first, with any shortfall taken from materials.
ALTER TABLE quotes DROP CONSTRAINT quotes_labour_covers_commission;
ALTER TABLE quotes
  ADD CONSTRAINT quotes_split_sum
    CHECK ("materialsAdvanceKobo" + "completionPayoutKobo" + "commissionKobo" = "totalKobo"),
  ADD CONSTRAINT quotes_split_nonneg
    CHECK ("materialsAdvanceKobo" >= 0 AND "completionPayoutKobo" >= 0 AND "commissionFromMaterialsKobo" >= 0),
  ADD CONSTRAINT quotes_shortfall_within_materials
    CHECK ("commissionFromMaterialsKobo" <= "materialsKobo"
           AND "commissionKobo" - "commissionFromMaterialsKobo" <= "labourKobo"),
  ADD CONSTRAINT quotes_advance_capped
    CHECK ("materialsAdvanceKobo" <= "materialsAdvanceCapKobo"
           AND "materialsAdvanceKobo" <= "materialsKobo" - "commissionFromMaterialsKobo"),
  ADD CONSTRAINT quotes_review_decided
    CHECK ("reviewStatus" IN ('NOT_REQUIRED', 'PENDING') OR ("reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL));

-- Receipts are job documents, not sensitive identity documents (constraint unchanged, listed for clarity).
