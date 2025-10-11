# CalorieCam Backend

AI-powered calorie and macro tracking from food photos.

Production-ready NestJS API with ML worker for mobile calorie tracking applications. Implements passwordless authentication, intelligent food recognition, nutrition database integration, and role-based access control.

## Quick Start

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Initialize database
cd apps/api && pnpm install && pnpm db:reset

# 3. Start API
pnpm start:dev

# ✅ API ready at http://localhost:3000/v1
# ✅ Swagger docs at http://localhost:3000/docs
# ✅ Health check: curl http://localhost:3000/v1/health
```

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security](#security)
- [Development](#development)

---

## Features

### Authentication & Security
- **Passwordless auth**: OTP via email + Magic links (no password storage)
- **Token rotation**: Refresh tokens rotate on every use with Redis blacklist
- **JWT**: EdDSA/RS256 signatures with standard claims (sub, role, iat, exp, jti)
- **Token lifetimes**: Access 30 min, Refresh 30 days
- **Rate limiting**: IP-based + per-user quotas
- **Deep linking**: Universal Links (iOS) + App Links (Android) support
- **Account deletion**: Full GDPR/App Store compliance

### Food Analysis
- **Photo analysis**: Upload food photos, get instant nutrition data
- **Multiple AI providers**: Demo mode, OpenAI GPT-4 Vision, Anthropic Claude
- **Smart caching**: SHA256-based, cache hits don't consume quota
- **Async processing**: BullMQ queue with retry logic for scalability
- **Portion estimation**: AI-powered serving size detection
- **Manual correction**: Adjust portions, AI results are editable
- **RAG matching**: Similarity search against USDA nutrition database

### Nutrition Database
- **USDA FDC integration**: ~250k+ foods with complete nutrition data
- **Smart search**: pg_trgm similarity + exact matching
- **Auto-scaling**: Per-100g values scaled to estimated portions
- **Custom entries**: Create custom foods when no match found

### User Features
- **Statistics**: Daily and range aggregations (kcal, protein, fat, carbs)
- **History**: Full meal history with pagination and date filters
- **Weight tracking**: Log and visualize weight over time
- **Goals**: Set calorie targets based on activity level
- **Profiles**: Manage user details and photos

### Limits & Quotas
- **Free tier**: 5 photo analyses per day
- **Pro tier**: 100 photo analyses per day
- **Admin**: Unlimited access + user management
- **File limits**: 10 MB max photo size
- **Spam protection**: Request rate limiting per IP

---

## Architecture

```
┌─────────────────┐
│   Mobile App    │
│  (iOS/Android)  │
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────────────────────────┐
│          NestJS API :3000           │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Auth (OTP/Magic Link)       │  │
│  │  JWT (EdDSA, 30min access)   │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Food Analysis Pipeline      │  │
│  │  • Cache check (SHA256)      │  │
│  │  • Quota enforcement         │  │
│  │  • AI labeling               │  │
│  │  • RAG nutrition matching    │  │
│  │  • Save to DB                │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  BullMQ Processor            │  │
│  │  Async photo analysis        │  │
│  │  Retry logic, concurrency:2  │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
         │         │         │
         │         │         └──────┐
         ↓         ↓                ↓
┌─────────────┐ ┌─────────┐ ┌──────────────┐
│ PostgreSQL  │ │  Redis  │ │ MinIO (S3)   │
│ + pgvector  │ │ Cache   │ │ Photo storage│
│             │ │ Limits  │ │              │
│ • Users     │ │ Session │ │ 10MB limit   │
│ • Meals     │ │ Blacklist│ │ SHA256 key  │
│ • USDA DB   │ └─────────┘ └──────────────┘
└─────────────┘

