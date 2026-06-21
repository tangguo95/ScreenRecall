export interface TimedItem {
  startedAt: number;
  endedAt: number;
}

export class TimeRingBuffer<T extends TimedItem> {
  private readonly retentionMs: number;
  private items: T[] = [];

  constructor(retentionMs: number) {
    this.retentionMs = retentionMs;
  }

  push(item: T): void {
    this.items.push(item);
    this.prune(item.endedAt);
  }

  prune(now: number): void {
    const earliest = now - this.retentionMs;
    this.items = this.items.filter((item) => item.endedAt >= earliest);
  }

  getRange(startedAt: number, endedAt: number): T[] {
    return this.items.filter((item) => item.endedAt >= startedAt && item.startedAt <= endedAt);
  }

  clear(): void {
    this.items = [];
  }

  snapshot(): T[] {
    return [...this.items];
  }

  get length(): number {
    return this.items.length;
  }
}
