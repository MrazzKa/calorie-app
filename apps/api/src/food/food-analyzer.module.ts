import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FoodAnalyzerService } from './food-analyzer.service';
import { PortionEstimator } from './portion/portion-estimator';
import { NutrientResolver } from './rag/nutrient-resolver';
import { NutritionComposer } from './compose/nutrition-composer';
import { LABELER_PROVIDER } from './analyzers/labeler.provider';
import { LabelerModule } from './analyzers/labeler.module';
import { PrismaModule } from '../prisma.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [ConfigModule, PrismaModule, MediaModule, LabelerModule.forRoot()],
  providers: [
    FoodAnalyzerService,
    PortionEstimator,
    NutrientResolver,
    NutritionComposer,
  ],
  exports: [FoodAnalyzerService],
})
export class FoodAnalyzerModule {}
