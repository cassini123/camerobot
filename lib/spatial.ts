/** Crop-aware pinhole ranging from a YOLO box. Rough meters, not RTK. */

import type { BBox } from "./flyvision-match";

/** Laptop webcam / OV2640-class horizontal field of view. */
export const DEFAULT_HFOV_DEG = 70;

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
  const hfovDeg = options.hfovDeg ?? DEFAULT_HFOV_DEG;
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
  return {
    closerM,
    rightM,
    upM,
    summary: [phraseDelta(closerM, rightM, upM, loose), cropNote].filter(Boolean).join(" · "),
  };
}

export function formatMeters(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10) {
    return `${value.toFixed(0)} m`;
  }
  return `${value.toFixed(1)} m`;
}

export function formatDistance(fix: SpatialFix): string {
  const text = formatMeters(fix.distanceM);
  return fix.confidence === "high" ? text : `约 ${text}`;
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

/** Minimal detection the video tracker needs. Compatible with YoloDet. */
export type SpatialDet = {
  label: string;
  box: BBox;
  score?: number;
};

export type VideoSpatialResult = {
  trackId: number | null;
  det: SpatialDet | null;
  spatial: SpatialFix | null;
  raw: SpatialFix | null;
  delta: SpatialDelta | null;
  matched: boolean;
};

type AxisFilter = {
  x: number;
  v: number;
  p00: number;
  p01: number;
  p11: number;
};

type VideoTrack = {
  id: number;
  label: string;
  box: BBox;
  score: number;
  missed: number;
  crop: BodyCrop | null;
  cropHold: BodyCrop | null;
  cropHoldCount: number;
  lastH: number;
  hVel: number;
  dist: AxisFilter;
  right: AxisFilter;
  up: AxisFilter;
  heading: SpatialFix["heading"];
  lastFix: SpatialFix | null;
  lastRaw: SpatialFix | null;
};

const DEFAULT_VIDEO_DT = 0.36;
const TRACK_IOU_MIN = 0.18;
const TRACK_PAIR_MIN = 0.08;
const TRACK_MAX_MISS = 5;
const HEADING_ENTER = 0.34;
const HEADING_LEAVE = 0.2;

/**
 * Live-camera ranging: IoU/centroid lock on one subject, then a
 * constant-velocity filter on distance / right / up. Still frames keep
 * using estimateSpatial + optional SpatialSmoother.
 */
export class VideoSpatialTracker {
  private tracks: VideoTrack[] = [];
  private nextId = 1;
  private primaryId: number | null = null;
  private reference: SpatialFix | null = null;
  private lastMs: number | null = null;

  setReference(fix: SpatialFix | null): void {
    this.reference = fix ? { ...fix } : null;
  }

  getReference(): SpatialFix | null {
    return this.reference;
  }

  reset(): void {
    this.tracks = [];
    this.nextId = 1;
    this.primaryId = null;
    this.reference = null;
    this.lastMs = null;
  }

  resetTracks(): void {
    this.tracks = [];
    this.nextId = 1;
    this.primaryId = null;
    this.lastMs = null;
  }

  push(dets: SpatialDet[], options: SpatialOptions = {}, nowMs?: number): VideoSpatialResult {
    const dt = this.stepDt(nowMs);
    const matched = new Array<SpatialDet | null>(this.tracks.length).fill(null);
    const used = new Set<number>();
    const pairs: { ti: number; di: number; score: number }[] = [];
    this.tracks.forEach((track, ti) => {
      dets.forEach((det, di) => {
        if (det.label !== track.label) {
          return;
        }
        const score = pairScore(track.box, det.box);
        if (score >= TRACK_PAIR_MIN && boxOverlap(track.box, det.box) >= TRACK_IOU_MIN * 0.5) {
          pairs.push({ ti, di, score });
        }
      });
    });
    pairs.sort((a, b) => b.score - a.score);
    for (const pair of pairs) {
      if (matched[pair.ti] || used.has(pair.di)) {
        continue;
      }
      if (boxOverlap(this.tracks[pair.ti].box, dets[pair.di].box) < TRACK_IOU_MIN && pair.score < 0.22) {
        continue;
      }
      matched[pair.ti] = dets[pair.di];
      used.add(pair.di);
    }

    this.tracks.forEach((track, ti) => {
      const det = matched[ti];
      if (!det) {
        predictAxis(track.dist, dt, 0.12);
        predictAxis(track.right, dt, 0.18);
        predictAxis(track.up, dt, 0.18);
        track.missed += 1;
        if (track.lastFix) {
          track.lastFix = finishFix(track, track.lastFix);
        }
        return;
      }
      track.missed = 0;
      track.box = det.box;
      track.score = det.score ?? track.score;
      const raw = estimateSpatial(det.label, det.box, options);
      track.lastRaw = raw;
      this.updateTrack(track, det, raw, dt);
    });

    dets.forEach((det, di) => {
      if (used.has(di)) {
        return;
      }
      this.tracks.push(this.spawnTrack(det, estimateSpatial(det.label, det.box, options)));
    });

    this.tracks = this.tracks.filter((track) => track.missed <= TRACK_MAX_MISS);
    this.lockPrimary(dets);

    const primary = this.tracks.find((track) => track.id === this.primaryId) ?? null;
    const matchedDet =
      primary == null
        ? null
        : dets.find(
            (det) =>
              det.label === primary.label &&
              boxOverlap(det.box, primary.box) >= TRACK_IOU_MIN * 0.6,
          ) ?? (primary.missed === 0 ? { label: primary.label, box: primary.box, score: primary.score } : null);
    const spatial = primary?.lastFix ?? null;
    const raw = primary?.lastRaw ?? null;
    return {
      trackId: primary?.id ?? null,
      det: matchedDet,
      spatial,
      raw,
      delta: this.reference && spatial ? compareSpatial(this.reference, spatial) : null,
      matched: Boolean(primary && primary.missed === 0),
    };
  }

  private stepDt(nowMs?: number): number {
    const now =
      nowMs ??
      (typeof performance !== "undefined" ? performance.now() : Date.now());
    const elapsed = this.lastMs == null ? DEFAULT_VIDEO_DT * 1000 : now - this.lastMs;
    this.lastMs = now;
    if (elapsed < 20) {
      return DEFAULT_VIDEO_DT;
    }
    return clamp(elapsed / 1000, 0.08, 1.2);
  }

  private spawnTrack(det: SpatialDet, raw: SpatialFix | null): VideoTrack {
    const track: VideoTrack = {
      id: this.nextId++,
      label: det.label,
      box: det.box,
      score: det.score ?? 1,
      missed: 0,
      crop: raw?.crop ?? null,
      cropHold: null,
      cropHoldCount: 0,
      lastH: det.box.h,
      hVel: 0,
      dist: raw ? initAxis(raw.distanceM) : initAxis(2),
      right: raw ? initAxis(raw.rightM) : initAxis(0),
      up: raw ? initAxis(raw.upM) : initAxis(0),
      heading: raw?.heading ?? "center",
      lastFix: raw,
      lastRaw: raw,
    };
    return track;
  }

  private updateTrack(track: VideoTrack, det: SpatialDet, raw: SpatialFix | null, dt: number): void {
    const dh = det.box.h - track.lastH;
    track.hVel = 0.45 * (dh / Math.max(dt, 1e-3)) + 0.55 * track.hVel;
    const relH = Math.abs(dh) / Math.max(det.box.h, 0.05);
    const growing = track.hVel > 0.04;
    const shrinking = track.hVel < -0.04;
    track.lastH = det.box.h;

    predictAxis(track.dist, dt, growing || shrinking ? 0.28 : 0.08);
    predictAxis(track.right, dt, 0.16);
    predictAxis(track.up, dt, 0.16);

    if (!raw) {
      if (track.lastFix) {
        track.lastFix = finishFix(track, track.lastFix);
      }
      return;
    }

    const cropChanged = lockCrop(track, raw.crop);
    const residual = Math.abs(raw.distanceM - track.dist.x) / Math.max(track.dist.x, 0.4);
    let rDist =
      raw.confidence === "high" ? 0.045 : raw.confidence === "medium" ? 0.14 : 0.4;
    if (cropChanged) {
      rDist *= 8;
    }
    // Box size barely moved but pinhole jumped: YOLO flicker, not an approach.
    if (relH < 0.03 && residual > 0.12) {
      rDist *= 10;
    }
    let rLat = raw.confidence === "high" ? 0.03 : 0.1;
    if (cropChanged) {
      rLat *= 3;
    }
    updateAxis(track.dist, raw.distanceM, rDist);
    updateAxis(track.right, raw.rightM, rLat);
    updateAxis(track.up, raw.upM, rLat);
    if ((growing || shrinking) && !cropChanged) {
      const sizeVel = (-track.dist.x * track.hVel) / Math.max(det.box.h, 0.05);
      track.dist.v = 0.55 * track.dist.v + 0.45 * sizeVel;
    }
    track.heading = headingWithHysteresis(track.right.x, track.heading);
    track.lastFix = finishFix(track, raw);
  }

  private lockPrimary(dets: SpatialDet[]): void {
    const live = this.tracks.filter((track) => track.missed <= TRACK_MAX_MISS);
    const current = live.find((track) => track.id === this.primaryId);
    if (current && current.missed < TRACK_MAX_MISS) {
      return;
    }
    const seed = pickPrimaryDet(dets);
    if (!seed) {
      this.primaryId = current?.id ?? live[0]?.id ?? null;
      return;
    }
    const hit = live.find(
      (track) => track.label === seed.label && boxOverlap(track.box, seed.box) >= TRACK_IOU_MIN,
    );
    this.primaryId = hit?.id ?? live[0]?.id ?? null;
  }
}

export function pickPrimaryDet<T extends SpatialDet>(dets: T[]): T | null {
  if (!dets.length) {
    return null;
  }
  const people = dets.filter((item) => item.label === "person");
  const pool = people.length ? people : dets;
  return pool.reduce((best, item) => {
    const score = (item.score ?? 1) * item.box.w * item.box.h;
    const bestScore = (best.score ?? 1) * best.box.w * best.box.h;
    return score > bestScore ? item : best;
  });
}

export function boxOverlap(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

function pairScore(a: BBox, b: BBox): number {
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  return boxOverlap(a, b) - 0.35 * Math.hypot(acx - bcx, acy - bcy);
}

function initAxis(value: number): AxisFilter {
  return { x: value, v: 0, p00: 0.25, p01: 0, p11: 0.6 };
}

function predictAxis(filter: AxisFilter, dt: number, q: number): void {
  filter.x += filter.v * dt;
  const p00 = filter.p00 + 2 * dt * filter.p01 + dt * dt * filter.p11 + (q * dt ** 4) / 4;
  const p01 = filter.p01 + dt * filter.p11 + (q * dt ** 3) / 2;
  const p11 = filter.p11 + q * dt * dt;
  filter.p00 = p00;
  filter.p01 = p01;
  filter.p11 = p11;
}

function updateAxis(filter: AxisFilter, z: number, r: number): void {
  const s = filter.p00 + r;
  const k0 = filter.p00 / s;
  const k1 = filter.p01 / s;
  const innov = z - filter.x;
  filter.x += k0 * innov;
  filter.v += k1 * innov;
  filter.p11 -= k1 * filter.p01;
  filter.p01 *= 1 - k0;
  filter.p00 *= 1 - k0;
}

function lockCrop(track: VideoTrack, crop: BodyCrop): boolean {
  if (track.crop == null) {
    track.crop = crop;
    track.cropHold = null;
    track.cropHoldCount = 0;
    return false;
  }
  if (crop === track.crop) {
    track.cropHold = null;
    track.cropHoldCount = 0;
    return false;
  }
  if (track.cropHold === crop) {
    track.cropHoldCount += 1;
  } else {
    track.cropHold = crop;
    track.cropHoldCount = 1;
  }
  if (track.cropHoldCount >= 3) {
    track.crop = crop;
    track.cropHold = null;
    track.cropHoldCount = 0;
    return false;
  }
  return true;
}

function headingWithHysteresis(
  rightM: number,
  prev: SpatialFix["heading"],
): SpatialFix["heading"] {
  if (prev === "right") {
    if (rightM < -HEADING_ENTER) {
      return "left";
    }
    return rightM < HEADING_LEAVE ? "center" : "right";
  }
  if (prev === "left") {
    if (rightM > HEADING_ENTER) {
      return "right";
    }
    return rightM > -HEADING_LEAVE ? "center" : "left";
  }
  if (rightM > HEADING_ENTER) {
    return "right";
  }
  if (rightM < -HEADING_ENTER) {
    return "left";
  }
  return "center";
}

function finishFix(track: VideoTrack, raw: SpatialFix): SpatialFix {
  const distanceM = clamp(track.dist.x, 0.25, 80);
  const rightM = track.right.x;
  const upM = track.up.x;
  return {
    ...raw,
    distanceM,
    rightM,
    upM,
    heading: track.heading,
    range: distanceM < 1.6 ? "near" : distanceM < 5 ? "mid" : "far",
    crop: track.crop ?? raw.crop,
  };
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
    parts.push("距离接近");
  } else if (closerM > 0) {
    parts.push(`近了 ${formatMeters(closerM)}`);
  } else {
    parts.push(`远了 ${formatMeters(-closerM)}`);
  }
  if (Math.abs(rightM) < dead) {
    parts.push("左右对齐");
  } else if (rightM > 0) {
    parts.push(`偏右 ${formatMeters(rightM)}`);
  } else {
    parts.push(`偏左 ${formatMeters(-rightM)}`);
  }
  if (Math.abs(upM) >= Math.max(0.28, dead)) {
    parts.push(upM > 0 ? `偏高 ${formatMeters(upM)}` : `偏低 ${formatMeters(-upM)}`);
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
