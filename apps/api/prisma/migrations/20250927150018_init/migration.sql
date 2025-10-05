-- Расширения (однократно)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "public"."MealStatus" AS ENUM ('pending', 'processing', 'ready', 'failed');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MediaAsset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Meal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "status" "public"."MealStatus" NOT NULL DEFAULT 'pending',
    "kcalMin" DOUBLE PRECISION,
    "kcalMax" DOUBLE PRECISION,
    "kcalMean" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "methodBadge" TEXT,
    "whyJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MealItem" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "gramsMin" DOUBLE PRECISION,
    "gramsMax" DOUBLE PRECISION,
    "gramsMean" DOUBLE PRECISION,
    "kcal" DOUBLE PRECISION,
    "protein" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "source" TEXT,
    "canonicalId" TEXT,
    CONSTRAINT "MealItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FoodCanonical" (
    "id"     TEXT   NOT NULL,
    "name"   TEXT   NOT NULL,
    "lang"   TEXT   NOT NULL,
    "synonyms" TEXT[],
    "vector" vector(384),               -- FIX: сразу правильный тип (не BYTEA)
    CONSTRAINT "FoodCanonical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Nutrient" (
    "id"     TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "kcal"   DOUBLE PRECISION NOT NULL,
    "protein" DOUBLE PRECISION NOT NULL,
    "fat"    DOUBLE PRECISION NOT NULL,
    "carbs"  DOUBLE PRECISION NOT NULL,
    "unit"   TEXT NOT NULL,
    CONSTRAINT "Nutrient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- FKs
ALTER TABLE "public"."MediaAsset"
  ADD CONSTRAINT "MediaAsset_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."Meal"
  ADD CONSTRAINT "Meal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "public"."User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."Meal"
  ADD CONSTRAINT "Meal_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "public"."MediaAsset"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."MealItem"
  ADD CONSTRAINT "MealItem_mealId_fkey"
  FOREIGN KEY ("mealId") REFERENCES "public"."Meal"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."Nutrient"
  ADD CONSTRAINT "Nutrient_foodId_fkey"
  FOREIGN KEY ("foodId") REFERENCES "public"."FoodCanonical"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- УДАЛИ лишние куски из твоего файла ниже ----
-- (в нём повторно включались EXTENSION и снова добавлялась колонка vector)
-- -----------------------------------------------

-- ANN-индекс по косинусу (опционально, можно оставить)
CREATE INDEX IF NOT EXISTS "FoodCanonical_vector_ivfflat"
  ON "public"."FoodCanonical" USING ivfflat ("vector" vector_cosine_ops) WITH (lists = 100);

-- Триграммный индекс для быстрого поиска по имени
CREATE INDEX IF NOT EXISTS "FoodCanonical_name_trgm"
  ON "public"."FoodCanonical" USING gin ("name" gin_trgm_ops);
