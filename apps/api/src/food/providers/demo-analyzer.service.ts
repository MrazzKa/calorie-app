import { Injectable } from '@nestjs/common';
import type { IAnalyzerProvider, AnalyzeResultItem } from './analyzer.interface';

@Injectable()
export class DemoAnalyzer implements IAnalyzerProvider {
  async analyze({ buffer }: { buffer: Buffer }): Promise<AnalyzeResultItem[]> {
    // Детеминируем по длине буфера (чтобы e2e всегда были стабильны)
    const len = buffer?.length ?? 0;
    const pick = len % 2;

    if (pick === 0) {
      return [
        { label: 'banana', gramsMean: 120, kcal: 105, carbs: 27, protein: 1.3, fat: 0.3, source: 'demo' },
        { label: 'yogurt', gramsMean: 150, kcal: 95, carbs: 10, protein: 9, fat: 3, source: 'demo' },
      ];
    }
    return [
      { label: 'apple', gramsMean: 150, kcal: 80, carbs: 21, protein: 0.3, fat: 0.2, source: 'demo' },
      { label: 'peanut butter', gramsMean: 30, kcal: 180, carbs: 6, protein: 8, fat: 16, source: 'demo' },
    ];
  }
}
