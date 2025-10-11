import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly ttlSec = 300;

  constructor(
    private readonly cfg: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

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
