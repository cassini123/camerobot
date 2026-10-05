/** FilmOps-style shot scale + composition tags from a YOLO box. No VLM. */

import type { BBox } from "./flyvision-match";
import type { BodyCrop } from "./spatial";
import { inferVisibleSize } from "./spatial";

export const SHOT_SCALES = ["ECU", "CU", "MCU", "MS", "MLS", "LS", "ELS"] as const;
export type ShotScale = (typeof SHOT_SCALES)[number];

export const COMPOSITION_TAGS = [
  "center",
  "thirds",
  "horizontal",
  "vertical",
  "symmetric",
  "framing",
  "scattered",
] as const;
export type CompositionTag = (typeof COMPOSITION_TAGS)[number];

export type ShotLabelSet = {
  scale: ShotScale;
  tags: CompositionTag[];
};

export const SCALE_ZH: Record<ShotScale, string> = {
  ECU: "大特写",
  CU: "特写",
  MCU: "近景",
  MS: "中景",
  MLS: "中全",
  LS: "全景",
  ELS: "远景",
};

export const TAG_ZH: Record<CompositionTag, string> = {
  center: "居中",
  thirds: "三分",
  horizontal: "水平",
  vertical: "垂直",
  symmetric: "对称",
  framing: "卡边",
  scattered: "散点",
};

export function shotScaleFromBox(box: BBox, label = "person"): ShotScale {
  const visible = inferVisibleSize(label, box);
  const crop: BodyCrop = visible?.crop ?? "object";
  if (crop === "head") {
    return box.h >= 0.48 ? "ECU" : "CU";
  }
  if (crop === "bust") {
    return "MCU";
  }
  if (crop === "waist") {
    return "MS";
  }
  if (crop === "knee") {
    return "MLS";
  }
  if (crop === "full") {
    return box.h >= 0.38 ? "LS" : "ELS";
  }
  if (box.h >= 0.72) {
    return "CU";
  }
  if (box.h >= 0.45) {
    return "MS";
  }
  if (box.h >= 0.22) {
    return "LS";
  }
  return "ELS";
}

export function compositionTags(box: BBox, extraBoxes = 0): CompositionTag[] {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const tags: CompositionTag[] = [];
  const near = (value: number, target: number, tol = 0.07) => Math.abs(value - target) <= tol;
  if (near(cx, 0.5, 0.08) && near(cy, 0.5, 0.12)) {
    tags.push("center");
  }
  if (near(cx, 1 / 3) || near(cx, 2 / 3) || near(cy, 1 / 3) || near(cy, 2 / 3)) {
    tags.push("thirds");
  }
  if (near(cy, 0.5, 0.08)) {
    tags.push("horizontal");
  }
  if (near(cx, 0.5, 0.08)) {
    tags.push("vertical");
  }
  if (near(cx, 0.5, 0.055)) {
    tags.push("symmetric");
  }
  const edges =
    Number(box.y < 0.04) +
    Number(box.y + box.h > 0.96) +
    Number(box.x < 0.03) +
    Number(box.x + box.w > 0.97);
  if (edges >= 2) {
    tags.push("framing");
  }
  if (extraBoxes >= 2) {
    tags.push("scattered");
  }
  return tags;
}

export function labelShot(box: BBox, label = "person", extraBoxes = 0): ShotLabelSet {
  return {
    scale: shotScaleFromBox(box, label),
    tags: compositionTags(box, extraBoxes),
  };
}

export function labelSimilarity(current: ShotLabelSet, reference: ShotLabelSet): number {
  const scaleScore = current.scale === reference.scale ? 1 : neighborScale(current.scale, reference.scale) ? 0.45 : 0;
  const union = new Set([...current.tags, ...reference.tags]);
  if (union.size === 0) {
    return scaleScore;
  }
  const inter = current.tags.filter((tag) => reference.tags.includes(tag)).length;
  return 0.62 * scaleScore + 0.38 * (inter / union.size);
}

export function formatShotLabels(labels: ShotLabelSet): string {
  const tags = labels.tags.map((tag) => TAG_ZH[tag]).join(" / ");
  return tags ? `${SCALE_ZH[labels.scale]} · ${tags}` : SCALE_ZH[labels.scale];
}

function neighborScale(left: ShotScale, right: ShotScale): boolean {
  return Math.abs(SHOT_SCALES.indexOf(left) - SHOT_SCALES.indexOf(right)) === 1;
}
