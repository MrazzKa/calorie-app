# CalorieCam

CalorieCam is a production-grade AI-powered nutrition analysis platform that uses computer vision to identify food items in photos and provide detailed nutritional information.

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 18+
- pnpm

### 1. Clone and Setup
```bash
git clone https://github.com/your-org/caloriecam.git
cd caloriecam
pnpm install
```

### 2. Environment Configuration
```bash
cp apps/api/.env.dev apps/api/.env
# Edit .env with your configuration (see docs/RUNBOOK.md)
```

### 3. Start Infrastructure
```bash
docker-compose up -d postgres redis
```

### 4. Database Setup
```bash
cd apps/api
npx prisma migrate deploy
npx prisma generate
```

### 5. Import USDA Data (Optional)
```bash
npm run usda:import
```

### 6. Start Services
```bash
# Terminal 1: API Server
npm run start:prod

# Terminal 2: Queue Worker
npm run worker
```

### 7. Test the API
```bash
curl http://localhost:3000/v1/health
```

## ✨ Features

### 🔐 Authentication
- **OTP Authentication**: Email-based one-time passwords
- **Magic Links**: Passwordless authentication
- **JWT Management**: EdDSA-signed tokens with refresh rotation
- **Session Management**: Device-based sessions with blacklist

### 🤖 AI Pipeline
- **Vision Analysis**: OpenAI GPT-4o & Anthropic Claude support
- **Food Identification**: Accurate food item detection
- **Portion Estimation**: LLM-based portion size calculation
- **Nutrition Analysis**: Comprehensive macro/micronutrient data
- **USDA Integration**: RAG-powered food database lookup

### 📸 Media Management
- **Presigned Uploads**: Secure S3/MinIO integration
- **Image Validation**: Comprehensive MIME type checking
- **Automatic Cleanup**: Configurable media retention
- **Result Caching**: SHA256-based analysis caching

### 📊 Analytics & Tracking
- **Daily Nutrition**: Comprehensive daily totals
- **Meal History**: Complete meal tracking
- **Portion Adjustment**: Real-time nutrition recalculation
- **Rate Limiting**: Configurable usage limits

### ⚡ Performance
- **Async Processing**: BullMQ-based job queues
- **Redis Caching**: High-performance result caching
- **Database Optimization**: Proper indexing and query optimization
- **Horizontal Scaling**: Multi-instance support

## 🏗️ Architecture

### Tech Stack
- **Backend**: NestJS + TypeScript (strict mode)
- **Database**: PostgreSQL with Prisma ORM
- **Cache/Queue**: Redis + BullMQ
- **Storage**: S3/MinIO for media files
- **AI**: OpenAI GPT-4o / Anthropic Claude
- **Security**: EdDSA JWT, rate limiting, input validation

### Key Components
- **Authentication Service**: OTP/Magic link with session management
- **AI Analyzer**: Vision → Labels → Portions → Nutrition pipeline
- **Media Service**: S3 integration with presigned uploads
- **Queue Worker**: Async food analysis processing
- **USDA Importer**: CSV-based food database import

## 📚 Documentation

- **[Runbook](docs/RUNBOOK.md)**: Complete setup and deployment guide
- **[Development Log](docs/DEVLOG.md)**: Implementation details and decisions
- **API Docs**: Available at `/docs` when running the server

## 🔧 Configuration

### Required Environment Variables
```bash
# Database & Cache
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# JWT Configuration
JWT_PRIVATE_KEY_BASE64=<base64-encoded-key>
JWT_PUBLIC_KEY=<pem-public-key>

# S3 Storage
S3_ENDPOINT=https://...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

See `docs/RUNBOOK.md` for complete configuration guide.

## 🚀 Deployment

### Production Checklist
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] USDA data imported
- [ ] SSL certificates configured
- [ ] Monitoring setup
- [ ] Backup strategy implemented

### Scaling
- **Horizontal**: Multiple API instances behind load balancer
- **Vertical**: Optimize database queries and connection pooling
- **Queue Workers**: Scale based on queue length

## 🧪 Testing

### Smoke Tests
```bash
# Health check
curl http://localhost:3000/v1/health

# Authentication flow
curl -X POST http://localhost:3000/v1/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

### E2E Tests
- Complete photo analysis pipeline
- Authentication flows
- Rate limiting validation
- Error handling

## 📈 Performance

- **Database**: Optimized queries with proper indexing
- **Caching**: Redis-based result caching (7-day TTL)
- **Queue**: Async processing with exponential backoff
- **Network**: Timeout configurations and retry policies

## 🔒 Security

- **Authentication**: EdDSA JWT with refresh rotation
- **Rate Limiting**: Per-email and per-IP limits
- **Input Validation**: Comprehensive DTO validation
- **Logging**: Correlation IDs, no PII exposure

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Follow TypeScript strict mode
4. Add comprehensive tests
5. Update documentation
6. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

- **Documentation**: Check `docs/RUNBOOK.md` for troubleshooting
- **Issues**: Create GitHub issues for bugs or feature requests
- **Discussions**: Use GitHub Discussions for questions

---

**Built with ❤️ using NestJS, TypeScript, and modern AI technologies.**