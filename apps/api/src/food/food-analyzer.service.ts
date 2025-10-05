import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma.service';
import { MediaService } from '../media/media.service';
import type { LabelerProvider, VisionLabel } from './analyzers/labeler.provider';
import { LABELER_PROVIDER } from './analyzers/labeler.provider';
import { PortionEstimator, type Portion } from './portion/portion-estimator';
import { NutrientResolver, type Canonical } from './rag/nutrient-resolver';
import { NutritionComposer } from './compose/nutrition-composer';
import { METHOD_BADGE } from '../common/constants/method-badge';
import type Redis from 'ioredis';
import { createHash } from 'crypto';
import type { MealItem, Prisma } from '@prisma/client';

export interface WhyEntry {
  label: string;
  portion: Portion;
  matched: {
    id: string;
    name: string;
    source: string;
    score?: number;
  };
  per100g: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
  };
  method: 'barcode' | 'ar' | 'd2';
  cache?: boolean;
  evidence?: string[];
}

@Injectable()
export class FoodAnalyzerService {
  private readonly logger = new Logger(FoodAnalyzerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly portionEstimator: PortionEstimator,
    private readonly nutrientResolver: NutrientResolver,
    private readonly nutritionComposer: NutritionComposer,
    @Inject(LABELER_PROVIDER) private readonly labeler: LabelerProvider,
    @Inject('REDIS') private readonly redis: Redis,
  ) {}

  async analyze(mealId: string, assetId: string): Promise<{
    status: 'ready' | 'failed';
    summary?: any;
    items?: WhyEntry[];
  }> {
    const startTime = Date.now();
    
    try {
      this.logger.log(`Starting analysis for meal ${mealId}`);

      // Get the meal and asset
      const meal = await this.prisma.meal.findUnique({
        where: { id: mealId },
        include: { asset: true },
      });

      if (!meal || !meal.asset) {
        throw new Error(`Meal ${mealId} or asset not found`);
      }

      // Get image buffer
      const imageBuffer = await this.mediaService.getAssetBuffer(assetId, meal.userId);
      
      // Calculate image hash for caching
      const imageHash = this.calculateImageHash(imageBuffer);
      
      // Check cache
      const cacheKey = `img:sha256:${imageHash}`;
      const cached = await this.checkCache(cacheKey);
      
      if (cached) {
        this.logger.log(`Using cached analysis for meal ${mealId}`);
        await this.applyCachedAnalysis(mealId, cached);
        return { status: 'ready', summary: cached.summary, items: cached.items };
      }

      // Extract labels
      const labels = await this.labeler.extractLabels(imageBuffer);
      this.logger.debug(`Extracted ${labels.length} labels: ${labels.map(l => l.name).join(', ')}`);

      if (labels.length === 0) {
        throw new Error('No food items detected in image');
      }

      // Estimate portions
      const portions = await this.portionEstimator.estimate(imageBuffer, labels);
      this.logger.debug(`Estimated portions for ${Object.keys(portions).length} items`);

      // Resolve nutrient data and create meal items
      const whyEntries: WhyEntry[] = [];
      const mealItems: MealItem[] = [];

      for (const label of labels) {
        const portion = portions[label.name];
        if (!portion) {
          this.logger.warn(`No portion estimate for ${label.name}`);
          continue;
        }

        // Resolve canonical food data
        const canonical = await this.nutrientResolver.resolve(label.name);
        
        // Compute nutrition
        const nutrition = this.nutritionComposer.computeItem(portion.gramsMean, {
          kcalPer100g: canonical.kcalPer100g,
          proteinPer100g: canonical.proteinPer100g,
          fatPer100g: canonical.fatPer100g,
          carbsPer100g: canonical.carbsPer100g,
        });

        // Create meal item
        const mealItem = await this.prisma.mealItem.create({
          data: {
            mealId,
            label: label.name,
            gramsMin: portion.gramsMin,
            gramsMax: portion.gramsMax,
            gramsMean: portion.gramsMean,
            kcal: nutrition.kcal,
            protein: nutrition.protein,
            fat: nutrition.fat,
            carbs: nutrition.carbs,
            source: canonical.source,
            canonicalId: canonical.id,
          },
        });

        mealItems.push(mealItem);

        // Create why entry
        const whyEntry: WhyEntry = {
          label: label.name,
          portion,
          matched: {
            id: canonical.id,
            name: canonical.name,
            source: canonical.source,
            score: canonical.score,
          },
          per100g: {
            kcal: canonical.kcalPer100g,
            protein: canonical.proteinPer100g,
            fat: canonical.fatPer100g,
            carbs: canonical.carbsPer100g,
          },
          method: METHOD_BADGE.d2,
          cache: false,
        };

        whyEntries.push(whyEntry);
      }

      // Compute meal summary
      const summary = this.nutritionComposer.computeMealSummary(
        mealItems.map(item => ({
          gramsMin: item.gramsMin || undefined,
          gramsMax: item.gramsMax || undefined,
          gramsMean: item.gramsMean,
          per100g: {
            kcalPer100g: item.kcal || 0,
            proteinPer100g: item.protein || 0,
            fatPer100g: item.fat || 0,
            carbsPer100g: item.carbs || 0,
          },
        }))
      );

        // Update meal with results
        await this.prisma.meal.update({
          where: { id: mealId },
          data: {
            status: 'ready',
            kcalMin: summary.kcalMin,
            kcalMax: summary.kcalMax,
            kcalMean: summary.kcalMean,
            confidence: summary.confidence,
            methodBadge: summary.methodBadge,
            whyJson: whyEntries as unknown as Prisma.InputJsonValue,
          },
        });

      // Cache the result
      const cacheData = {
        summary,
        items: whyEntries,
      };
      await this.cacheAnalysis(cacheKey, cacheData);

      const duration = Date.now() - startTime;
      this.logger.log(`Completed analysis for meal ${mealId} in ${duration}ms`);

      return {
        status: 'ready',
        summary,
        items: whyEntries,
      };
    } catch (error) {
      this.logger.error(`Analysis failed for meal ${mealId}:`, error);
      
      await this.prisma.meal.update({
        where: { id: mealId },
        data: { 
          status: 'failed',
          whyJson: [{ error: error.message, timestamp: new Date().toISOString() }] as unknown as Prisma.InputJsonValue,
        },
      });

      return { status: 'failed' };
    }
  }

