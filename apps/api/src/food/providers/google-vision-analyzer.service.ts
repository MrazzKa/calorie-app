import { Injectable, NotImplementedException } from '@nestjs/common';
import type { IAnalyzerProvider, AnalyzeResultItem } from './analyzer.interface';

@Injectable()
export class GoogleVisionAnalyzer implements IAnalyzerProvider {
  async analyze(): Promise<AnalyzeResultItem[]> {
    // Заглушка. В бою: распознать labels → нормализовать → маппить на FoodCanonical.
    throw new NotImplementedException('google_vision_not_configured');
  }
}
