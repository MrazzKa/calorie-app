import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { LabelerProvider, VisionLabel } from './labeler.provider';

@Injectable()
export class AnthropicLabeler implements LabelerProvider {
  private readonly logger = new Logger(AnthropicLabeler.name);
  private readonly anthropic: Anthropic;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required');
    }

    this.anthropic = new Anthropic({
      apiKey,
      timeout: 20000,
    });
  }

  async extractLabels(image: Buffer): Promise<VisionLabel[]> {
    const model = this.configService.get<string>('ANTHROPIC_MODEL') || 'claude-3-5-sonnet-20241022';
    
    try {
      this.logger.debug('Extracting labels using Anthropic');
      
      const base64Image = image.toString('base64');
      
      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 1000,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Identify distinct edible food items in this image. Return STRICT JSON with schema: { "items":[{ "name": "...", "confidence": 0..1, "region": {"x":0..1,"y":0..1,"w":0..1,"h":0..1} }]}

Rules:
- Only identify edible food items
- Use specific food names (e.g., "spaghetti", "broccoli", "grilled chicken")
- Keep confidence scores realistic (0.1-1.0)
- Include bounding box regions if visible
- Return 2-5 items maximum
- Use lowercase English names

Identify food items for nutrition mapping; keep list short and specific (2–5).`,
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Image,
                },
              },
            ],
          },
        ],
      });

      const content = (response.content?.[0] as any)?.text ?? '{}';
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
      this.logger.error('Failed to extract labels with Anthropic:', error);
      throw new Error(`Anthropic label extraction failed: ${error.message}`);
    }
  }
}
