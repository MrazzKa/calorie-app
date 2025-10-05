# CalorieCam API Development Log

## 2024-12-01 - Initial Implementation Complete

### Fixed Compilation Errors (Phase 1)

#### Authentication & Authorization
- **fix(auth)**: Added missing `Delete` import in `auth.controller.ts`
- **fix(auth)**: Fixed `revokeAll` typing with proper undefined checks
- **fix(auth)**: Added account deletion endpoint (`DELETE /v1/auth/account`)

#### Rate Limiting
- **fix(rate-limit)**: Replaced `TooManyRequestsException` with `HttpException` (NestJS v11 compatibility)
- **fix(rate-limit)**: Updated rate limiting service to use proper HTTP status codes

#### AI Pipeline
- **fix(ai/anthropic)**: Removed unsupported `response_mime_type` parameter
- **fix(ai/anthropic)**: Fixed JSON parsing from Anthropic response text
- **fix(ai/analyzer)**: Added explicit array typing for `mealItems` and `whyEntries`
- **fix(ai/analyzer)**: Fixed `whyJson` casting to `Prisma.InputJsonValue`

#### Meals & Limits
- **fix(limit)**: Replaced `PaymentRequiredException` with `HttpException` (402 status)
- **fix(food)**: Added `createMeal` method to `FoodService`
- **feat(meals)**: Implemented daily photo limits with Redis tracking
- **feat(meals)**: Added meal item adjustment endpoint with nutrition recalculation

#### Queue System
- **fix(queue)**: Updated BullMQ typing and `InjectQueue` imports
- **fix(queue)**: Fixed queue worker to call analyzer directly
- **feat(queue)**: Updated job options with exponential backoff and proper limits

#### Media & Storage
- **fix(media)**: Updated `cuid2` import to use `createId` instead of `cuid`
- **fix(s3)**: Implemented proper S3 Body to Buffer conversion with stream handling
- **feat(media)**: Added comprehensive image type validation

#### Database
- **chore(db)**: Added unique constraint `(foodId, unit)` for `Nutrient` model
- **fix(usda)**: Updated importer to use composite unique key for upserts

### New Features Implemented (Phase 2)

#### Authentication System
- **OTP Authentication**: Email-based one-time password with rate limiting
- **Magic Link Authentication**: Passwordless login with secure tokens
- **JWT Management**: EdDSA-signed tokens with refresh rotation
- **Session Management**: Device-based sessions with blacklist support
- **Account Deletion**: Soft delete with session revocation

#### Media Management
- **Presigned Uploads**: S3/MinIO integration with secure upload URLs
- **Image Validation**: Comprehensive MIME type checking
- **Asset Management**: Automatic cleanup of old media files
- **SHA256 Caching**: Image hash-based result caching

#### AI Pipeline
- **Vision Labeling**: OpenAI GPT-4o and Anthropic Claude implementations
- **Portion Estimation**: LLM-based with rule fallbacks
- **USDA RAG**: PostgreSQL pg_trgm similarity search
- **Nutrition Computation**: Accurate macro calculations with rounding
- **Result Caching**: Redis-based caching by image hash

#### Queue System
- **Async Processing**: BullMQ-based job processing
- **Retry Logic**: Exponential backoff with configurable attempts
- **Worker Management**: Standalone NestJS application context
- **Job Monitoring**: Lifecycle hooks and structured logging

#### Meals & Nutrition
- **Daily Limits**: Free user photo limits with Redis tracking
- **Meal Adjustment**: Portion modification with nutrition recalculation
- **Nutrition Tracking**: Comprehensive macro and micronutrient data
- **Analysis Results**: Structured `whyJson` with detailed reasoning

#### Statistics & Analytics
- **Daily Totals**: Nutrition summaries by date
- **Meal History**: User meal tracking and analysis
- **Performance Metrics**: Processing time and success rates

#### Data Import
- **USDA Import**: CSV-based food database import
- **Batch Processing**: Efficient bulk operations
- **Progress Tracking**: Detailed import logging

### API Endpoints

