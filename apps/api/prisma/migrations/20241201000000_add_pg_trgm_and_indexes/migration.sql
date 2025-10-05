-- Enable pg_trgm extension for similarity search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index on FoodCanonical name for similarity search
CREATE INDEX IF NOT EXISTS "FoodCanonical_name_gin_trgm_ops_idx" 
ON "FoodCanonical" USING gin (name gin_trgm_ops);

-- Create composite index on Meal for status and createdAt
CREATE INDEX IF NOT EXISTS "Meal_status_createdAt_idx" 
ON "Meal" (status, "createdAt" DESC);

-- Create index on MealItem canonicalId for faster joins
CREATE INDEX IF NOT EXISTS "MealItem_canonicalId_idx" 
ON "MealItem" ("canonicalId");

-- Create index on MediaAsset sha256 for cache lookups
CREATE INDEX IF NOT EXISTS "MediaAsset_sha256_idx" 
ON "MediaAsset" ("sha256") WHERE "sha256" IS NOT NULL;

-- Create index on Session jti for faster lookups
CREATE INDEX IF NOT EXISTS "Session_jti_idx" 
ON "Session" ("jti");

-- Create composite index on Session for user and device
CREATE INDEX IF NOT EXISTS "Session_userId_deviceId_idx" 
ON "Session" ("userId", "deviceId");

-- Create index on User email for faster lookups
CREATE INDEX IF NOT EXISTS "User_email_idx" 
ON "User" ("email");

-- Create index on Nutrient foodId and unit for faster lookups
CREATE INDEX IF NOT EXISTS "Nutrient_foodId_unit_idx" 
ON "Nutrient" ("foodId", "unit");

-- Optional: Enable pgvector extension if available
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Optional: Create vector index on FoodCanonical name if pgvector is available
-- This would require adding a name_vec column first
-- CREATE INDEX IF NOT EXISTS "FoodCanonical_name_vec_cosine_idx" 
-- ON "FoodCanonical" USING ivfflat (name_vec vector_cosine_ops) 
-- WITH (lists = 100);
