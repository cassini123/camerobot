/** Crop-aware pinhole ranging from a YOLO box. Rough meters, never the GO gate. */

import type { BBox } from "./flyvision-match";

/** Laptop webcam horizontal field of view. A guess until the user calibrates. */
export const WEBCAM_HFOV_DEG = 70;
/** AI-Thinker OV2640 stock lens, typical HFOV. Calibrate after flash; do not reuse 70°. */
export const ESP32CAM_HFOV_DEG = 66;
/** @deprecated Use WEBCAM_HFOV_DEG or ESP32CAM_HFOV_DEG. Kept so old calls still compile. */
export const DEFAULT_HFOV_DEG = WEBCAM_HFOV_DEG;

export const DEFAULT_ESP_CAM_STREAM_URL = "http://192.168.4.1/stream";

/** |h_live / h_ref − 1| band for visual-servoing occupancy (not meters). */
export const OCCUPANCY_BAND = 0.18;
/** Normalized box-center offset band vs the planned shot. */
export const OFFSET_BAND = 0.12;

export type LiveSource = "idle" | "webcam" | "esp-cam";

export type RangeCue = "近了" | "远了" | "远近合适";
export type HeadingCue = "偏左" | "偏右" | "居中";
export type PitchCue = "偏上" | "偏下" | "高低合适";

export type GeometryGate = {
  heightRatio: number;
  areaRatio: number;
  dx: number;
  dy: number;
  rangeCue: RangeCue;
  headingCue: HeadingCue;
  pitchCue: PitchCue;
  occupancyOk: boolean;
  offsetOk: boolean;
  geometryOk: boolean;
  summary: string;
};

export type BodyCrop = "full" | "knee" | "waist" | "bust" | "head" | "object";

/** Typical standing / object heights used when the whole object is in frame. */
export const REAL_HEIGHT_M: Record<string, number> = {
  person: 1.7,
  bicycle: 1.05,
  motorcycle: 1.2,
  car: 1.5,
  bus: 3.2,
  truck: 3.4,
  train: 3.8,
  airplane: 3.5,
  boat: 1.8,
  bench: 0.8,
  chair: 0.9,
  couch: 0.85,
  bed: 0.55,
  "dining table": 0.75,
  "potted plant": 0.55,
  "stop sign": 2.1,
  "traffic light": 1.0,
  "fire hydrant": 0.75,
  dog: 0.55,
  cat: 0.25,
  horse: 1.6,
  cow: 1.4,
  sheep: 0.9,
  backpack: 0.45,
  suitcase: 0.55,
  tv: 0.55,
  laptop: 0.22,
  bottle: 0.28,
};

/** Typical widths. Used when height is clipped or the crop is a close-up. */
export const REAL_WIDTH_M: Record<string, number> = {
  person: 0.42,
  bicycle: 0.55,
  motorcycle: 0.7,
  car: 1.8,
  bus: 2.5,
  truck: 2.5,
  chair: 0.5,
  couch: 1.8,
  bottle: 0.07,
  tv: 1.1,
  laptop: 0.32,
  dog: 0.35,
  cat: 0.18,
  backpack: 0.32,
  suitcase: 0.4,
};

const PERSON_VISIBLE: Record<
  Exclude<BodyCrop, "object">,
  { heightM: number; widthM: number }
> = {
  full: { heightM: 1.7, widthM: 0.42 },
  knee: { heightM: 1.28, widthM: 0.42 },
  waist: { heightM: 0.98, widthM: 0.4 },
  bust: { heightM: 0.7, widthM: 0.4 },
  head: { heightM: 0.28, widthM: 0.16 },
};

export type SpatialFix = {
  distanceM: number;
  rightM: number;
  upM: number;
  heading: "left" | "center" | "right";
  range: "near" | "mid" | "far";
  crop: BodyCrop;
  confidence: "high" | "medium" | "low";
  usedHeightM: number;
};

export type SpatialDelta = {
  closerM: number;
  rightM: number;
  upM: number;
  summary: string;
  metersHint: string;
};

