import { describe, expect, it } from 'vitest';
import { analyzeImageData, evaluateKeyFrame } from '../shared/captureAnalysis';

describe('capture analysis', () => {
  it('does not trigger on a flat image', () => {
    const image = createImage(320, 180, (x, y) => (x + y > -1 ? 245 : 245));
    const signal = analyzeImageData(image, 1_000);
    const evaluation = evaluateKeyFrame(signal);

    expect(signal.edgeDensity).toBeLessThan(0.02);
    expect(evaluation.shouldTrigger).toBe(false);
  });

  it('triggers on dense structured text-like regions', () => {
    const image = createImage(320, 180, (x, y) => {
      const rowBand = y % 18;
      const columnBand = x % 64;
      return rowBand > 6 && rowBand < 10 && columnBand > 4 && columnBand < 52 ? 24 : 236;
    });
    const signal = analyzeImageData(image, 1_000);
    const evaluation = evaluateKeyFrame(signal);

    expect(signal.textDensity).toBeGreaterThan(0.1);
    expect(evaluation.shouldTrigger).toBe(true);
  });
});

function createImage(width: number, height: number, lumaAt: (x: number, y: number) => number) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const luma = lumaAt(x, y);
      data[index] = luma;
      data[index + 1] = luma;
      data[index + 2] = luma;
      data[index + 3] = 255;
    }
  }

  return { width, height, data };
}
