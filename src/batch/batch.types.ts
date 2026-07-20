export type BatchCount = 2 | 3;

export const BATCH_COUNTS: BatchCount[] = [2, 3];

export function isBatchCount(value: number): value is BatchCount {
  return value === 2 || value === 3;
}
