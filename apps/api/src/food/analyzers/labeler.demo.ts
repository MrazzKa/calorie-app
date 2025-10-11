import { Injectable } from '@nestjs/common';
import type { LabelerProvider, VisionLabel } from './labeler.provider';

@Injectable()
export class DemoLabeler implements LabelerProvider {
  async extractLabels(_image: Buffer): Promise<VisionLabel[]> {
    return [{ name: 'food', confidence: 0.5 }];
  }
}