export type VisibleSize = {
  crop: BodyCrop;
  heightM: number;
  widthM: number;
  heightUsable: boolean;
  widthUsable: boolean;
};

export type SpatialOptions = {
  aspect?: number;
  hfovDeg?: number;
  personHeightM?: number;
  rejectPartial?: boolean;
};

export function estimateSpatial(
  label: string,
  box: BBox,
  aspectOrOptions: number | SpatialOptions = 16 / 9,
  hfovDegArg = DEFAULT_HFOV_DEG,
): SpatialFix | null {
  const options: SpatialOptions =
    typeof aspectOrOptions === "number"
      ? { aspect: aspectOrOptions, hfovDeg: hfovDegArg }
      : aspectOrOptions;
  const aspect = options.aspect ?? 16 / 9;
  const hfovDeg = options.hfovDeg ?? WEBCAM_HFOV_DEG;
  const visible = inferVisibleSize(label, box, options.personHeightM);
  if (!visible || box.h < 0.02 || box.w < 0.01) {
    return null;
  }
  if (options.rejectPartial && !visible.heightUsable) {
    return null;
  }
  const hfov = deg(hfovDeg);
  const vfov = 2 * Math.atan(Math.tan(hfov / 2) / Math.max(0.2, aspect));
  const tanHalfH = Math.tan(hfov / 2);
  const tanHalfV = Math.tan(vfov / 2);
  const fromHeight = visible.heightUsable
    ? visible.heightM / (2 * box.h * tanHalfV)
    : null;
  const fromWidth = visible.widthUsable
    ? visible.widthM / (2 * box.w * tanHalfH)
    : null;
  const distanceM = clamp(fuseDistance(fromHeight, fromWidth, visible.crop), 0.25, 80);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // Image x maps to tan(θ), not θ. Do not wrap the linear term in tan() again.
  const rightM = distanceM * (cx - 0.5) * 2 * tanHalfH;
  const upM = distanceM * (0.5 - cy) * 2 * tanHalfV;
  return {
    distanceM,
    rightM,
    upM,
    heading: rightM > 0.28 ? "right" : rightM < -0.28 ? "left" : "center",
    range: distanceM < 1.6 ? "near" : distanceM < 5 ? "mid" : "far",
    crop: visible.crop,
    confidence: confidenceOf(fromHeight, fromWidth, visible),
    usedHeightM: visible.heightM,
  };
}

export function inferVisibleSize(
  label: string,
  box: BBox,
  personHeightM = REAL_HEIGHT_M.person,
): VisibleSize | null {
  if (label === "person") {
    return inferPersonSize(box, personHeightM);
  }
  const heightM = REAL_HEIGHT_M[label];
  const widthM = REAL_WIDTH_M[label];
  if (!heightM && !widthM) {
    return null;
  }
  const clip = clipFlags(box);
  const fullyClipped = clip.top && clip.bottom;
  return {
    crop: "object",
    heightM: heightM ?? widthM ?? 0,
    widthM: widthM ?? heightM ?? 0,
    heightUsable: Boolean(heightM) && !fullyClipped,
    widthUsable: Boolean(widthM),
  };
}

export function compareSpatial(reference: SpatialFix, live: SpatialFix): SpatialDelta {
  const closerM = reference.distanceM - live.distanceM;
  const rightM = live.rightM - reference.rightM;
  const upM = live.upM - reference.upM;
  const loose = reference.confidence === "low" || live.confidence === "low";
  const cropNote =
    reference.crop !== "object" &&
    live.crop !== "object" &&
    reference.crop !== live.crop
      ? `景别不同（参考${cropLabel(reference.crop)} / 实拍${cropLabel(live.crop)}）`
      : "";
  const summary = [phraseDelta(closerM, rightM, upM, loose), cropNote].filter(Boolean).join(" · ");
  return {
    closerM,
    rightM,
    upM,
    summary,
    metersHint: formatMetersHint(live),
  };
}

