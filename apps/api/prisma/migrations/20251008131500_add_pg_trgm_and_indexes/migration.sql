-- Включаем расширение pg_trgm, если доступно
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE EXTENSION pg_trgm;
  END IF;
END $$;

-- Индекс по MealItem.canonicalId (если столбец существует)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='MealItem' AND column_name='canonicalId'
  ) THEN
    CREATE INDEX IF NOT EXISTS "MealItem_canonicalId_idx"
    ON "MealItem" ("canonicalId");
  END IF;
END $$;

-- Индекс по MediaAsset.sha256 (если столбец существует)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='MediaAsset' AND column_name='sha256'
  ) THEN
    CREATE INDEX IF NOT EXISTS "MediaAsset_sha256_idx"
    ON "MediaAsset" ("sha256") WHERE "sha256" IS NOT NULL;
  END IF;
END $$;

-- GIN trgm по FoodCanonical.name (если таблица/столбец существует и pg_trgm поднят)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='FoodCanonical' AND column_name='name'
  )
  AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')
  THEN
    CREATE INDEX IF NOT EXISTS "FoodCanonical_name_trgm"
    ON "FoodCanonical" USING GIN ("name" gin_trgm_ops);
  END IF;
END $$;
