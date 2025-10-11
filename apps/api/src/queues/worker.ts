import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
// TODO: ensure @nestjs/bull is installed for decorators
import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { PrismaService } from '../prisma.service';
import { MediaService } from '../media/media.service';
import { FoodAnalyzerService } from '../food/food-analyzer.service';
import { ConfigService } from '@nestjs/config';
import { WorkerModule } from './worker.module';

interface AnalyzeJobData {
  mealId: string;
  assetId: string;
}

@Processor('food:analyze')
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
      // Update meal status to processing
      await this.prisma.meal.update({
        where: { id: mealId },
        data: { status: 'processing' },
      });

      // Get the asset
      const asset = await this.prisma.mediaAsset.findUnique({
        where: { id: assetId },
      });

      if (!asset) {
        throw new Error(`Asset ${assetId} not found`);
      }

      // Run actual AI analysis pipeline
      await this.foodAnalyzer.analyze(mealId, assetId);

      const duration = Date.now() - startTime;
      this.logger.log(`Completed analysis for meal ${mealId} in ${duration}ms`);
      
      return { status: 'ready', duration };
    } catch (error) {
      this.logger.error(`Analysis failed for meal ${mealId}:`, error);
      
      await this.prisma.meal.update({
        where: { id: mealId },
        data: { 
          status: 'failed',
          whyJson: [{ error: error.message, timestamp: new Date().toISOString() }],
        },
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
    this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
  }
}

// Standalone worker application
async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  const cfg = app.get(ConfigService);
  const queueName = cfg.get<string>('FOOD_QUEUE') || process.env.FOOD_QUEUE || 'food:analyze';
  const logger = new Logger('WorkerBootstrap');
  logger.log(`Worker started (queue=${queueName})`);
  
  // Keep the application running
  process.on('SIGINT', async () => {
    logger.log('Shutting down worker...');
    await app.close();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    logger.log('Shutting down worker...');
    await app.close();
    process.exit(0);
  });
}

// Only run if this file is executed directly
if (require.main === module) {
  bootstrapWorker().catch((error) => {
    console.error('Failed to start worker:', error);
    process.exit(1);
  });
}
