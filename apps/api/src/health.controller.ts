import { Controller, Get, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import { REDIS } from './redis/redis.module';
import type Redis from 'ioredis';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  async get() {
    const checks = {
      ok: true,
      ts: new Date().toISOString(),
      db: 'unknown',
      redis: 'unknown',
      s3: 'disabled',
    };

    // Database check
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.db = 'ok';
    } catch (e) {
      checks.ok = false;
      checks.db = 'error';
    }

    // Redis check
    try {
      await this.redis.ping();
      checks.redis = 'ok';
    } catch (e) {
      checks.ok = false;
      checks.redis = 'error';
    }

    // S3 check - only if DISABLE_UPLOADS is not true
    const disableUploads = this.cfg.get<string>('DISABLE_UPLOADS') === 'true';
    if (!disableUploads) {
      try {
        const s3Endpoint = this.cfg.get<string>('S3_ENDPOINT');
        const s3Bucket = this.cfg.get<string>('S3_BUCKET');
        const s3AccessKeyId = this.cfg.get<string>('S3_ACCESS_KEY_ID');
        const s3SecretAccessKey = this.cfg.get<string>('S3_SECRET_ACCESS_KEY');
        const s3Region = this.cfg.get<string>('S3_REGION') || 'us-east-1';
        const forcePathStyle = this.cfg.get<string>('S3_FORCE_PATH_STYLE') === 'true';

        if (s3Endpoint && s3Bucket && s3AccessKeyId && s3SecretAccessKey) {
          const s3Client = new S3Client({
            endpoint: s3Endpoint,
            region: s3Region,
            credentials: {
              accessKeyId: s3AccessKeyId,
              secretAccessKey: s3SecretAccessKey,
            },
            forcePathStyle,
          });

          await s3Client.send(new HeadBucketCommand({ Bucket: s3Bucket }));
          checks.s3 = 'ok';
        } else {
          checks.s3 = 'not_configured';
        }
      } catch (e) {
        checks.ok = false;
        checks.s3 = 'error';
      }
    }

    return checks;
  }
}
