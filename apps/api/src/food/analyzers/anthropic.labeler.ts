import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { LabelerProvider, VisionLabel } from './labeler.provider';

@Injectable()
export class AnthropicLabeler implements LabelerProvider {
  private readonly logger = new Logger(AnthropicLabeler.name);
  private anthropic?: Anthropic;
  private readonly apiKey?: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ANTHROPIC_API_KEY') || undefined;
    // defer client construction until first use
  }

  async extractLabels(image: Buffer): Promise<VisionLabel[]> {
    const model = this.configService.get<string>('ANTHROPIC_MODEL') || (process.env.ANTHROPIC_MODEL ?? 'claude-3-5-sonnet-latest');
    try {
      if (!this.apiKey) {
        throw new Error('ANTHROPIC_API_KEY missing and Anthropic provider selected');
      }
      if (!this.anthropic) {
        this.anthropic = new Anthropic({ apiKey: this.apiKey, timeout: 20000 });
      }
      this.logger.debug('Extracting labels using Anthropic');
      const base64Image = image.toString('base64');

      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 512,
        temperature: 0,
        system: 'You are a nutrition vision assistant. Respond ONLY with compact JSON matching {"items":[{"name":"string","confidence":0..1,"region":{"x":0..1,"y":0..1,"w":0..1,"h":0..1}}]} with lowercase English names. No prose.',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Identify 2-5 edible food items in the photo. Use lowercase English names. Return STRICT JSON only.' },
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
            ],
          },
        ],
      });

      const text = (response.content?.[0] as any)?.text ?? '{}';
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed?.items) ? parsed.items : [];

      const normalized: VisionLabel[] = items
        .map((raw: any) => {
          const name = String(raw?.name ?? '').toLowerCase().trim();
          const confNum = Number(raw?.confidence);
          const confidence = Number.isFinite(confNum) ? Math.max(0, Math.min(1, confNum)) : 0;
          const region = raw?.region ? {
            x: Math.max(0, Math.min(1, Number(raw.region.x) || 0)),
            y: Math.max(0, Math.min(1, Number(raw.region.y) || 0)),
            w: Math.max(0, Math.min(1, Number(raw.region.w) || 0)),
            h: Math.max(0, Math.min(1, Number(raw.region.h) || 0)),
          } : undefined;
          return { name, confidence, region } as VisionLabel;
        })
        .filter((x) => x.name.length > 0)
        .sort((a, b) => b.confidence - a.confidence);

      const dedup: VisionLabel[] = [];
      const seen = new Set<string>();
      for (const it of normalized) {
        if (!seen.has(it.name)) {
          seen.add(it.name);
          dedup.push(it);
        }
      }

      this.logger.debug(`Extracted ${dedup.length} labels: ${dedup.map(l => l.name).join(', ')}`);
      return dedup;
    } catch (error: any) {
      this.logger.error('Failed to extract labels with Anthropic:', error);
      throw new Error(`Anthropic label extraction failed: ${error?.message ?? 'unknown'}`);
    }
  }
}
