import { describe, expect, it } from 'vitest';
import { TimeRingBuffer } from '../shared/ringBuffer';

describe('TimeRingBuffer', () => {
  it('keeps only chunks inside the retention window', () => {
    const buffer = new TimeRingBuffer<{ startedAt: number; endedAt: number; value: string }>(15_000);

    buffer.push({ startedAt: 0, endedAt: 1_000, value: 'old' });
    buffer.push({ startedAt: 10_000, endedAt: 11_000, value: 'middle' });
    buffer.push({ startedAt: 16_000, endedAt: 17_000, value: 'new' });

    expect(buffer.snapshot().map((item) => item.value)).toEqual(['middle', 'new']);
  });

  it('returns chunks that overlap a requested live-photo window', () => {
    const buffer = new TimeRingBuffer<{ startedAt: number; endedAt: number; value: string }>(15_000);
    buffer.push({ startedAt: 2_000, endedAt: 3_000, value: 'before' });
    buffer.push({ startedAt: 5_000, endedAt: 6_000, value: 'hit' });
    buffer.push({ startedAt: 11_000, endedAt: 12_000, value: 'after' });

    expect(buffer.getRange(4_000, 10_000).map((item) => item.value)).toEqual(['hit']);
  });
});