Optional:
┌─────────────────┐
│  ML Worker      │
│  FastAPI :8000  │
│  Local inference│
└─────────────────┘
```

---

## Tech Stack

### Core
- **Runtime**: Node.js 20+
- **Framework**: NestJS 10 (TypeScript)
- **Database**: PostgreSQL 16 + pgvector extension
- **Cache**: Redis 7
- **Storage**: MinIO (S3-compatible)
- **Queue**: BullMQ (Redis-based)

### Authentication
- **JWT**: `jose` library (EdDSA/RS256)
- **Tokens**: Access (30 min) + Refresh (30 days) with rotation

### Database & ORM
- **ORM**: Prisma 5
- **Migrations**: Versioned, production-safe
- **Extensions**: pgvector (embeddings), pg_trgm (similarity search)

### API
- **Validation**: class-validator, class-transformer
- **Documentation**: Swagger/OpenAPI
- **Security**: Helmet, CORS, rate limiting

### AI/ML
- **Providers**: OpenAI GPT-4 Vision, Anthropic Claude
- **Fallback**: Demo mode (no API keys required)
- **Local**: Optional FastAPI worker

---

## Prerequisites

- **Node.js** 20+ and **pnpm** 8+
- **Docker** and **Docker Compose**
- **PostgreSQL** 16+ (via Docker or local)
- **Redis** 7+ (via Docker or local)
- **MinIO** (via Docker) or AWS S3

---

## Installation

### 1. Clone & Install

```bash
git clone <repository-url>
cd caloriecam
cd apps/api
pnpm install
```

### 2. Start Infrastructure

```bash
# From root directory
docker compose up -d

# Verify services
docker compose ps
```

Services started:
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO: `localhost:9000` (API), `localhost:9001` (Console)

### 3. Initialize Database

```bash
cd apps/api
pnpm db:reset  # Creates schema + seed data
```

### 4. Configure Environment

Create `apps/api/.env`:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/caloriecam?schema=public

# Redis
REDIS_URL=redis://127.0.0.1:6379/0
BULL_REDIS_URL=redis://127.0.0.1:6379/0

# S3 / MinIO
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=caloriecam-dev
S3_ACCESS_KEY_ID=minio
S3_SECRET_ACCESS_KEY=minio12345
S3_FORCE_PATH_STYLE=true

# JWT (optional, auto-generated in dev)
# JWT_ALG=EdDSA
# JWT_PRIVATE_KEY_FILE=./keys/private.pem
# JWT_PUBLIC_KEY_FILE=./keys/public.pem
JWT_ACCESS_TTL_SEC=1800   # 30 minutes
JWT_REFRESH_TTL_SEC=2592000  # 30 days

# Analysis
ANALYZER_PROVIDER=demo  # demo | openai | anthropic | local
ANALYZE_MODE=sync       # sync | async

# Quotas
FREE_DAILY_ANALYSES=5
PRO_DAILY_ANALYSES=100

# Feature Flags (dev/test only)
DISABLE_LIMITS=false
DISABLE_UPLOADS=false

# Email (optional, for OTP/magic links)
# SMTP_HOST=smtp.example.com
# SMTP_PORT=587
# SMTP_USER=user@example.com
# SMTP_PASS=password
AUTH_DEV_IGNORE_MAIL_ERRORS=true  # Dev: don't fail if email fails
```

### 5. Start API

```bash
cd apps/api
pnpm start:dev  # Development mode with hot reload

# Or production build
pnpm build
pnpm start:prod
```

API available at:
- Base URL: http://localhost:3000/v1
- Health: http://localhost:3000/v1/health
- Swagger: http://localhost:3000/docs

---

## Configuration

### Environment Variables

#### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/db` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379/0` |
| `S3_ENDPOINT` | S3/MinIO endpoint | `http://localhost:9000` |
| `S3_BUCKET` | S3 bucket name | `caloriecam-dev` |
| `S3_ACCESS_KEY_ID` | S3 access key | `minio` |
| `S3_SECRET_ACCESS_KEY` | S3 secret key | `minio12345` |

#### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | API server port |
| `JWT_ALG` | `EdDSA` | JWT algorithm (EdDSA or RS256) |
| `JWT_ACCESS_TTL_SEC` | `1800` | Access token lifetime (30 min) |
| `JWT_REFRESH_TTL_SEC` | `2592000` | Refresh token lifetime (30 days) |
| `ANALYZER_PROVIDER` | `demo` | AI provider (demo, openai, anthropic, local) |
| `ANALYZE_MODE` | `sync` | Processing mode (sync or async) |
| `FREE_DAILY_ANALYSES` | `5` | Free tier daily photo limit |
| `PRO_DAILY_ANALYSES` | `100` | Pro tier daily photo limit |
| `DISABLE_LIMITS` | `false` | Bypass quotas (testing only) |
| `DISABLE_UPLOADS` | `false` | Mock S3 uploads (testing only) |

#### AI Provider Keys

