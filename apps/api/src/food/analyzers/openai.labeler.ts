import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { LabelerProvider, VisionLabel } from './labeler.provider';

@Injectable()
export class OpenAILabeler implements LabelerProvider {
  private readonly logger = new Logger(OpenAILabeler.name);
  private openai?: OpenAI;
  private readonly apiKey?: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') || undefined;
    // defer client construction until first use
  }

  async extractLabels(image: Buffer): Promise<VisionLabel[]> {
    const model = this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o';
    
    try {
      this.logger.debug('Extracting labels using OpenAI');
      
      if (!this.apiKey) {
        throw new Error('OPENAI_API_KEY missing and OpenAI provider selected');
      }
      if (!this.openai) {
        this.openai = new OpenAI({ apiKey: this.apiKey, timeout: 20000 });
      }
      const base64Image = image.toString('base64');
      
      const response = await this.openai.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `Identify distinct edible food items in this image. Return STRICT JSON with schema: { "items":[{ "name": "...", "confidence": 0..1, "region": {"x":0..1,"y":0..1,"w":0..1,"h":0..1} }]}

Rules:
- Only identify edible food items
- Use specific food names (e.g., "spaghetti", "broccoli", "grilled chicken")
- Keep confidence scores realistic (0.1-1.0)
- Include bounding box regions if visible
- Return 2-5 items maximum
- Use lowercase English names`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Identify food items for nutrition mapping; keep list short and specific (2–5).',
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
        max_tokens: 1000,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response content from OpenAI');
      }

      const parsed = JSON.parse(content);
      const items = parsed.items || [];

      // Normalize and validate labels
      const labels: VisionLabel[] = items
        .map((item: any) => ({
          name: (item.name || '').toLowerCase().trim(),
          confidence: Math.max(0, Math.min(1, item.confidence || 0)),
          region: item.region ? {
            x: Math.max(0, Math.min(1, item.region.x || 0)),
            y: Math.max(0, Math.min(1, item.region.y || 0)),
            w: Math.max(0, Math.min(1, item.region.w || 0)),
            h: Math.max(0, Math.min(1, item.region.h || 0)),
          } : undefined,
        }))
        .filter((label: VisionLabel) => label.name.length > 0)
        .sort((a: VisionLabel, b: VisionLabel) => b.confidence - a.confidence);

      // Deduplicate by name (keep highest confidence)
      const uniqueLabels: VisionLabel[] = [];
      const seen = new Set<string>();
      
      for (const label of labels) {
        if (!seen.has(label.name)) {
          seen.add(label.name);
          uniqueLabels.push(label);
        }
      }

      this.logger.debug(`Extracted ${uniqueLabels.length} labels: ${uniqueLabels.map(l => l.name).join(', ')}`);
      return uniqueLabels;
    } catch (error) {
      this.logger.error('Failed to extract labels with OpenAI:', error);
      throw new Error(`OpenAI label extraction failed: ${error.message}`);
    }
  }
}