  private calculateImageHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private async checkCache(cacheKey: string): Promise<any> {
    try {
      const cached = await this.redis.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      this.logger.warn(`Cache check failed for ${cacheKey}:`, error);
      return null;
    }
  }

  private async applyCachedAnalysis(mealId: string, cached: any): Promise<void> {
    try {
      // Create meal items from cached data
      const mealItems = [];
      
      for (const item of cached.items) {
        const canonical = await this.prisma.foodCanonical.findUnique({
          where: { id: item.matched.id },
        });

        if (canonical) {
          const nutrition = this.nutritionComposer.computeItem(item.portion.gramsMean, {
            kcalPer100g: canonical.kcalPer100g,
            proteinPer100g: canonical.proteinPer100g,
            fatPer100g: canonical.fatPer100g,
            carbsPer100g: canonical.carbsPer100g,
          });

          const mealItem = await this.prisma.mealItem.create({
            data: {
              mealId,
              label: item.label,
              gramsMin: item.portion.gramsMin,
              gramsMax: item.portion.gramsMax,
              gramsMean: item.portion.gramsMean,
              kcal: nutrition.kcal,
              protein: nutrition.protein,
              fat: nutrition.fat,
              carbs: nutrition.carbs,
              source: canonical.source,
              canonicalId: canonical.id,
            },
          });

          mealItems.push(mealItem);
        }
      }

      // Update meal with cached results
      await this.prisma.meal.update({
        where: { id: mealId },
        data: {
          status: 'ready',
          kcalMin: cached.summary.kcalMin,
          kcalMax: cached.summary.kcalMax,
          kcalMean: cached.summary.kcalMean,
          confidence: cached.summary.confidence,
          methodBadge: cached.summary.methodBadge,
          whyJson: cached.items.map((item: any) => ({ ...item, cache: true })) as unknown as Prisma.InputJsonValue,
        },
      });

      this.logger.log(`Applied cached analysis to meal ${mealId}`);
    } catch (error) {
      this.logger.error(`Failed to apply cached analysis to meal ${mealId}:`, error);
      throw error;
    }
  }

  private async cacheAnalysis(cacheKey: string, data: any): Promise<void> {
    try {
      const ttl = this.configService.get<number>('IMAGE_CACHE_TTL_SEC') || 604800;
      await this.redis.setex(cacheKey, ttl, JSON.stringify(data));
      this.logger.debug(`Cached analysis for ${cacheKey}`);
    } catch (error) {
      this.logger.warn(`Failed to cache analysis for ${cacheKey}:`, error);
    }
  }
}