```bash
# OpenAI (optional)
OPENAI_API_KEY=sk-...

# Anthropic (optional)
ANTHROPIC_API_KEY=sk-ant-...

# Local ML Worker (optional)
WORKER_URL=http://localhost:8000
WORKER_KEY=dev-worker-key
WORKER_TIMEOUT_MS=12000
```

### JWT Key Generation

For production, generate asymmetric keys:

```bash
# EdDSA (Ed25519) - recommended
ssh-keygen -t ed25519 -f jwt-key
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
  -in jwt-key -out private.pem
openssl pkey -in private.pem -pubout -out public.pem

# RS256 (RSA 2048)
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

Then set:
```bash
JWT_PRIVATE_KEY_FILE=./keys/private.pem
JWT_PUBLIC_KEY_FILE=./keys/public.pem
```

---

## API Reference

### Authentication

#### Request OTP
```http
POST /v1/auth/request-otp
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Verify OTP
```http
POST /v1/auth/verify-otp
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "123456",
  "deviceId": "device-uuid"
}

Response: { "access": "eyJ...", "refresh": "eyJ...", "jti": "..." }
```

#### Request Magic Link
```http
POST /v1/auth/request-magic
Content-Type: application/json

{
  "email": "user@example.com"
}
```

#### Exchange Magic Token
```http
POST /v1/auth/magic-exchange
Content-Type: application/json

{
  "t": "magic-token",
  "deviceId": "device-uuid"
}

Response: { "access": "eyJ...", "refresh": "eyJ...", "jti": "..." }
```

#### Refresh Access Token
```http
POST /v1/auth/refresh
Content-Type: application/json
Authorization: Bearer <refresh-token>

Response: { "access": "eyJ...", "refresh": "eyJ...", "jti": "..." }
```

### Food Analysis

#### Analyze Photo
```http
POST /v1/food/analyze
Authorization: Bearer <access-token>
Content-Type: multipart/form-data

file: <image-file>

Response:
{
  "mealId": "clxxx123",
  "status": "ready",
  "items": [
    {
      "label": "grilled chicken",
      "gramsMean": 150,
      "kcal": 248,
      "protein": 46.5,
      "fat": 5.4,
      "carbs": 0,
      "source": "USDA",
      "canonicalId": "clyyy"
    }
  ]
}
```

### Meals

#### Get Meal History
```http
GET /v1/meals?take=20&date=2025-10-11
Authorization: Bearer <access-token>

Response: [
  {
    "id": "clxxx",
    "status": "ready",
    "createdAt": "2025-10-11T12:30:00Z",
    "kcal": 450,
    "items": [...],
    "asset": { "id": "...", "mime": "image/jpeg", "s3Key": "..." }
  }
]
```

#### Get Single Meal
```http
GET /v1/meals/:id
Authorization: Bearer <access-token>
```

#### Adjust Meal Item Portion
```http
PATCH /v1/meals/:id/adjust
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "itemId": "clyyy",
  "gramsDelta": 50  // Increase by 50g
}
```

#### Delete Meal
```http
DELETE /v1/meals/:id
Authorization: Bearer <access-token>
```

### Statistics

#### Daily Stats
```http
GET /v1/stats/daily?date=2025-10-11
Authorization: Bearer <access-token>

Response:
{
  "date": "2025-10-11",
  "totals": {
    "kcal": 1850,
    "protein": 95,
    "fat": 65,
    "carbs": 215
  },
  "meals": [...]
}
```

#### Range Stats
```http
GET /v1/stats/range?from=2025-10-01&to=2025-10-11
Authorization: Bearer <access-token>

Response:
{
  "from": "2025-10-01",
  "to": "2025-10-11",
  "totals": { "kcal": 20350, ... },
  "days": [
    { "date": "2025-10-01", "totals": {...} },
    ...
  ]
}
```

### User Management

#### Get Profile
```http
GET /v1/users/me
Authorization: Bearer <access-token>
```

#### Update Profile
```http
PATCH /v1/users/me
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "name": "John Doe",
  "age": 30,
  "sex": "male"
}
```

#### Delete Account
```http
DELETE /v1/users/me
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "reason": "user_request"
}
```

### Admin

#### List Users
```http
GET /v1/admin/users
Authorization: Bearer <admin-access-token>
```

#### Change User Role
```http
POST /v1/admin/users/:id/role
Authorization: Bearer <admin-access-token>
Content-Type: application/json

{
  "role": "pro"  // free | pro | admin
}
```

### Health & Monitoring

