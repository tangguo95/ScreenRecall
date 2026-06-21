import { describe, expect, it } from 'vitest';
import { SimilarityDedupe, hammingDistance } from '../shared/dedupe';

describe('SimilarityDedupe', () => {
  it('blocks similar hashes inside the dedupe window', () => {
    const dedupe = new SimilarityDedupe(30_000, 2);
    dedupe.record('11110000', 1_000);

    expect(dedupe.canAccept('11110001', 2_000)).toBe(false);
    expect(dedupe.canAccept('00001111', 2_000)).toBe(true);
  });

  it('allows similar hashes after the dedupe window', () => {
    const dedupe = new SimilarityDedupe(30_000, 2);
    dedupe.record('11110000', 1_000);

    expect(dedupe.canAccept('11110001', 40_000)).toBe(true);
  });
});

describe('hammingDistance', () => {
  it('counts different bits and length differences', () => {
    expect(hammingDistance('1010', '1001')).toBe(2);
    expect(hammingDistance('1010', '10')).toBe(2);
  });
});
