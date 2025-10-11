import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma.module';
import { MediaModule } from '../media/media.module';
import { LabelerModule } from '../food/analyzers/labeler.module';
// TODO: ensure @nestjs/bull and bull are installed or migrate to @nestjs/bullmq if preferred
import { BullModule } from '@nestjs/bull';
import { FoodAnalyzerService } from '../food/food-analyzer.service';
import { NutrientResolver } from '../food/rag/nutrient-resolver';
import { PortionEstimator } from '../food/portion/portion-estimator';
import { FoodAnalyzeProcessor } from './worker.processor';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    MediaModule,
    LabelerModule.forRoot(),
    BullModule.registerQueue({ name: process.env.FOOD_QUEUE || 'food:analyze' } as any),
  ],
  providers: [
    FoodAnalyzerService,
    NutrientResolver,
    PortionEstimator,
    FoodAnalyzeProcessor,
  ],
})
export class WorkerModule {}


