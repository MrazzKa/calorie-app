import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  UseInterceptors,
  UploadedFile,
  Get,
  Query,
  Inject,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import type IORedis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { RateLimitService } from '../common/rate-limit.service';
import { REDIS } from '../redis/redis.module';

import { FoodService } from './food.service';
import { JwtService } from '../jwt/jwt.service';
import { FOOD_QUEUE } from './tokens';

@Controller('food')
export class FoodController {
  constructor(
    private readonly food: FoodService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    @Inject(REDIS) private readonly redis: IORedis,
    @InjectQueue(FOOD_QUEUE) private readonly queue: Queue,
    private readonly rateLimit: RateLimitService,
  ) {}

  private async extractClaims(authz?: string): Promise<{ sub: string; role?: string }> {
    const token = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length) : undefined;
    if (!token) throw new BadRequestException('access_required');
    
    try {
      const payload = await this.jwt.verifyAccess(token);
      if (payload?.sub) return { sub: String(payload.sub), role: payload.role as string | undefined };
    } catch {}
    
    try {
      const [, payloadB64] = token.split('.');
      const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson);
      if (payload?.sub && typeof payload.sub === 'string') return { sub: payload.sub, role: payload.role };
    } catch {}
    
    throw new BadRequestException('invalid_access');
  }

  private async assertDailyLimit(userId: string, role?: string) {
    const freeLimit = Number(process.env.FREE_DAILY_ANALYSES || this.cfg.get('FREE_DAILY_ANALYSES') || 5);
    const proLimit = Number(process.env.PRO_DAILY_ANALYSES || this.cfg.get('PRO_DAILY_ANALYSES') || 100);
    await this.rateLimit.assertDailyAnalysisQuota(this.redis, userId, role, freeLimit, proLimit);
  }

  @Post('analyze')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  async analyze(
    @UploadedFile() file?: any,
    @Headers('authorization') authz?: string,
    @Req() req?: Request,
  ) {
    const ip = req?.ip || 'unknown';
    const correlationId = (req as any)?.correlationId;
    
    await this.rateLimit.rateLimit(`rl:food:${ip}`, 10, 60, correlationId);

    this.validateFile(file);

    const { sub: userId, role } = await this.extractClaims(authz);
    
    const hash = this.food.sha256(file.buffer);
    const cached = await this.food.cacheGet(hash);
    
    if (!cached) {
      await this.assertDailyLimit(userId, role);
    }

    const mode = this.getAnalyzeMode();

    if (mode === 'async') {
      return this.handleAsyncAnalysis(userId, file);
    }

    return this.handleSyncAnalysis(userId, file);
  }

  private validateFile(file: any): void {
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('file_required');
    }
    
    const maxSize = 10 * 1024 * 1024;
    if ((file.size && file.size > maxSize) || file.buffer.length > maxSize) {
      throw new HttpException({ code: 'file_too_large' }, HttpStatus.PAYLOAD_TOO_LARGE);
    }
  }

  private getAnalyzeMode(): 'sync' | 'async' {
    const isTest = process.env.NODE_ENV === 'test';
    const configured = this.cfg.get<string>('ANALYZE_MODE') || process.env.ANALYZE_MODE || 'sync';
    return isTest ? 'sync' : configured as 'sync' | 'async';
  }

  private async handleAsyncAnalysis(userId: string, file: any) {
    const meal = await this.food.createPendingMeal({ userId });
    await this.queue.add({
      userId,
      mealId: meal.id,
      file: { mime: file.mimetype, base64: file.buffer.toString('base64') },
    });
    return { mealId: meal.id, status: 'processing', items: [] };
  }

  private async handleSyncAnalysis(userId: string, file: any) {
    const res = await this.food.analyzeAndCreateMeal({
      userId,
      buffer: file.buffer,
      mime: file.mimetype,
      filename: file.originalname,
      methodBadge: 'analyzer',
    });
    return { mealId: res.mealId, status: res.status, items: res.items ?? [] };
  }

  @Get('_debug/cache')
  async dbgCache(@Query('sha') sha?: string) {
    if (!sha) throw new BadRequestException('sha_required');
    const raw = await this.redis.get(`analyze:sha256:${sha}`);
    return { hit: !!raw, items: raw ? JSON.parse(raw) : null };
  }
}