#### Authentication
- `POST /v1/auth/request-otp` - Request OTP code
- `POST /v1/auth/verify-otp` - Verify OTP and get tokens
- `POST /v1/auth/request-magic` - Request magic link
- `POST /v1/auth/magic-exchange` - Exchange magic token for tokens
- `POST /v1/auth/refresh` - Refresh access token
- `POST /v1/auth/logout` - Logout current session
- `POST /v1/auth/logout-all` - Logout all sessions
- `DELETE /v1/auth/account` - Delete account

#### Media
- `POST /v1/media/presign` - Generate presigned upload URL

#### Meals
- `POST /v1/meals` - Create meal (with daily limits)
- `GET /v1/meals/:id` - Get meal details
- `PATCH /v1/meals/:id/adjust` - Adjust meal item portions
- `POST /v1/meals/presign` - Generate presigned upload URL

#### Statistics
- `GET /v1/stats/daily` - Get daily nutrition totals

#### Well-Known
- `GET /.well-known/apple-app-site-association` - iOS Universal Links
- `GET /.well-known/assetlinks.json` - Android App Links

### Environment Variables

All required environment variables are documented in `docs/RUNBOOK.md` with examples and descriptions.

### Database Schema

#### Key Models
- **User**: Authentication and profile data
- **Session**: Device-based session management
- **MediaAsset**: File metadata and storage references
- **Meal**: Meal analysis results and metadata
- **MealItem**: Individual food items with nutrition data
- **FoodCanonical**: Standardized food database
- **Nutrient**: Nutrition information per food item

#### Indexes
- GIN index on `FoodCanonical.name` for similarity search
- Composite index on `Meal(status, createdAt)`
- Unique constraint on `Nutrient(foodId, unit)`

### Performance Optimizations

1. **Database**
   - Proper indexing for search queries
   - Connection pooling
   - Query optimization

2. **Caching**
   - Redis-based result caching
   - Image hash-based cache keys
   - Configurable TTL

3. **Queue Processing**
   - Async job processing
   - Retry logic with exponential backoff
   - Configurable concurrency

4. **Network**
   - Timeout configurations
   - Retry policies
   - Connection pooling

### Security Features

1. **Authentication**
   - EdDSA JWT signatures
   - Refresh token rotation
   - Device-based sessions

2. **Rate Limiting**
   - Per-email and per-IP limits
   - Configurable windows
   - Redis-based tracking

3. **Input Validation**
   - DTO validation with class-validator
   - MIME type validation
   - SQL injection prevention

4. **Logging**
   - Correlation ID tracking
   - No PII in logs
   - Structured error responses

### Testing

#### Smoke Tests
1. Health check endpoint
2. OTP authentication flow
3. Media presign workflow
4. Meal creation and analysis

#### E2E Tests
- Complete photo analysis pipeline
- Authentication flows
- Rate limiting validation
- Error handling

### Deployment

#### Scripts
- `npm run start:prod` - Production API server
- `npm run worker` - Queue worker process
- `npm run usda:import` - USDA data import

#### Infrastructure
- Docker Compose for local development
- PostgreSQL with pg_trgm extension
- Redis for caching and queues
- S3/MinIO for media storage

### TODO / Future Enhancements

1. **Monitoring**
   - Prometheus metrics
   - Grafana dashboards
   - Health check improvements

2. **Scaling**
   - Horizontal worker scaling
   - Database read replicas
   - CDN integration

3. **Features**
   - Barcode scanning
   - Recipe analysis
   - Nutrition goals tracking

4. **Performance**
   - Image compression
   - Batch processing optimization
   - Cache warming strategies

### Commits

- `fb5dd2b` - fix(auth): imports and revokeAll typing
- All compilation fixes and feature implementations included in initial commit

### Architecture Decisions

1. **TypeScript Strict Mode**: Enforced throughout for type safety
2. **Pure DI**: All dependencies injected via providers/tokens
3. **Structured Logging**: Correlation IDs and no PII
4. **Error Handling**: Consistent error shapes with HTTP status codes
5. **Security First**: Rate limiting, input validation, secure tokens
6. **Performance**: Async processing, caching, optimized queries
