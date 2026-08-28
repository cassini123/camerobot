export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function rgbToHex(r: number, g: number, b: number): string {
  const byte = (n: number) =>
    Math.round(clamp01(n) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const n = parseInt(raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const SWATCHES: Array<{ zh: string; en: string; rgb: [number, number, number] }> = [
  { zh: "红", en: "red", rgb: [0.86, 0.16, 0.14] },
  { zh: "橙", en: "orange", rgb: [0.92, 0.48, 0.12] },
  { zh: "黄", en: "yellow", rgb: [0.93, 0.82, 0.18] },
  { zh: "绿", en: "green", rgb: [0.22, 0.62, 0.28] },
  { zh: "青", en: "cyan", rgb: [0.18, 0.72, 0.74] },
  { zh: "蓝", en: "blue", rgb: [0.2, 0.4, 0.86] },
  { zh: "紫", en: "purple", rgb: [0.52, 0.28, 0.72] },
  { zh: "粉", en: "pink", rgb: [0.92, 0.48, 0.62] },
  { zh: "棕", en: "brown", rgb: [0.48, 0.3, 0.16] },
  { zh: "米", en: "beige", rgb: [0.86, 0.78, 0.64] },
  { zh: "金", en: "gold", rgb: [0.83, 0.65, 0.32] },
  { zh: "白", en: "white", rgb: [0.94, 0.94, 0.94] },
  { zh: "灰", en: "gray", rgb: [0.52, 0.52, 0.54] },
  { zh: "黑", en: "black", rgb: [0.08, 0.08, 0.1] },
];

export function nameColor(r: number, g: number, b: number): { zh: string; en: string } {
  let best = SWATCHES[0];
  let bestDist = Infinity;
  for (const swatch of SWATCHES) {
    const dr = r - swatch.rgb[0];
    const dg = g - swatch.rgb[1];
    const db = b - swatch.rgb[2];
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      best = swatch;
    }
  }
  return { zh: best.zh, en: best.en };
}
