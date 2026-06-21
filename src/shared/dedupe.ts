export function hammingDistance(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let distance = Math.abs(left.length - right.length);

  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      distance += 1;
    }
  }

  return distance;
}

export class SimilarityDedupe {
  private readonly windowMs: number;
  private readonly maxDistance: number;
  private records: Array<{ hash: string; timestamp: number }> = [];

  constructor(windowMs: number, maxDistance: number) {
    this.windowMs = windowMs;
    this.maxDistance = maxDistance;
  }

  canAccept(hash: string, timestamp: number): boolean {
    this.records = this.records.filter((record) => timestamp - record.timestamp <= this.windowMs);
    return !this.records.some((record) => hammingDistance(record.hash, hash) <= this.maxDistance);
  }

  record(hash: string, timestamp: number): void {
    this.records.push({ hash, timestamp });
  }

  reset(): void {
    this.records = [];
  }
}
