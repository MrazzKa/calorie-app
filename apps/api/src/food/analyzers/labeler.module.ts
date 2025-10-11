import { DynamicModule, Module, Provider } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LABELER_PROVIDER } from './labeler.provider';
import { OpenAILabeler } from './openai.labeler';
import { AnthropicLabeler } from './anthropic.labeler';
import { DemoLabeler } from './labeler.demo';

@Module({ imports: [ConfigModule] })
export class LabelerModule {
  static forRoot(): DynamicModule {
    const labelerFactory: Provider = {
      provide: LABELER_PROVIDER,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const provider = (cfg.get<string>('AI_LABELER_PROVIDER') || 'openai').toLowerCase();
        switch (provider) {
          case 'anthropic':
            return new AnthropicLabeler(cfg);
          case 'openai':
            return new OpenAILabeler(cfg);
          case 'demo':
          default:
            return new DemoLabeler();
        }
      },
    };

    return {
      module: LabelerModule,
      imports: [ConfigModule],
      providers: [labelerFactory],
      exports: [LABELER_PROVIDER],
    };
  }
}


