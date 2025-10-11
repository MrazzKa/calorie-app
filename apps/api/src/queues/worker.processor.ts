import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MediaService } from '../media/media.service';
import { FoodAnalyzerService } from '../food/food-analyzer.service';
import { ConfigService } from '@nestjs/config';

interface AnalyzeJobData {
  mealId: string;
  assetId: string;
}

@Injectable()
@Processor(process.env.FOOD_QUEUE || 'food:analyze')
export class FoodAnalyzeProcessor {
  private readonly logger = new Logger(FoodAnalyzeProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly foodAnalyzer: FoodAnalyzerService,
    private readonly configService: ConfigService,
  ) {}

  @Process('analyze')
  async handleAnalyze(job: { data: AnalyzeJobData; id: string }) {
    const { mealId, assetId } = job.data;
    const startTime = Date.now();

    this.logger.log(`Starting analysis for meal ${mealId} (job ${job.id})`);

    try {
      await this.prisma.meal.update({ where: { id: mealId }, data: { status: 'processing' } });
      const asset = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
      if (!asset) throw new Error(`Asset ${assetId} not found`);

      await this.foodAnalyzer.analyze(mealId, assetId);

      const duration = Date.now() - startTime;
      this.logger.log(`Completed analysis for meal ${mealId} in ${duration}ms`);
      return { status: 'ready', duration };
    } catch (error: any) {
      this.logger.error(`Analysis failed for meal ${mealId}:`, error);
      await this.prisma.meal.update({
        where: { id: mealId },
        data: { status: 'failed', whyJson: [{ error: error.message, timestamp: new Date().toISOString() }] as any },
      });
      throw error;
    }
  }

  @OnQueueActive()
  onActive(job: { data: AnalyzeJobData; id: string }) {
    this.logger.log(`Processing job ${job.id}: analyzing meal ${job.data.mealId}`);
  }

  @OnQueueCompleted()
  onCompleted(job: { data: AnalyzeJobData; id: string }, result: any) {
    this.logger.log(`Job ${job.id} completed: meal ${job.data.mealId} analyzed`);
  }

  @OnQueueFailed()
  onFailed(job: { data: AnalyzeJobData; id: string }, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`, (error as any).stack);
  }
}