#### Health Check
```http
GET /v1/health

Response:
{
  "ok": true,
  "ts": "2025-10-11T12:00:00.000Z",
  "db": "ok",
  "redis": "ok",
  "s3": "ok"
}
```

#### JWKS (Public Keys)
```http
GET /.well-known/jwks.json

Response:
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "x": "...",
      "kid": "main-k1",
      "alg": "EdDSA",
      "use": "sig"
    }
  ]
}
```

---

## Testing

### E2E Tests (Fast, Mocked)

```bash
cd apps/api
pnpm test:e2e
```

Configuration:
- `NODE_ENV=test`
- `DISABLE_LIMITS=true` (no quotas)
- `DISABLE_UPLOADS=true` (mocked S3)
- `ANALYZER_PROVIDER=demo` (no AI calls)

Test Suites:
- Auth (OTP, magic link, rotation)
- Food analysis (cache, limits, providers)
- Meals (CRUD, adjustments)
- Stats (daily, range aggregation)
- Admin (role management)
- Users (profile, deletion)

### E2E Tests (Real Infrastructure)

```bash
# Ensure infrastructure is running
docker compose up -d

cd apps/api
pnpm e2e
```

Uses real PostgreSQL, Redis, and MinIO.

### Manual Testing

```bash
# Run full MVP flow test
./test-mvp-flow.sh

# Expected output:
# Auth complete
# Analysis complete. Meal ID: clxxx
# Meal saved in database
# History retrieved
# MVP FLOW COMPLETE
```

### Test Coverage

```bash
cd apps/api
pnpm test:cov
```

---

## Deployment

### Production Checklist

- [ ] Set secure `DATABASE_URL` with SSL
- [ ] Configure production Redis (SSL, password)
- [ ] Use AWS S3 or production-grade object storage
- [ ] Generate production JWT keys (EdDSA recommended)
- [ ] Set `NODE_ENV=production`
- [ ] Configure SMTP for email delivery
- [ ] Set strong secrets for API keys
- [ ] Enable monitoring (health check endpoint)
- [ ] Configure reverse proxy (nginx) with SSL
- [ ] Set up log aggregation
- [ ] Configure automated backups

### Database Migration

```bash
cd apps/api

# Production migrations (non-destructive)
pnpm db:deploy

# Never run db:reset in production!
```

### Docker Production Build

```bash
# Build API
docker build -f apps/api/Dockerfile -t caloriecam-api:latest .

# Run with environment
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://... \
  -e REDIS_URL=redis://... \
  -e S3_ENDPOINT=https://s3.amazonaws.com \
  --name caloriecam-api \
  caloriecam-api:latest
```

### Environment Variables (Production)

```bash
NODE_ENV=production
PORT=3000

# PostgreSQL with SSL
DATABASE_URL=postgresql://user:pass@prod-db.example.com:5432/caloriecam?sslmode=require

# Redis with password
REDIS_URL=redis://:password@prod-redis.example.com:6379/0

# AWS S3
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
S3_REGION=us-east-1
S3_BUCKET=caloriecam-prod
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=...
S3_FORCE_PATH_STYLE=false

# JWT Production Keys
JWT_ALG=EdDSA
JWT_PRIVATE_KEY_FILE=/etc/secrets/jwt-private.pem
JWT_PUBLIC_KEY_FILE=/etc/secrets/jwt-public.pem

# AI Provider
ANALYZER_PROVIDER=openai  # or anthropic
OPENAI_API_KEY=sk-...

# Email
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG...
AUTH_DEV_IGNORE_MAIL_ERRORS=false

# Monitoring
SENTRY_DSN=https://...
```

### Creating Admin User

```sql
-- Connect to production database
psql $DATABASE_URL

-- Set user as admin
UPDATE "User" SET role='admin' WHERE email='admin@example.com';
```

---

## Security

### Authentication
- No password storage (OTP + magic links only)
- JTI-based token tracking (revocable)
- Refresh token rotation (prevents replay attacks)
- Redis blacklist (instant token revocation)
- Rate limiting (prevents brute force)

### API Security
- Helmet (security headers)
- CORS (configurable origins)
- Request size limits (10 MB)
- Input validation (class-validator)
- SQL injection protection (Prisma ORM)

### Data Protection
- User isolation (all queries filtered by userId)
- Cascading deletes (foreign keys)
- Soft delete option (deletedAt timestamp)
- S3 presigned URLs (no direct access)

