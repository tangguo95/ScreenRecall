export interface RawImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface FrameSignal {
  capturedAt: number;
  width: number;
  height: number;
  averageLuma: number;
  edgeDensity: number;
  textDensity: number;
  changeScore: number;
  stabilityScore: number;
  detailScore: number;
  hash: string;
}

export interface KeyFrameEvaluation {
  shouldTrigger: boolean;
  score: number;
  reasons: string[];
}

export function analyzeImageData(
  image: RawImageDataLike,
  capturedAt: number,
  previous?: FrameSignal
): FrameSignal {
  const gray = toGrayscale(image);
  const edgeDensity = computeEdgeDensity(gray, image.width, image.height);
  const textDensity = computeTextLikeDensity(gray, image.width, image.height);
  const averageLuma = gray.reduce((sum, value) => sum + value, 0) / gray.length / 255;
  const hash = averageHash(gray, image.width, image.height);
  const changeScore = previous ? normalizedHashDistance(hash, previous.hash) : 0;
  const stabilityScore = previous ? 1 - Math.min(1, changeScore * 1.5) : 0.5;
  const detailScore = clamp(edgeDensity * 0.55 + textDensity * 0.45, 0, 1);

  return {
    capturedAt,
    width: image.width,
    height: image.height,
    averageLuma,
    edgeDensity,
    textDensity,
    changeScore,
    stabilityScore,
    detailScore,
    hash
  };
}

export function evaluateKeyFrame(signal: FrameSignal, previous?: FrameSignal): KeyFrameEvaluation {
  const informationScore = signal.textDensity * 0.52 + signal.edgeDensity * 0.28 + signal.detailScore * 0.2;
  const transitionBoost = previous && signal.changeScore > 0.18 ? 0.12 : 0;
  const stableInformationBoost = signal.stabilityScore > 0.62 && signal.textDensity > 0.11 ? 0.1 : 0;
  const score = clamp(informationScore + transitionBoost + stableInformationBoost, 0, 1);
  const reasons: string[] = [];

  if (signal.textDensity > 0.1) {
    reasons.push('dense_text_regions');
  }

  if (signal.edgeDensity > 0.14) {
    reasons.push('structured_edges');
  }

  if (previous && signal.changeScore > 0.18) {
    reasons.push('new_information_layout');
  }

  if (signal.stabilityScore > 0.62 && signal.textDensity > 0.09) {
    reasons.push('stable_information_panel');
  }

  return {
    shouldTrigger: (score >= 0.34 || signal.textDensity > 0.1) && reasons.length > 0,
    score,
    reasons
  };
}

export function describeLocalTextSignal(signal: FrameSignal): string {
  const text = Math.round(signal.textDensity * 100);
  const edges = Math.round(signal.edgeDensity * 100);
  return `Local text-density signal: ${text}% text-like regions, ${edges}% structured edges.`;
}

function toGrayscale(image: RawImageDataLike): Uint8Array {
  const result = new Uint8Array(image.width * image.height);

  for (let source = 0, target = 0; source < image.data.length; source += 4, target += 1) {
    const red = image.data[source] ?? 0;
    const green = image.data[source + 1] ?? 0;
    const blue = image.data[source + 2] ?? 0;
    result[target] = Math.round(red * 0.299 + green * 0.587 + blue * 0.114);
  }

  return result;
}

function computeEdgeDensity(gray: Uint8Array, width: number, height: number): number {
  let edges = 0;
  let total = 0;

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const center = gray[y * width + x];
      const right = gray[y * width + x + 1];
      const down = gray[(y + 1) * width + x];
      const gradient = Math.abs(center - right) + Math.abs(center - down);
      if (gradient > 58) {
        edges += 1;
      }
      total += 1;
    }
  }

  return total === 0 ? 0 : edges / total;
}

function computeTextLikeDensity(gray: Uint8Array, width: number, height: number): number {
  const columns = 16;
  const rows = 9;
  let textLikeCells = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const xStart = Math.floor((column / columns) * width);
      const xEnd = Math.floor(((column + 1) / columns) * width);
      const yStart = Math.floor((row / rows) * height);
      const yEnd = Math.floor(((row + 1) / rows) * height);
      const score = cellContrastScore(gray, width, xStart, xEnd, yStart, yEnd);

      if (score > 0.09 && score < 0.62) {
        textLikeCells += 1;
      }
    }
  }

  return textLikeCells / (columns * rows);
}

function cellContrastScore(
  gray: Uint8Array,
  width: number,
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number
): number {
  let contrastPixels = 0;
  let total = 0;

  for (let y = yStart + 1; y < yEnd - 1; y += 1) {
    for (let x = xStart + 1; x < xEnd - 1; x += 1) {
      const center = gray[y * width + x];
      const left = gray[y * width + x - 1];
      const right = gray[y * width + x + 1];
      const vertical = gray[(y - 1) * width + x];
      if (Math.abs(center - left) > 34 || Math.abs(center - right) > 34 || Math.abs(center - vertical) > 34) {
        contrastPixels += 1;
      }
      total += 1;
    }
  }

  return total === 0 ? 0 : contrastPixels / total;
}

function averageHash(gray: Uint8Array, width: number, height: number): string {
  const size = 8;
  const samples: number[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor((x + 0.5) * (width / size)));
      const sourceY = Math.min(height - 1, Math.floor((y + 0.5) * (height / size)));
      samples.push(gray[sourceY * width + sourceX]);
    }
  }

  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  return samples.map((value) => (value >= average ? '1' : '0')).join('');
}

function normalizedHashDistance(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  if (length === 0) {
    return 1;
  }

  let distance = Math.abs(left.length - right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      distance += 1;
    }
  }

  return distance / Math.max(left.length, right.length);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
