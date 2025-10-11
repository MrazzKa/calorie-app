import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { FoodService } from './food.service';
import { JwtService } from '../jwt/jwt.service';
import { MediaService } from '../media/media.service';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import type Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

class CreateMealDto {
  @IsString()
  @IsNotEmpty()
  assetId!: string;
}

class PresignDto {
  @IsString()
  @IsNotEmpty()
  contentType!: string;
}

class AdjustMealDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsNumber()
  @Min(-1000)
  gramsDelta!: number;
}

@Controller('meals')
export class MealsController {
  constructor(
    private readonly food: FoodService,
    private readonly jwt: JwtService,
    private readonly mediaService: MediaService,
    private readonly configService: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  private async extractClaims(authz?: string): Promise<{ sub: string }> {
    const token = authz?.startsWith('Bearer ') ? authz.slice('Bearer '.length) : undefined;
    if (!token) throw new BadRequestException('access_required');
    try {
      const p = await (this.jwt as any).verifyAccess(token);
      if (p?.sub) return { sub: String(p.sub) };
    } catch {}
    try {
      const [, p2] = token.split('.');
      const json = Buffer.from(p2, 'base64url').toString('utf8');
      const payload = JSON.parse(json);
      if (payload?.sub && typeof payload.sub === 'string') return { sub: payload.sub };
    } catch {}
    throw new BadRequestException('invalid_access');
  }

  @Get()
  async list(
    @Headers('authorization') authz?: string,
    @Query('take') take?: string,
    @Query('date') date?: string,
  ) {
    const { sub } = await this.extractClaims(authz);
    if (date) {
      return await (this.food as any).listMealsByDate({ userId: sub, date });
    }
    const n = take ? Number(take) : undefined;
    return await this.food.listMeals({ userId: sub, take: isFinite(n as number) ? n : undefined });
  }

  @Get(':id')
  async one(@Param('id') id: string, @Headers('authorization') authz?: string) {
    const { sub } = await this.extractClaims(authz);
    return await this.food.getMeal({ userId: sub, mealId: id });
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Headers('authorization') authz?: string,
    @Body() body?: { items: Array<{ id?: string; label: string; grams?: number | null; gramsMean?: number | null; kcal?: number | null; protein?: number | null; fat?: number | null; carbs?: number | null; source?: string | null; canonicalId?: string | null; }> },
  ) {
    const { sub } = await this.extractClaims(authz);
    if (!body || !Array.isArray(body.items)) throw new BadRequestException('items_required');
    const result = await this.food.updateMeal({ userId: sub, mealId: id, items: body.items });
    await this.food.recomputeMealTotals(id, sub);
    return result;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @Headers('authorization') authz?: string) {
    const { sub } = await this.extractClaims(authz);
    await (this.food as any).deleteMeal({ userId: sub, mealId: id });
  }

  @Post('presign')
  @HttpCode(HttpStatus.CREATED)
  async presign(
    @Body() body: PresignDto,
    @Headers('authorization') authz?: string,
  ) {
    const { sub } = await this.extractClaims(authz);
    return this.mediaService.generatePresignedUploadUrl(sub, body.contentType);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createMeal(
    @Body() body: CreateMealDto | { items?: Array<{ label: string; grams?: number | null; kcal?: number | null; protein?: number | null; fat?: number | null; carbs?: number | null; canonicalId?: string | null }>; createdAt?: string },
    @Headers('authorization') authz?: string,
  ) {
    const { sub } = await this.extractClaims(authz);
    const analyzeMode = this.configService.get<string>('ANALYZE_MODE') || 'async';

    // DAILY LIMIT 402 - disabled if DISABLE_LIMITS=true
    const disableLimits = process.env.DISABLE_LIMITS === 'true';
    if (!disableLimits) {
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const limitKey = `lim:photo:${sub}:${today}`;
      const newCount = await this.redis.incr(limitKey);
      await this.redis.expire(limitKey, 86400);
      const freeLimit = this.configService.get<number>('FREE_DAILY_PHOTO_LIMIT') || 5;
      const role = this.configService.get<string>('DEFAULT_ROLE') || 'free';
      if (role === 'free' && newCount > freeLimit) {
        throw new HttpException({ code: 'limit_exceeded' }, HttpStatus.PAYMENT_REQUIRED);
      }
    }

    // Manual meal create path (no assetId provided)
    if (!(body as any).assetId && Array.isArray((body as any).items)) {
      const createdAt = (body as any).createdAt ? new Date((body as any).createdAt + 'T00:00:00.000Z') : undefined;
      const res = await (this.food as any).createManualMeal({ userId: sub, items: (body as any).items, createdAt });
      return { mealId: res.mealId, status: 'ready', items: (body as any).items };
    }

    // Photo-based meal
    const meal = await this.food.createMeal({ userId: sub, assetId: (body as any).assetId });

    if (analyzeMode === 'sync') {
      return { ...meal, status: 'ready' } as any;
    } else {
      await this.enqueueAnalysis(meal.id);
      return { ...meal, status: 'pending' } as any;
    }
  }

  @Patch(':id/adjust')
  async adjustMeal(
    @Param('id') id: string,
    @Body() body: AdjustMealDto,
    @Headers('authorization') authz?: string,
  ) {
    const { sub } = await this.extractClaims(authz);
    const mealId = id;

    const item = await this.prisma.mealItem.findUnique({ where: { id: body.itemId } });
    if (!item || item.mealId !== mealId) throw new NotFoundException();

    const newMean = Math.max(0, (item.gramsMean ?? 0) + body.gramsDelta);
    const newMin  = Math.max(0, item.gramsMin ?? newMean);
    const newMax  = Math.max(newMean, item.gramsMax ?? newMean);

    const denom = (item.gramsMean ?? 0) || 1;
    const ratio = newMean / denom;

    const next = {
      gramsMean: newMean,
      gramsMin: newMin,
      gramsMax: newMax,
      kcal: item.kcal != null ? Math.round((item.kcal ?? 0) * ratio) : null,
      protein: item.protein != null ? Math.round(((item.protein ?? 0) * ratio) * 10) / 10 : null,
      fat: item.fat != null ? Math.round(((item.fat ?? 0) * ratio) * 10) / 10 : null,
      carbs: item.carbs != null ? Math.round(((item.carbs ?? 0) * ratio) * 10) / 10 : null,
    } as const;

    await this.prisma.mealItem.update({ where: { id: body.itemId }, data: next });

    const items = await this.prisma.mealItem.findMany({ where: { mealId } });
    const kcalMean = Math.round(items.reduce((s,i)=>s+(i.kcal ?? 0),0));
    const kcalMin  = Math.round(kcalMean*0.9);
    const kcalMax  = Math.round(kcalMean*1.1);

    const prev = await this.prisma.meal.findUnique({ where: { id: mealId } });
    const whyPrev = (prev?.whyJson as any[]) ?? [];
    const whyEntry = { method: 'user' };

    await this.prisma.meal.update({
      where: { id: mealId },
      data: {
        kcalMean, kcalMin, kcalMax,
        whyJson: ([...whyPrev, whyEntry] as unknown) as import('@prisma/client').Prisma.InputJsonValue,
      },
    });

    return { 
      ok: true,
      kcalMean,
      summary: { kcalMean }
    };
  }

  private async getDailyPhotoCount(userId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const limitKey = `lim:photo:${userId}:${today}`;
    const count = await this.redis.get(limitKey);
    return parseInt(count || '0', 10);
  }

  private async enqueueAnalysis(mealId: string): Promise<void> {
    const queueName = this.configService.get<string>('FOOD_QUEUE') || 'food:analyze';
    
    // TODO: Implement actual queue enqueueing when BullMQ is properly configured
    console.log(`Would enqueue analysis for meal ${mealId} to queue ${queueName}`);
  }
}
