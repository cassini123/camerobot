/** Browser-side flyvision matcher. Same contract as the Python PC brain. */

export const HIST_H_BINS = 16;
export const HIST_S_BINS = 4;
export const HIST_V_BINS = 4;
export const HIST_SIZE = HIST_H_BINS * HIST_S_BINS * HIST_V_BINS;
export const DEFAULT_MATCH_THRESHOLD = 0.85;
export const DEFAULT_COMPOSITION_DELTA = 0.05;
export const DEFAULT_STABLE_FRAMES = 8;
export const CONTINUE_FOLLOW = "CONTINUE_FOLLOW";
export const CAPTURE_GO = "CAPTURE_GO";

export type RgbPixels = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};

export type FrameFeatures = {
  histogram: number[];
  subjectCenter: [number, number];
  subjectArea: number;
  embedding?: number[];
};

export const CLIP_WEIGHT = 0.55;
export const HIST_COLOR_WEIGHT = 0.15;
export const COMP_WEIGHT = 0.3;

export type BBox = { x: number; y: number; w: number; h: number };

export type CompositionResult = {
  dx: number;
  dy: number;
  compositionOk: boolean;
  target: [number, number];
  current: [number, number] | null;
};

export type MatchScore = {
  similarity: number;
  histogramSimilarity: number;
  compositionSimilarity: number;
  clipSimilarity: number | null;
  labelSimilarity: number | null;
  sceneMatch: boolean;
};

export type ScoreMatchOptions = {
  clipCosine?: number;
  labelSimilarity?: number;
};

export function centerCropResize(image: RgbPixels, size: number): RgbPixels {
  const side = Math.min(image.width, image.height);
  const x0 = Math.floor((image.width - side) / 2);
  const y0 = Math.floor((image.height - side) / 2);
  const out = new Uint8ClampedArray(size * size * 3);
  for (let y = 0; y < size; y += 1) {
    const srcY = Math.min(side - 1, Math.floor((y * side) / size) + y0);
    for (let x = 0; x < size; x += 1) {
      const srcX = Math.min(side - 1, Math.floor((x * side) / size) + x0);
      const src = (srcY * image.width + srcX) * 3;
      const dest = (y * size + x) * 3;
      out[dest] = image.pixels[src];
      out[dest + 1] = image.pixels[src + 1];
      out[dest + 2] = image.pixels[src + 2];
    }
  }
  return { width: size, height: size, pixels: out };
}

export function hsvHistogram(image: RgbPixels, step = 2): number[] {
  const bins = new Array<number>(HIST_SIZE).fill(0);
  let count = 0;
  const stride = Math.max(1, step);
  for (let y = 0; y < image.height; y += stride) {
    for (let x = 0; x < image.width; x += stride) {
      const i = (y * image.width + x) * 3;
      const [h, s, v] = rgbToHsvBins(image.pixels[i], image.pixels[i + 1], image.pixels[i + 2]);
      bins[(h * HIST_S_BINS + s) * HIST_V_BINS + v] += 1;
      count += 1;
    }
  }
  if (count) {
    for (let i = 0; i < bins.length; i += 1) {
      bins[i] /= count;
    }
  }
  return bins;
}

export function histogramCorrelation(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }
  const n = left.length;
  const meanL = left.reduce((sum, value) => sum + value, 0) / n;
  const meanR = right.reduce((sum, value) => sum + value, 0) / n;
  let num = 0;
  let denL = 0;
  let denR = 0;
  for (let i = 0; i < n; i += 1) {
    const da = left[i] - meanL;
    const db = right[i] - meanR;
    num += da * db;
    denL += da * da;
    denR += db * db;
  }
  const denom = Math.sqrt(denL * denR);
  if (denom === 0) {
    return num === 0 ? 1 : 0;
  }
  const corr = Math.max(-1, Math.min(1, num / denom));
  return (corr + 1) / 2;
}

export function compositionSimilarity(
  current: [number, number, number],
  reference: [number, number, number],
): number {
  const dist = Math.sqrt(
    current.reduce((sum, value, i) => sum + (value - reference[i]) ** 2, 0),
  );
  return Math.max(0, 1 - dist / 1.2);
}

export function extractFeatures(image: RgbPixels, box: BBox | null): FrameFeatures {
  const ai = centerCropResize(image, 256);
  return {
    histogram: hsvHistogram(ai),
    subjectCenter: box ? [box.x + box.w / 2, box.y + box.h / 2] : [0.5, 0.5],
    subjectArea: box ? box.w * box.h : 0,
  };
}

