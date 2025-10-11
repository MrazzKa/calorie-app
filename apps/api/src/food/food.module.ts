import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
// TODO: Requires @nestjs/bullmq and bullmq packages installed
import { BullModule } from '@nestjs/bull';

import { FoodController } from './food.controller';
import { MealsController } from './meals.controller';
import { FoodService } from './food.service';

import { DemoAnalyzer } from './providers/demo-analyzer.service';
import { GoogleVisionAnalyzer } from './providers/google-vision-analyzer.service';
import { OpenAiAnalyzer } from './providers/openai-analyzer.service';
import { FoodQueueProcessor } from './providers/food.queue.processor';
import { UsdaService } from './usda/usda.service';
import { FoodAnalyzerModule } from './food-analyzer.module';
import { FoodAnalyzeProcessor } from '../queues/worker';

import { PrismaModule } from '../prisma.module';
import { JwtModule } from '../jwt/jwt.module';
import { MediaModule } from '../media/media.module';

import { ANALYZER, FOOD_QUEUE } from './tokens';
import { InferenceClient } from './inference/inference.client';
import { InferenceOrchestratorService } from './inference/inference-orchestrator.service';
import { RateLimitService } from '../common/rate-limit.service';

@Module({
  imports: [
    ConfigModule,
    MulterModule.register({ limits: { fileSize: 10 * 1024 * 1024 } }), // note: hard cap to align with worker
    PrismaModule,
    JwtModule,
    MediaModule,
    FoodAnalyzerModule,
    BullModule.registerQueue({
      name: FOOD_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 1000,
        removeOnFail: 500,
      } as any,
    }),
  ],
  controllers: [FoodController, MealsController],
  providers: [
    FoodService,
    RateLimitService,
    DemoAnalyzer,
    GoogleVisionAnalyzer,
    OpenAiAnalyzer,
    FoodQueueProcessor,
    FoodAnalyzeProcessor,
    UsdaService,
    InferenceClient,
    InferenceOrchestratorService,
    {
      provide: ANALYZER,
      useFactory: (
        cfg: ConfigService,
        demo: DemoAnalyzer,
        gcv: GoogleVisionAnalyzer,
        oai: OpenAiAnalyzer,
        orchestrator: InferenceOrchestratorService,
      ) => {
        const provider = cfg.get<string>('ANALYZER_PROVIDER', 'demo');
        if (provider === 'gcv') return gcv;
        if (provider === 'openai') return oai;
        if (provider === 'local') {
          return {
            async analyze({ buffer, mime }: { buffer: Buffer; mime?: string }) {
              const r = await orchestrator.analyze(buffer, mime);
              return r.items.map((it: any) => ({
                label: String(it.label || 'unknown'),
                gramsMean: typeof it.gramsMean === 'number' ? it.gramsMean : undefined,
                source: 'worker',
              }));
            },
          } as any;
        }
        return demo;
      },
      inject: [ConfigService, DemoAnalyzer, GoogleVisionAnalyzer, OpenAiAnalyzer, InferenceOrchestratorService],
    },
  ],
  exports: [FoodService],
})
export class FoodModule {}
