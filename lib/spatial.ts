/** Pinhole spatial estimate from a YOLO box. Rough meters, not RTK. */

import type { BBox } from "./flyvision-match";

/** Default webcam / OV2640-ish horizontal field of view. */
export const DEFAULT_HFOV_DEG = 62;

/** Typical standing / object heights used for monocular scale. */
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

export type SpatialFix = {
  distanceM: number;
  rightM: number;
  upM: number;
  heading: "left" | "center" | "right";
  range: "near" | "mid" | "far";
};

export type SpatialDelta = {
  closerM: number;
  rightM: number;
  upM: number;
  summary: string;
};

export function estimateSpatial(
  label: string,
  box: BBox,
  aspect = 4 / 3,
  hfovDeg = DEFAULT_HFOV_DEG,
): SpatialFix | null {
  const realH = REAL_HEIGHT_M[label];
  if (!realH || box.h < 0.02) {
    return null;
  }
  const hfov = deg(hfovDeg);
  const vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
  const distanceM = clamp(realH / (2 * box.h * Math.tan(vfov / 2)), 0.3, 80);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const rightM = distanceM * Math.tan((cx - 0.5) * 2 * Math.tan(hfov / 2));
  const upM = distanceM * Math.tan((0.5 - cy) * 2 * Math.tan(vfov / 2));
  return {
    distanceM,
    rightM,
    upM,
    heading: rightM > 0.35 ? "right" : rightM < -0.35 ? "left" : "center",
    range: distanceM < 2.2 ? "near" : distanceM < 7 ? "mid" : "far",
  };
}

export function compareSpatial(reference: SpatialFix, live: SpatialFix): SpatialDelta {
  const closerM = reference.distanceM - live.distanceM;
  const rightM = live.rightM - reference.rightM;
  const upM = live.upM - reference.upM;
  return {
    closerM,
    rightM,
    upM,
    summary: phraseDelta(closerM, rightM, upM),
  };
}

export function formatMeters(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10) {
    return `${value.toFixed(0)} m`;
  }
  return `${value.toFixed(1)} m`;
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

function phraseDelta(closerM: number, rightM: number, upM: number): string {
  const parts: string[] = [];
  if (Math.abs(closerM) < 0.25) {
    parts.push("距离接近");
  } else if (closerM > 0) {
    parts.push(`近了 ${formatMeters(closerM)}`);
  } else {
    parts.push(`远了 ${formatMeters(-closerM)}`);
  }
  if (Math.abs(rightM) < 0.25) {
    parts.push("左右对齐");
  } else if (rightM > 0) {
    parts.push(`偏右 ${formatMeters(rightM)}`);
  } else {
    parts.push(`偏左 ${formatMeters(-rightM)}`);
  }
  if (Math.abs(upM) >= 0.3) {
    parts.push(upM > 0 ? `偏高 ${formatMeters(upM)}` : `偏低 ${formatMeters(-upM)}`);
  }
  return parts.join(" · ");
}

function deg(value: number): number {
  return (value * Math.PI) / 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
