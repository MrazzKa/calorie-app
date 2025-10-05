import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma.service';
import { MediaService } from '../media/media.service';
import { RateLimitService } from '../common/rate-limit.service';
import type Redis from 'ioredis';
import { createHash } from 'crypto';

@Injectable()
export class MealsService {
  private readonly logger = new Logger(MealsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly rateLimitService: RateLimitService,
    @Inject('REDIS') private readonly redis: Redis,
    @InjectQueue('food:analyze') private readonly foodQueue: Queue,
  ) {}

  async createMeal(userId: string, assetId: string) {
    this.logger.log(`Creating meal for user ${userId} with asset ${assetId}`);

    // Verify asset belongs to user
    const asset = await this.prisma.mediaAsset.findFirst({
      where: {
        id: assetId,
        ownerId: userId,
      },
    });

    if (!asset) {
      throw new Error(`Asset ${assetId} not found for user ${userId}`);
    }

    const meal = await this.prisma.meal.create({
      data: {
        userId,
        assetId,
        status: 'pending',
      },
    });

    // Increment daily photo count for rate limiting
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const limitKey = `lim:photo:${userId}:${today}`;
    await this.redis.incr(limitKey);
    await this.redis.expire(limitKey, 86400); // 24 hours

    this.logger.log(`Created meal ${meal.id} for user ${userId}`);
    return meal;
  }

  async getDailyPhotoCount(userId: string): Promise<number> {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const limitKey = `lim:photo:${userId}:${today}`;
    const count = await this.redis.get(limitKey);
    return parseInt(count || '0', 10);
  }

  async getMealById(mealId: string, userId: string) {
    return this.prisma.meal.findFirst({
      where: {
        id: mealId,
        userId,
      },
      include: {
        items: {
          include: {
            canonical: true,
          },
        },
        asset: true,
      },
    });
  }

  async adjustMealItem(
    mealId: string,
    itemId: string,
    gramsDelta: number,
    userId: string,
  ) {
    this.logger.log(`Adjusting meal item ${itemId} by ${gramsDelta}g`);

    // Verify meal belongs to user
    const meal = await this.prisma.meal.findFirst({
      where: {
        id: mealId,
        userId,
        status: 'ready',
      },
      include: {
        items: true,
      },
    });

    if (!meal) {
      return null;
    }

    const item = meal.items.find(i => i.id === itemId);
    if (!item) {
      return null;
    }

    // Update item grams
    const newGramsMean = Math.max(0, (item.gramsMean || 0) + gramsDelta);
    const newGramsMin = Math.max(0, (item.gramsMin || 0) + gramsDelta);
    const newGramsMax = Math.max(0, (item.gramsMax || 0) + gramsDelta);

    await this.prisma.mealItem.update({
      where: { id: itemId },
      data: {
        gramsMean: newGramsMean,
        gramsMin: newGramsMin,
        gramsMax: newGramsMax,
      },
    });

    // Recalculate nutrition if we have canonical data
    if (item.canonicalId) {
      const canonical = await this.prisma.foodCanonical.findUnique({
        where: { id: item.canonicalId },
      });

      if (canonical) {
        const multiplier = newGramsMean / 100;
        const kcal = Math.round(canonical.kcalPer100g * multiplier);
        const protein = Math.round(canonical.proteinPer100g * multiplier * 10) / 10;
        const fat = Math.round(canonical.fatPer100g * multiplier * 10) / 10;
        const carbs = Math.round(canonical.carbsPer100g * multiplier * 10) / 10;

        await this.prisma.mealItem.update({
          where: { id: itemId },
          data: {
            kcal,
            protein,
            fat,
            carbs,
          },
        });
      }
    }

    // Recalculate meal summary
    await this.recalculateMealSummary(mealId);

    // Add adjustment to whyJson
    const whyEntry = {
      label: item.label,
      portion: {
        gramsMin: newGramsMin,
        gramsMax: newGramsMax,
        gramsMean: newGramsMean,
        method: 'user' as const,
      },
      method: 'user' as const,
      timestamp: new Date().toISOString(),
    };

    const currentWhyJson = meal.whyJson as any[] || [];
    await this.prisma.meal.update({
      where: { id: mealId },
      data: {
        whyJson: [...currentWhyJson, whyEntry],
      },
    });

    return this.getMealById(mealId, userId);
  }

  private async recalculateMealSummary(mealId: string) {
    const items = await this.prisma.mealItem.findMany({
      where: { mealId },
    });

    const kcalMean = items.reduce((sum, item) => sum + (item.kcal || 0), 0);
    const kcalMin = Math.round(kcalMean * 0.9);
    const kcalMax = Math.round(kcalMean * 1.1);

    await this.prisma.meal.update({
      where: { id: mealId },
      data: {
        kcalMean,
        kcalMin,
        kcalMax,
        confidence: 0.7,
        methodBadge: 'd2',
      },
    });
  }

  async enqueueAnalysis(mealId: string) {
    const meal = await this.prisma.meal.findUnique({
      where: { id: mealId },
      include: { asset: true },
    });

    if (!meal || !meal.asset) {
      throw new Error(`Meal ${mealId} or its asset not found`);
    }

    this.logger.log(`Enqueuing analysis for meal ${mealId}`);
    
    await this.foodQueue.add('analyze', {
      mealId,
      assetId: meal.assetId!,
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 3000,
      },
      removeOnComplete: 1000,
      removeOnFail: 500,
    });
  }

  async analyzeMeal(mealId: string) {
    // This will be implemented when we create the AI pipeline
    this.logger.log(`Analyzing meal ${mealId} synchronously`);
    
    // TODO: Implement actual analysis
    return { status: 'pending', message: 'Analysis not yet implemented' };
  }

  async calculateImageHash(buffer: Buffer): Promise<string> {
    return createHash('sha256').update(buffer).digest('hex');
  }
}
