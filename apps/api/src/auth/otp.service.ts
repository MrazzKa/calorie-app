import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import IORedis from 'ioredis';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly ttlSec = 300;
  private readonly redis: IORedis;

  constructor(private readonly cfg: ConfigService) {
    const url = this.cfg.get<string>('REDIS_URL', 'redis://localhost:6379/0');
    this.redis = new IORedis(url, { lazyConnect: false, maxRetriesPerRequest: 1 });
  }

  async issueForEmail(email: string): Promise<{ code: string }> {
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    const key = `otp:email:${email}:code`;
    try {
      await this.redis.setex(key, this.ttlSec, code);
    } catch (e) {
      this.logger.error(`Redis setex failed: ${(e as Error).message}`);
    }
    return { code };
  }

  async notifyByEmail(email: string, code: string) {
    const mode = this.cfg.get<string>('MAIL_MODE', 'console');
    if (mode === 'console') {
      this.logger.log(`[OTP] ${email} -> ${code}`);
      return;
    }
    // SMTP-транспорт, если настроен (не обязателен для dev/test)
  }
}
