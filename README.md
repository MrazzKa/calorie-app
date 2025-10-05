<<<<<<< HEAD
# calorie-app
=======
# CalorieCam API (demo)

## Quick start
1) docker compose up -d postgres redis   # или свои Postgres/Redis
2) cp apps/api/.env.example apps/api/.env  # отредактируй ключи
3) pnpm -F api exec prisma migrate dev
4) pnpm -F api exec prisma generate
5) pnpm -F api dev

## Tests
pnpm -F api test:e2e

## Auth flow
POST /v1/auth/request-otp -> redis код
POST /v1/auth/verify-otp  -> access/refresh/jti

## Food
POST /v1/food/analyze (sync)           -> { mealId, status:'ready', items:[] }
POST /v1/food/analyze-async (202)      -> { jobId, mealId } ; GET /v1/meals/:id проверять статус
GET  /v1/meals?take=20
GET  /v1/meals/:id
PATCH/DELETE /v1/meals/:id

## Queues
Bull (Redis). Включить QUEUE_ENABLED=true

## Limits
Роль `user` (free) — 5 фото/день, `pro` — без лимита.
>>>>>>> b1e7442 (feat(api): initial push (auth, jwt, meals, queue, cache, usda, tests))