/**
 * 3–4 Hz visual-servoing gate. Occupancy (box height / area vs the planned shot)
 * and box-center offset. Absolute meters are not an input.
 */
export function judgeGeometry(
  reference: BBox,
  live: BBox,
  occupancyBand = OCCUPANCY_BAND,
  offsetBand = OFFSET_BAND,
): GeometryGate {
  const refH = Math.max(1e-6, reference.h);
  const refArea = Math.max(1e-6, reference.w * reference.h);
  const heightRatio = live.h / refH;
  const areaRatio = (live.w * live.h) / refArea;
  const liveCx = live.x + live.w / 2;
  const liveCy = live.y + live.h / 2;
  const refCx = reference.x + reference.w / 2;
  const refCy = reference.y + reference.h / 2;
  const dx = liveCx - refCx;
  const dy = liveCy - refCy;
  const occupancyOk = Math.abs(heightRatio - 1) <= occupancyBand;
  const offsetOk = Math.abs(dx) <= offsetBand && Math.abs(dy) <= offsetBand;
  const rangeCue: RangeCue = occupancyOk ? "远近合适" : heightRatio > 1 ? "近了" : "远了";
  const headingCue: HeadingCue = Math.abs(dx) <= offsetBand ? "居中" : dx > 0 ? "偏右" : "偏左";
  const pitchCue: PitchCue = Math.abs(dy) <= offsetBand ? "高低合适" : dy < 0 ? "偏上" : "偏下";
  const parts: Array<RangeCue | HeadingCue | PitchCue> = [rangeCue, headingCue];
  if (pitchCue !== "高低合适") {
    parts.push(pitchCue);
  }
  return {
    heightRatio,
    areaRatio,
    dx,
    dy,
    rangeCue,
    headingCue,
    pitchCue,
    occupancyOk,
    offsetOk,
    geometryOk: occupancyOk && offsetOk,
    summary: parts.join(" · "),
  };
}

export function hfovForSource(
  source: LiveSource,
  webcamDeg: number,
  camDeg: number,
): number {
  return source === "esp-cam" ? camDeg : webcamDeg;
}

export function normalizeStreamUrl(raw: string): string {
  const trimmed = raw.trim();
  return trimmed || DEFAULT_ESP_CAM_STREAM_URL;
}

