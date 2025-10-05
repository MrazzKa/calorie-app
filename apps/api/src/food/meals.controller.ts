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
import type Redis from 'ioredis';

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
    @Inject('REDIS') private readonly redis: Redis,
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
  async list(@Headers('authorization') authz?: string, @Query('take') take?: string) {
    const { sub } = await this.extractClaims(authz);
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
    @Body() body: CreateMealDto,
    @Headers('authorization') authz?: string,
  ) {
    const { sub } = await this.extractClaims(authz);
    const analyzeMode = this.configService.get<string>('ANALYZE_MODE') || 'async';
    
    // Check daily limits for free users
    const dailyCount = await this.getDailyPhotoCount(sub);
    const limit = this.configService.get<number>('FREE_DAILY_PHOTO_LIMIT') || 5;
    
    if (dailyCount >= limit) {
      throw new HttpException({
        code: 'limit_exceeded',
        message: `Daily photo limit of ${limit} exceeded`,
        dailyCount,
        limit,
      }, HttpStatus.PAYMENT_REQUIRED);
    }

    // Create meal using existing food service
    const meal = await this.food.createMeal({ userId: sub, assetId: body.assetId });

    // Increment daily photo count
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const limitKey = `lim:photo:${sub}:${today}`;
    await this.redis.incr(limitKey);
    await this.redis.expire(limitKey, 86400); // 24 hours

    if (analyzeMode === 'sync') {
      // Run analysis synchronously (placeholder for now)
      return {
        ...meal,
        status: 'ready',
        message: 'Sync analysis not yet implemented',
      };
    } else {
      // Enqueue for async analysis
      await this.enqueueAnalysis(meal.id);
      return {
        ...meal,
        status: 'pending',
        message: 'Analysis queued',
      };
    }
  }

  @Patch(':id/adjust')
  async adjustMeal(
    @Param('id') id: string,
    @Body() body: AdjustMealDto,
    @Headers('authorization') authz?: string,
  ) {
    const { sub } = await this.extractClaims(authz);
    
    // Get the meal
    const meal = await this.food.getMeal({ userId: sub, mealId: id });
    if (!meal) {
      throw new BadRequestException(`Meal ${id} not found`);
    }

    // Find the item to adjust
    const item = meal.items.find(i => i.id === body.itemId);
    if (!item) {
      throw new BadRequestException(`Item ${body.itemId} not found`);
    }

    // Update item grams
    const newGramsMean = Math.max(0, (item.gramsMean || 0) + body.gramsDelta);
    const newGramsMin = Math.max(0, (item.gramsMin || 0) + body.gramsDelta);
    const newGramsMax = Math.max(0, (item.gramsMax || 0) + body.gramsDelta);

    // Update the item
    await this.food.updateMeal({
      userId: sub,
      mealId: id,
      items: [
        ...meal.items.filter(i => i.id !== body.itemId),
        {
          ...item,
          gramsMean: newGramsMean,
          gramsMin: newGramsMin,
          gramsMax: newGramsMax,
          // Recalculate nutrition if we have canonical data
          kcal: item.canonicalId ? Math.round((item.kcal || 0) * (newGramsMean / (item.gramsMean || 1))) : item.kcal,
          protein: item.canonicalId ? Math.round((item.protein || 0) * (newGramsMean / (item.gramsMean || 1)) * 10) / 10 : item.protein,
          fat: item.canonicalId ? Math.round((item.fat || 0) * (newGramsMean / (item.gramsMean || 1)) * 10) / 10 : item.fat,
          carbs: item.canonicalId ? Math.round((item.carbs || 0) * (newGramsMean / (item.gramsMean || 1)) * 10) / 10 : item.carbs,
        },
      ],
    });

    // Recompute meal totals
    await this.food.recomputeMealTotals(id, sub);

    return {
      message: 'Adjustment completed',
      mealId: id,
      itemId: body.itemId,
      gramsDelta: body.gramsDelta,
      newGramsMean,
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
