export const METHOD_BADGE = {
  barcode: 'barcode',
  ar: 'ar',
  d2: 'd2',
} as const;

export type MethodBadge = typeof METHOD_BADGE[keyof typeof METHOD_BADGE];
