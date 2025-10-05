import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FoodAnalyzerService } from './food-analyzer.service';
import { PortionEstimator } from './portion/portion-estimator';
import { NutrientResolver } from './rag/nutrient-resolver';
import { NutritionComposer } from './compose/nutrition-composer';
import { OpenAILabeler } from './analyzers/openai.labeler';
import { AnthropicLabeler } from './analyzers/anthropic.labeler';
import { LABELER_PROVIDER } from './analyzers/labeler.provider';
import { PrismaModule } from '../prisma.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [ConfigModule, PrismaModule, MediaModule],
  providers: [
    FoodAnalyzerService,
    PortionEstimator,
    NutrientResolver,
    NutritionComposer,
    OpenAILabeler,
    AnthropicLabeler,
    {
      provide: LABELER_PROVIDER,
      useFactory: (
        cfg: ConfigService,
        openai: OpenAILabeler,
        anthropic: AnthropicLabeler,
      ) => {
        const provider = (cfg.get<string>('AI_LABELER_PROVIDER') || 'openai').toLowerCase();
        
        switch (provider) {
          case 'anthropic':
            return anthropic;
          case 'openai':
          default:
            return openai;
        }
      },
      inject: [ConfigService, OpenAILabeler, AnthropicLabeler],
    },
  ],
  exports: [FoodAnalyzerService, LABELER_PROVIDER],
})
export class FoodAnalyzerModule {}
