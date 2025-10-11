import { Injectable, Logger } from '@nestjs/common';
import { InferenceClient } from './inference.client';

@Injectable()
export class InferenceOrchestratorService {
  private readonly logger = new Logger(InferenceOrchestratorService.name);
  constructor(private readonly client: InferenceClient) {}

  async analyze(buffer: Buffer, mime?: string): Promise<{ items: Array<{ label: string; gramsMean?: number; confidence?: number }>}> {
    try {
      const res = await this.client.analyzeImage(buffer, mime);
      const items = Array.isArray(res?.items) ? res.items : [];
      return { items };
    } catch (error) {
      this.logger.warn(`Worker analyze failed, falling back to empty: ${String((error as Error)?.message || error)}`);
      return { items: [] };
    }
  }
}


