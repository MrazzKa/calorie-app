import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

@Injectable()
export class RateLimitService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async rateLimit(
    key: string,
    limit: number,
    windowSec: number,
    correlationId?: string,
  ): Promise<void> {
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, windowSec);
    }
    
    if (current > limit) {
      throw new HttpException({
        code: 'rate_limit_exceeded',
        message: `Rate limit exceeded: ${limit} requests per ${windowSec}s`,
        correlationId,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async checkRateLimit(
    key: string,
    limit: number,
    windowSec: number,
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, windowSec);
    }
    
    const ttl = await this.redis.ttl(key);
    const resetTime = Date.now() + (ttl > 0 ? ttl * 1000 : windowSec * 1000);
    
    return {
      allowed: current <= limit,
      remaining: Math.max(0, limit - current),
      resetTime,
    };
  }

  // Centralized daily analysis quota check (FREE vs PRO)
  async assertDailyAnalysisQuota(redis: Redis, userId: string, role: string | undefined, free: number, pro: number) {
    if (process.env.DISABLE_LIMITS === 'true') return;
    const isPro = role === 'pro';
    const limit = isPro ? pro : free;
    const date = new Date().toISOString().slice(0, 10);
    const key = `limit:meals:${userId}:${date}`;
    const cnt = await redis.incr(key);
    if (cnt === 1) await redis.expire(key, 86400);
    if (cnt > limit) {
      throw new HttpException({ code: 'limit_exceeded' }, HttpStatus.PAYMENT_REQUIRED);
    }
  }
}
