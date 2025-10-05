/*
  Warnings:

  - You are about to drop the column `lang` on the `FoodCanonical` table. All the data in the column will be lost.
  - You are about to drop the column `synonyms` on the `FoodCanonical` table. All the data in the column will be lost.
  - You are about to drop the column `vector` on the `FoodCanonical` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[name]` on the table `FoodCanonical` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `carbsPer100g` to the `FoodCanonical` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fatPer100g` to the `FoodCanonical` table without a default value. This is not possible if the table is not empty.
  - Added the required column `kcalPer100g` to the `FoodCanonical` table without a default value. This is not possible if the table is not empty.
  - Added the required column `proteinPer100g` to the `FoodCanonical` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."Meal" DROP CONSTRAINT "Meal_assetId_fkey";

-- DropForeignKey
ALTER TABLE "public"."MediaAsset" DROP CONSTRAINT "MediaAsset_ownerId_fkey";

-- AlterTable
ALTER TABLE "public"."FoodCanonical" DROP COLUMN "lang",
DROP COLUMN "synonyms",
DROP COLUMN "vector",
ADD COLUMN     "carbsPer100g" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "fatPer100g" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "kcalPer100g" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "proteinPer100g" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "source" TEXT;

-- AlterTable
ALTER TABLE "public"."Meal" ALTER COLUMN "assetId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."MediaAsset" ADD COLUMN     "height" INTEGER,
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "size" INTEGER,
ADD COLUMN     "width" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "FoodCanonical_name_key" ON "public"."FoodCanonical"("name");

-- CreateIndex
CREATE INDEX "Meal_userId_createdAt_idx" ON "public"."Meal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Meal_assetId_idx" ON "public"."Meal"("assetId");

-- CreateIndex
CREATE INDEX "MealItem_mealId_idx" ON "public"."MealItem"("mealId");

-- CreateIndex
CREATE INDEX "MealItem_canonicalId_idx" ON "public"."MealItem"("canonicalId");

-- CreateIndex
CREATE INDEX "MediaAsset_ownerId_createdAt_idx" ON "public"."MediaAsset"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Nutrient_foodId_idx" ON "public"."Nutrient"("foodId");

-- CreateIndex
CREATE INDEX "UserProfile_photoId_idx" ON "public"."UserProfile"("photoId");

-- AddForeignKey
ALTER TABLE "public"."MediaAsset" ADD CONSTRAINT "MediaAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Meal" ADD CONSTRAINT "Meal_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "public"."MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MealItem" ADD CONSTRAINT "MealItem_canonicalId_fkey" FOREIGN KEY ("canonicalId") REFERENCES "public"."FoodCanonical"("id") ON DELETE SET NULL ON UPDATE CASCADE;
