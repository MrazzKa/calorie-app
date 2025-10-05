# CalorieCam API Runbook

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+ (for local development)
- pnpm (package manager)

### Environment Setup

1. Copy environment template:
```bash
cp apps/api/.env.dev apps/api/.env
```

2. Configure required environment variables:
```bash
# Database & Cache
DATABASE_URL=postgresql://user:password@localhost:5432/caloriecam
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_KEY_ID=main-k1
JWT_ALG=EdDSA
JWT_ISSUER=caloriecam
JWT_ACCESS_TTL_SEC=3600
JWT_REFRESH_TTL_SEC=2592000
JWT_PRIVATE_KEY_BASE64=<base64-encoded-private-key>
JWT_PUBLIC_KEY=<pem-public-key>

# S3 Storage
S3_ENDPOINT=https://your-s3-endpoint
S3_REGION=us-east-1
S3_BUCKET=caloriecam-media
S3_ACCESS_KEY=your-access-key
S3_SECRET_KEY=your-secret-key
S3_USE_PATH_STYLE=false

# AI Providers
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
AI_LABELER_PROVIDER=openai
AI_PORTION_PROVIDER=llm

# Analysis Configuration
ANALYZE_MODE=async
FOOD_QUEUE=food:analyze
ANALYZE_CONCURRENCY=4
IMAGE_CACHE_TTL_SEC=604800
FREE_DAILY_PHOTO_LIMIT=5
RAW_MEDIA_RETENTION_DAYS=14

# Rate Limits
RL_OTP_PER_15M=5
RL_OTP_PER_HOUR_IP=20
RL_MAGIC_PER_15M=5
RL_MAGIC_PER_HOUR_IP=20

# App Links
APP_LINK_DOMAIN=https://auth.caloriecam.app
```

### Docker Compose Setup

1. Start infrastructure services:
```bash
docker-compose up -d postgres redis
```

2. Wait for services to be ready:
```bash
docker-compose logs -f postgres
```

### Database Setup

1. Run migrations:
```bash
cd apps/api
npx prisma migrate deploy
```

2. Generate Prisma client:
```bash
npx prisma generate
```

3. Import USDA data (optional):
```bash
npm run usda:import
```

### Starting Services

#### API Server
```bash
cd apps/api
npm run start:prod
```

#### Queue Worker (separate terminal)
```bash
cd apps/api
npm run worker
```

### Smoke Tests

1. Health check:
```bash
curl http://localhost:3000/v1/health
```

2. Request OTP:
```bash
curl -X POST http://localhost:3000/v1/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

3. Verify OTP (check logs for code):
```bash
curl -X POST http://localhost:3000/v1/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","code":"123456","deviceId":"test-device"}'
```

4. Presign upload:
```bash
curl -X POST http://localhost:3000/v1/meals/presign \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access-token>" \
  -d '{"contentType":"image/jpeg"}'
```

## Troubleshooting

### Common Issues

1. **Database connection failed**
   - Check DATABASE_URL format
   - Ensure PostgreSQL is running
   - Verify network connectivity

2. **Redis connection failed**
   - Check REDIS_URL format
   - Ensure Redis is running
   - Check firewall settings

3. **JWT signing failed**
   - Verify JWT_PRIVATE_KEY_BASE64 is correctly encoded
   - Check JWT_ALG matches key type (EdDSA)
   - Ensure JWT_KEY_ID is set

4. **S3 upload failed**
   - Verify S3 credentials
   - Check bucket permissions
   - Ensure S3_ENDPOINT is accessible

5. **AI analysis failed**
   - Check OpenAI/Anthropic API keys
   - Verify model names
   - Check rate limits

### Logs

- API logs: Check console output or configured log destination
- Worker logs: Separate process, check terminal output
- Database logs: `docker-compose logs postgres`
- Redis logs: `docker-compose logs redis`

### Performance Tuning

1. **Database**
   - Enable connection pooling
   - Add appropriate indexes
   - Monitor query performance

2. **Redis**
   - Configure memory limits
   - Enable persistence if needed
   - Monitor memory usage

3. **Queue Processing**
   - Adjust ANALYZE_CONCURRENCY based on CPU
   - Monitor queue length
   - Scale workers horizontally

### Monitoring

- Health endpoint: `/v1/health`
- Queue metrics: Check BullMQ dashboard (if configured)
- Database metrics: Use PostgreSQL monitoring tools
- Redis metrics: Use Redis monitoring commands

## Deployment

### Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] USDA data imported (if needed)
- [ ] SSL certificates configured
- [ ] Rate limiting configured
- [ ] Monitoring setup
- [ ] Backup strategy implemented
- [ ] Load balancer configured
- [ ] Auto-scaling policies set

### Scaling

1. **Horizontal Scaling**
   - Run multiple API instances behind load balancer
   - Scale queue workers based on queue length
   - Use Redis Cluster for high availability

2. **Vertical Scaling**
   - Increase CPU/memory for workers
   - Optimize database queries
   - Enable connection pooling

### Backup & Recovery

1. **Database Backup**
```bash
pg_dump $DATABASE_URL > backup.sql
```

2. **Redis Backup**
```bash
redis-cli BGSAVE
```

3. **S3 Backup**
   - Enable versioning
   - Configure cross-region replication
   - Set up lifecycle policies
