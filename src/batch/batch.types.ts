export type BatchCount = 1 | 2 | 3;

export const BATCH_COUNTS: BatchCount[] = [1, 2, 3];

export function isBatchCount(value: number): value is BatchCount {
  return value === 1 || value === 2 || value === 3;
}
