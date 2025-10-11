export interface VisionLabel {
  name: string;
  confidence: number;
  region?: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

export interface LabelerProvider {
  extractLabels(image: Buffer): Promise<VisionLabel[]>;
}

export const LABELER_PROVIDER = Symbol('LABELER_PROVIDER');