export function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  const denom = Math.sqrt(leftNorm * rightNorm);
  if (denom === 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, (dot / denom + 1) / 2));
}

export function scoreMatch(
  current: FrameFeatures,
  reference: FrameFeatures,
  threshold = DEFAULT_MATCH_THRESHOLD,
  options: ScoreMatchOptions = {},
): MatchScore {
  const histogramSimilarity = histogramCorrelation(current.histogram, reference.histogram);
  const compositionSim = compositionSimilarity(
    [...current.subjectCenter, current.subjectArea],
    [...reference.subjectCenter, reference.subjectArea],
  );
  const clipSimilarity =
    options.clipCosine ??
    (current.embedding && reference.embedding
      ? cosineSimilarity(current.embedding, reference.embedding)
      : null);
  const labelSimilarity = options.labelSimilarity ?? null;
  let similarity: number;
  if (clipSimilarity === null) {
    similarity = 0.6 * histogramSimilarity + 0.4 * compositionSim;
  } else {
    const label = labelSimilarity ?? 0;
    const labelWeight = labelSimilarity === null ? 0 : 0.12;
    const clipWeight = CLIP_WEIGHT - labelWeight * 0.4;
    const histWeight = HIST_COLOR_WEIGHT;
    const compWeight = COMP_WEIGHT - labelWeight * 0.6;
    similarity =
      clipWeight * clipSimilarity +
      histWeight * histogramSimilarity +
      compWeight * compositionSim +
      labelWeight * label;
  }
  return {
    similarity,
    histogramSimilarity,
    compositionSimilarity: compositionSim,
    clipSimilarity,
    labelSimilarity,
    sceneMatch: similarity >= threshold,
  };
}

export function judgeComposition(
  box: BBox | null,
  target: [number, number],
  delta = DEFAULT_COMPOSITION_DELTA,
): CompositionResult {
  if (!box) {
    return { dx: 1, dy: 1, compositionOk: false, target, current: null };
  }
  const current: [number, number] = [box.x + box.w / 2, box.y + box.h / 2];
  const dx = current[0] - target[0];
  const dy = current[1] - target[1];
  return {
    dx,
    dy,
    compositionOk: Math.abs(dx) <= delta && Math.abs(dy) <= delta,
    target,
    current,
  };
}

export function nextDecision(
  sceneMatch: boolean,
  compositionOk: boolean,
  stableCount: number,
  needed: number,
): { decision: string; nextCount: number; stable: boolean } {
  const ready = sceneMatch && compositionOk;
  const nextCount = ready ? stableCount + 1 : 0;
  const stable = nextCount >= needed;
  if (stable) {
    return { decision: CAPTURE_GO, nextCount: 0, stable: true };
  }
  return { decision: CONTINUE_FOLLOW, nextCount, stable: false };
}

export function rgbaToRgb(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): RgbPixels {
  const pixels = new Uint8ClampedArray(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    pixels[j] = rgba[i];
    pixels[j + 1] = rgba[i + 1];
    pixels[j + 2] = rgba[i + 2];
  }
  return { width, height, pixels };
}

export function solidRgb(
  width: number,
  height: number,
  color: [number, number, number],
): RgbPixels {
  const pixels = new Uint8ClampedArray(width * height * 3);
  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = color[0];
    pixels[i + 1] = color[1];
    pixels[i + 2] = color[2];
  }
  return { width, height, pixels };
}

function rgbToHsvBins(r: number, g: number, b: number): [number, number, number] {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const mx = Math.max(rf, gf, bf);
  const mn = Math.min(rf, gf, bf);
  const diff = mx - mn;
  let hue = 0;
  if (diff !== 0) {
    if (mx === rf) {
      hue = (60 * ((gf - bf) / diff) + 360) % 360;
    } else if (mx === gf) {
      hue = 60 * ((bf - rf) / diff) + 120;
    } else {
      hue = 60 * ((rf - gf) / diff) + 240;
    }
  }
  const sat = mx === 0 ? 0 : diff / mx;
  const hBin = Math.min(HIST_H_BINS - 1, Math.floor((hue / 360) * HIST_H_BINS));
  const sBin = Math.min(HIST_S_BINS - 1, Math.floor(sat * HIST_S_BINS));
  const vBin = Math.min(HIST_V_BINS - 1, Math.floor(mx * HIST_V_BINS));
  return [hBin, sBin, vBin];
}