export function httpsBlocksHttpStream(pageProtocol: string, streamUrl: string): boolean {
  try {
    const parsed = new URL(streamUrl);
    return pageProtocol === "https:" && parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export function formatMeters(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10) {
    return `${value.toFixed(0)} m`;
  }
  return `${value.toFixed(1)} m`;
}

export function formatDistance(fix: SpatialFix): string {
  return `约 ${formatMeters(fix.distanceM)}`;
}

/** Secondary readout only. Never the CAPTURE_GO / CONTINUE_FOLLOW authority. */
export function formatMetersHint(fix: SpatialFix): string {
  return `约 ${formatMeters(fix.distanceM)} · 不可靠`;
}

export function headingLabel(heading: SpatialFix["heading"]): string {
  if (heading === "left") {
    return "偏左";
  }
  if (heading === "right") {
    return "偏右";
  }
  return "居中";
}

export function cropLabel(crop: BodyCrop): string {
  switch (crop) {
    case "full":
      return "全身";
    case "knee":
      return "膝上";
    case "waist":
      return "半身";
    case "bust":
      return "胸上";
    case "head":
      return "近景";
    default:
      return "";
  }
}

export class SpatialSmoother {
  private samples: SpatialFix[] = [];

  constructor(private readonly size = 5) {}

  reset(): void {
    this.samples = [];
  }

  push(fix: SpatialFix | null): SpatialFix | null {
    if (!fix) {
      this.samples = [];
      return null;
    }
    this.samples.push(fix);
    if (this.samples.length > this.size) {
      this.samples.shift();
    }
    const distanceM = median(this.samples.map((item) => item.distanceM));
    const rightM = median(this.samples.map((item) => item.rightM));
    const upM = median(this.samples.map((item) => item.upM));
    return {
      ...fix,
      distanceM,
      rightM,
      upM,
      heading: rightM > 0.28 ? "right" : rightM < -0.28 ? "left" : "center",
      range: distanceM < 1.6 ? "near" : distanceM < 5 ? "mid" : "far",
    };
  }
}

function inferPersonSize(box: BBox, personHeightM = REAL_HEIGHT_M.person): VisibleSize {
  const aspect = box.w / Math.max(box.h, 1e-6);
  const clip = clipFlags(box);
  const scale = (personHeightM || 1.7) / 1.7;
  let crop: Exclude<BodyCrop, "object">;
  if (clip.top && clip.bottom) {
    crop = aspect >= 0.72 ? "bust" : aspect >= 0.5 ? "waist" : "knee";
  } else if (clip.top && !clip.bottom) {
    crop = aspect >= 0.62 ? "bust" : "waist";
  } else if (!clip.top && clip.bottom) {
    crop = aspect <= 0.38 ? "full" : aspect <= 0.55 ? "knee" : "waist";
  } else if (aspect <= 0.34 && box.h >= 0.22) {
    crop = "full";
  } else if (aspect <= 0.45) {
    crop = "knee";
  } else if (aspect <= 0.58) {
    crop = "waist";
  } else if (aspect <= 0.8 && box.h >= 0.42) {
    crop = "bust";
  } else {
    crop = "head";
  }
  const size = PERSON_VISIBLE[crop];
  return {
    crop,
    heightM: size.heightM * scale,
    widthM: size.widthM * scale,
    heightUsable: !(clip.top && clip.bottom),
    widthUsable: true,
  };
}

function clipFlags(box: BBox): { top: boolean; bottom: boolean; side: boolean } {
  return {
    top: box.y < 0.035,
    bottom: box.y + box.h > 0.965,
    side: box.x < 0.02 || box.x + box.w > 0.98,
  };
}

function fuseDistance(
  fromHeight: number | null,
  fromWidth: number | null,
  crop: BodyCrop,
): number {
  if (fromHeight === null && fromWidth === null) {
    return 1;
  }
  if (fromHeight === null) {
    return fromWidth as number;
  }
  if (fromWidth === null) {
    return fromHeight;
  }
  const widthWeight =
    crop === "full"
      ? 0.22
      : crop === "knee"
        ? 0.32
        : crop === "waist"
          ? 0.48
          : crop === "bust"
            ? 0.62
            : crop === "head"
              ? 0.7
              : 0.35;
  return (1 - widthWeight) * fromHeight + widthWeight * fromWidth;
}

function confidenceOf(
  fromHeight: number | null,
  fromWidth: number | null,
  visible: VisibleSize,
): SpatialFix["confidence"] {
  if (fromHeight === null || fromWidth === null) {
    return "low";
  }
  const gap = Math.abs(fromHeight - fromWidth) / Math.max(fromHeight, fromWidth);
  if (!visible.heightUsable) {
    return gap < 0.35 ? "medium" : "low";
  }
  if (gap < 0.22 && (visible.crop === "full" || visible.crop === "knee")) {
    return "high";
  }
  if (gap < 0.4) {
    return "medium";
  }
  return "low";
}

function phraseDelta(
  closerM: number,
  rightM: number,
  upM: number,
  loose: boolean,
): string {
  const dead = loose ? 0.4 : 0.22;
  const parts: string[] = [];
  if (Math.abs(closerM) < dead) {
    parts.push("远近合适");
  } else if (closerM > 0) {
    parts.push("近了");
  } else {
    parts.push("远了");
  }
  if (Math.abs(rightM) < dead) {
    parts.push("居中");
  } else if (rightM > 0) {
    parts.push("偏右");
  } else {
    parts.push("偏左");
  }
  if (Math.abs(upM) >= Math.max(0.28, dead)) {
    parts.push(upM > 0 ? "偏上" : "偏下");
  }
  return parts.join(" · ");
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function deg(value: number): number {
  return (value * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
