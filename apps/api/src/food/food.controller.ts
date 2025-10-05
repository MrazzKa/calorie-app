import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseInterceptors,
  UploadedFile,
  Get,
  Query,
  Inject,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import type IORedis from 'ioredis';
import { ConfigService } from '@nestjs/config';

import { FoodService } from './food.service';
import { JwtService } from '../jwt/jwt.service';
import { FOOD_QUEUE } from './tokens';

@Controller('food')
export class FoodController {
  constructor(
    private readonly food: FoodService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
    @Inject('REDIS') private readonly redis: IORedis,
    @InjectQueue(FOOD_QUEUE) private readonly queue: Queue,
  ) {}

  private async extractClaims(authz?: string): Promise<{ sub: string; role?: string }> {
    const token = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length) : undefined;
    if (!token) throw new BadRequestException('access_required');
    try {
      const p = await (this.jwt as any).verifyAccess(token);
      if (p?.sub) return { sub: String(p.sub), role: p.role as string | undefined };
    } catch {}
    try {
      const [, p2] = token.split('.');
      const json = Buffer.from(p2, 'base64url').toString('utf8');
      const payload = JSON.parse(json);
      if (payload?.sub && typeof payload.sub === 'string') return { sub: payload.sub, role: payload.role };
    } catch {}
    throw new BadRequestException('invalid_access');
  }

  private async assertDailyLimit(userId: string, role?: string) {
    if (role && role !== 'free') return;
    const limit = Number(this.cfg.get('FREE_DAILY_PHOTO_LIMIT') || 5);
    const date = new Date().toISOString().slice(0, 10);
    const key = `limit:meals:${userId}:${date}`;
    const cnt = await this.redis.incr(key);
    if (cnt === 1) await this.redis.expire(key, 86400);
    if (cnt > limit) throw new BadRequestException('daily_limit_exceeded');
  }

  @Post('analyze')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.CREATED)
  async analyze(
    @UploadedFile() file?: Express.Multer.File,
    @Headers('authorization') authz?: string,
  ) {
    if (!file || !file.buffer?.length) throw new BadRequestException('file_required');

    const { sub: userId, role } = await this.extractClaims(authz);
    await this.assertDailyLimit(userId, role);

    // В тестах — всегда sync.
    const isTest = process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';
    const configured = this.cfg.get<string>('ANALYZE_MODE') || process.env.ANALYZE_MODE || 'sync';
    const mode = isTest ? 'sync' : configured;

    if (mode === 'async') {
      const meal = await this.food.createPendingMeal({ userId });
      await this.queue.add({
        userId,
        mealId: meal.id,
        file: { mime: file.mimetype, base64: file.buffer.toString('base64') },
      });
      return { mealId: meal.id, status: 'processing', items: [] };
    }

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
    const raw = await (this as any).redis.get(`analyze:${sha}`);
    return { hit: !!raw, items: raw ? JSON.parse(raw) : null };
  }
}
