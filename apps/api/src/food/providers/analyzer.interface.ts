export type AnalyzeResultItem = {
  label: string;
  gramsMean?: number | null;
  kcal?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
  source?: string | null;
  canonicalId?: string | null;
};

export interface IAnalyzerProvider {
  analyze(params: { buffer: Buffer; mime?: string }): Promise<AnalyzeResultItem[]>;
}
