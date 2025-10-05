import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
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
import { RedisModule } from '../redis/redis.module';
import { JwtModule } from '../jwt/jwt.module';

import { ANALYZER, FOOD_QUEUE } from './tokens';

@Module({
  imports: [
    ConfigModule,
    MulterModule.register({ limits: { fileSize: 5 * 1024 * 1024 } }),
    PrismaModule,
    RedisModule,
    JwtModule,
    FoodAnalyzerModule,
    BullModule.registerQueue({ name: FOOD_QUEUE }),
  ],
  controllers: [FoodController, MealsController],
  providers: [
    FoodService,
    DemoAnalyzer,
    GoogleVisionAnalyzer,
    OpenAiAnalyzer,
    FoodQueueProcessor,
    FoodAnalyzeProcessor,
    UsdaService,
    {
      provide: ANALYZER,
      useFactory: (
        cfg: ConfigService,
        demo: DemoAnalyzer,
        gcv: GoogleVisionAnalyzer,
        oai: OpenAiAnalyzer,
      ) => {
        const provider = cfg.get<string>('ANALYZER_PROVIDER', 'demo');
        if (provider === 'gcv') return gcv;
        if (provider === 'openai') return oai;
        return demo;
      },
      inject: [ConfigService, DemoAnalyzer, GoogleVisionAnalyzer, OpenAiAnalyzer],
    },
  ],
  exports: [FoodService],
})
export class FoodModule {}
