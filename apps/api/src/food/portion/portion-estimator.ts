import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { VisionLabel } from '../analyzers/labeler.provider';

export interface Portion {
  gramsMin?: number;
  gramsMax?: number;
  gramsMean: number;
  method: 'llm' | 'rule' | 'user';
}

@Injectable()
export class PortionEstimator {
  private readonly logger = new Logger(PortionEstimator.name);
  private readonly openai: OpenAI;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for portion estimation');
    }

    this.openai = new OpenAI({
      apiKey,
      timeout: 20000,
    });
  }

  async estimate(image: Buffer, labels: VisionLabel[]): Promise<Record<string, Portion>> {
    const provider = this.configService.get<string>('AI_PORTION_PROVIDER') || 'llm';
    
    if (provider === 'rule') {
      return this.estimateWithRules(labels);
    }

    try {
      return await this.estimateWithLLM(image, labels);
    } catch (error) {
      this.logger.warn(`LLM portion estimation failed, falling back to rules: ${error.message}`);
      return this.estimateWithRules(labels);
    }
  }

  private async estimateWithLLM(image: Buffer, labels: VisionLabel[]): Promise<Record<string, Portion>> {
    const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o';
    const itemNames = labels.map(l => l.name).join(', ');
    
    this.logger.debug(`Estimating portions for: ${itemNames}`);

    const base64Image = image.toString('base64');
    
    const response = await this.openai.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: `Estimate edible mass per item in grams for one meal photo. Assume cooked/common preparation. Use conservative ranges if uncertain. Return JSON only: {"items":[{"name":"spaghetti","grams":{"min":160,"mean":190,"max":220}}]}

Rules:
- Estimate for one person's meal portion
- Use realistic ranges (min/mean/max)
- Consider typical serving sizes
- Be conservative with estimates
- Return integer values`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Given item names: ${itemNames}. Return grams per item (min/mean/max).`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response content from OpenAI');
    }

    const parsed = JSON.parse(content);
    const items = parsed.items || [];

    const portions: Record<string, Portion> = {};
    
    for (const item of items) {
      const name = (item.name || '').toLowerCase().trim();
      const grams = item.grams || {};
      
      const gramsMin = this.clampGrams(grams.min || grams.mean || 150);
      const gramsMean = this.clampGrams(grams.mean || 150);
      const gramsMax = this.clampGrams(grams.max || grams.mean || 150);
      
      portions[name] = {
        gramsMin: Math.round(gramsMin),
        gramsMean: Math.round(gramsMean),
        gramsMax: Math.round(gramsMax),
        method: 'llm',
      };
    }

    // Fill in missing items with rule-based estimates
    for (const label of labels) {
      if (!portions[label.name]) {
        portions[label.name] = this.getRuleBasedPortion(label.name);
      }
    }

    this.logger.debug(`Estimated portions: ${Object.keys(portions).join(', ')}`);
    return portions;
  }

  private estimateWithRules(labels: VisionLabel[]): Record<string, Portion> {
    const portions: Record<string, Portion> = {};
    
    for (const label of labels) {
      portions[label.name] = this.getRuleBasedPortion(label.name);
    }

    this.logger.debug(`Rule-based portions: ${Object.keys(portions).join(', ')}`);
    return portions;
  }

  private getRuleBasedPortion(foodName: string): Portion {
    // Simple rule-based portion estimation
    const name = foodName.toLowerCase();
    
    // Common food portion estimates (in grams)
    if (name.includes('pasta') || name.includes('spaghetti') || name.includes('noodle')) {
      return {
        gramsMean: 150,
        gramsMin: 110,
        gramsMax: 220,
        method: 'rule',
      };
    }
    
    if (name.includes('rice')) {
      return {
        gramsMean: 120,
        gramsMin: 80,
        gramsMax: 180,
        method: 'rule',
      };
    }
    
    if (name.includes('chicken') || name.includes('meat') || name.includes('beef')) {
      return {
        gramsMean: 150,
        gramsMin: 100,
        gramsMax: 250,
        method: 'rule',
      };
    }
    
    if (name.includes('vegetable') || name.includes('broccoli') || name.includes('carrot')) {
      return {
        gramsMean: 80,
        gramsMin: 50,
        gramsMax: 150,
        method: 'rule',
      };
    }
    
    if (name.includes('bread') || name.includes('toast')) {
      return {
        gramsMean: 50,
        gramsMin: 30,
        gramsMax: 80,
        method: 'rule',
      };
    }
    
    // Default fallback
    return {
      gramsMean: 150,
      gramsMin: 110,
      gramsMax: 220,
      method: 'rule',
    };
  }

  private clampGrams(grams: number): number {
    return Math.max(5, Math.min(1000, grams));
  }
}