### Compliance
- GDPR: Account deletion endpoint
- App Store: Required by Apple guidelines
- Google Play: No restrictions

---

## Development

### Database Management

```bash
# Reset database (dev only!)
pnpm db:reset

# Create migration
pnpm prisma migrate dev --name add_feature

# Apply migrations
pnpm db:migrate

# Generate Prisma client
pnpm db:generate

# Open Prisma Studio (GUI)
pnpm db:studio
```

### Import USDA Database

```bash
cd apps/api

# Download USDA FDC data
curl -O https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_csv_2024-10-01.zip
unzip FoodData_Central_csv_2024-10-01.zip

# Import (dry run)
pnpm tsx src/scripts/usda-import.ts --csv ./FoodData_Central_csv_2024-10-01 --dry-run

# Import (real)
pnpm tsx src/scripts/usda-import.ts --csv ./FoodData_Central_csv_2024-10-01
```

### Code Style

```bash
# Lint
pnpm lint

# Format
pnpm format

# Type check
pnpm tsc --noEmit
```

### Debugging

```bash
# Start with inspector
pnpm start:debug

# Attach debugger to localhost:9229
```

### Project Structure

```
caloriecam/
├── apps/api/                  # Main NestJS application
│   ├── src/
│   │   ├── admin/             # Admin endpoints (role management)
│   │   ├── auth/              # OTP, magic link, sessions
│   │   ├── food/              # Analysis, meals, RAG
│   │   │   ├── analyzers/     # AI provider implementations
│   │   │   ├── providers/     # Analysis strategies
│   │   │   ├── rag/           # Nutrition database matching
│   │   │   └── usda/          # USDA service
│   │   ├── jwt/               # JWT signing and verification
│   │   ├── media/             # S3 storage, presigned URLs
│   │   ├── stats/             # Aggregations
│   │   ├── users/             # Profiles, weights, goals
│   │   └── ...
│   ├── prisma/
│   │   ├── schema.prisma      # Database models
│   │   └── migrations/        # Versioned migrations
│   └── test/                  # E2E tests
├── workers/ml-worker/         # Optional local ML inference
│   └── app/
│       └── main.py            # FastAPI worker
├── docker-compose.yml         # Infrastructure stack
└── README.md                  # This file
```

---

## Database Schema

### Core Models

**User**
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  role      String   @default("free")  // free | pro | admin
  createdAt DateTime @default(now())
  deletedAt DateTime?
}
```

**Session**
```prisma
model Session {
  id          String   @id @default(cuid())
  userId      String
  deviceId    String
  jti         String   @unique
  refreshHash String
  status      String   @default("active")  // active | rotated | revoked
  expiresAt   DateTime
}
```

**Meal**
```prisma
model Meal {
  id          String     @id @default(cuid())
  userId      String
  assetId     String?
  status      MealStatus @default(pending)
  kcalMean    Float?
  methodBadge String?
  whyJson     Json?
  createdAt   DateTime   @default(now())
  items       MealItem[]
}
```

**MealItem**
```prisma
model MealItem {
  id          String  @id @default(cuid())
  mealId      String
  label       String
  gramsMean   Float?
  kcal        Float?
  protein     Float?
  fat         Float?
  carbs       Float?
  canonicalId String?
}
```

**FoodCanonical**
```prisma
model FoodCanonical {
  id             String  @id @default(cuid())
  name           String  @unique
  kcalPer100g    Float
  proteinPer100g Float
  fatPer100g     Float
  carbsPer100g   Float
  source         String  // USDA | OFF | custom
}
```

---

## Contributing

This is a production application. For feature requests or bug reports, please contact the development team.

---

## License

Proprietary. All rights reserved.

---

## Support

For technical support or questions:
- Health check: `GET /v1/health`
- Swagger docs: `http://localhost:3000/docs`
- Issues: Contact development team

---

## Roadmap

### Current Features (MVP)
- Passwordless authentication
- Photo analysis (demo/OpenAI/Anthropic)
- USDA nutrition database
- Role-based quotas
- Statistics & history
- Admin panel

### Planned Features
- [ ] Real-time analysis progress (WebSocket)
- [ ] Batch photo upload
- [ ] Food search API
- [ ] Social features (meal sharing)
- [ ] Advanced analytics dashboard
- [ ] Barcode scanning
- [ ] Recipe analysis
- [ ] Meal planning

---

Built by the CalorieCam Team
