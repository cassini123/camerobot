/** Sequence match a1…an vs live bn. Geometry gate, not a world model. */

import type { BBox } from "./flyvision-match";
import type { YoloDet } from "./yolo";

export const MIN_OBJECT_AREA = 0.01;
export const CORNER_REL_LIMIT = 0.1;
/** Variance of signed corner relative errors. std ≈ 5% → var = 0.0025. */
export const CORNER_VAR_LIMIT = 0.0025;
export const STABLE_PASS_FRAMES = 3;
export const VIDEO_FPS = 24;
export const VIDEO_MAX_FRAMES = 360;

export type Xyxy = { x1: number; y1: number; x2: number; y2: number };

export type SceneObject = {
  label: string;
  score: number;
  xyxy: Xyxy;
  area: number;
};

export type ObjectPair = {
  ref: SceneObject;
  live: SceneObject;
  rel: [number, number, number, number];
};

export type SequenceMatch = {
  pairs: ObjectPair[];
  missing: SceneObject[];
  extra: number;
  maxAbsRel: number;
  variance: number;
  meanAbsRel: number;
  cornersOk: boolean;
  varianceOk: boolean;
  ok: boolean;
};

export type DroneCommand = {
  forwardM: number;
  rightM: number;
  upM: number;
  yawDeg: number;
  pitchDeg: number;
  text: string;
  cues: string[];
};

export function boxToXyxy(box: BBox): Xyxy {
  return {
    x1: round4(clamp01(box.x)),
    y1: round4(clamp01(box.y)),
    x2: round4(clamp01(box.x + box.w)),
    y2: round4(clamp01(box.y + box.h)),
  };
}

export function xyxyToBox(xyxy: Xyxy): BBox {
  return {
    x: xyxy.x1,
    y: xyxy.y1,
    w: Math.max(0, xyxy.x2 - xyxy.x1),
    h: Math.max(0, xyxy.y2 - xyxy.y1),
  };
}

export function sceneObjects(dets: YoloDet[], minArea = MIN_OBJECT_AREA): SceneObject[] {
  return dets
    .map((det) => {
      const xyxy = boxToXyxy(det.box);
      const area = Math.max(0, xyxy.x2 - xyxy.x1) * Math.max(0, xyxy.y2 - xyxy.y1);
      return { label: det.label, score: det.score, xyxy, area };
    })
    .filter((item) => item.area >= minArea)
    .sort((a, b) => b.area - a.area);
}

export function cornerRelErrors(ref: Xyxy, live: Xyxy): [number, number, number, number] {
  const w = Math.max(0.02, ref.x2 - ref.x1);
  const h = Math.max(0.02, ref.y2 - ref.y1);
  return [
    (live.x1 - ref.x1) / w,
    (live.y1 - ref.y1) / h,
    (live.x2 - ref.x2) / w,
    (live.y2 - ref.y2) / h,
  ];
}

export function variance(values: number[]): number {
  if (values.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
}

export function pairObjects(refs: SceneObject[], lives: SceneObject[]): SequenceMatch {
  const used = new Set<number>();
  const pairs: ObjectPair[] = [];
  for (const ref of refs) {
    let best = -1;
    let bestScore = -1;
    lives.forEach((live, index) => {
      if (used.has(index) || live.label !== ref.label) {
        return;
      }
      const iou = xyxyIou(ref.xyxy, live.xyxy);
      const center = 1 - centerDist(ref.xyxy, live.xyxy);
      const score = iou * 0.7 + center * 0.3;
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    });
    if (best >= 0) {
      used.add(best);
      const live = lives[best];
      pairs.push({ ref, live, rel: cornerRelErrors(ref.xyxy, live.xyxy) });
    }
  }
  const missing = refs.filter((ref) => pairs.every((pair) => pair.ref !== ref));
  const errors = pairs.flatMap((pair) => pair.rel);
  const abs = errors.map((value) => Math.abs(value));
  const maxAbsRel = abs.length ? Math.max(...abs) : Number.POSITIVE_INFINITY;
  const meanAbsRel = abs.length ? abs.reduce((sum, value) => sum + value, 0) / abs.length : Number.POSITIVE_INFINITY;
  const varVal = variance(errors);
  const cornersOk = pairs.length === refs.length && maxAbsRel <= CORNER_REL_LIMIT;
  const varianceOk = pairs.length > 0 && varVal <= CORNER_VAR_LIMIT;
  return {
    pairs,
    missing,
    extra: lives.length - used.size,
    maxAbsRel,
    variance: varVal,
    meanAbsRel,
    cornersOk,
    varianceOk,
    ok: cornersOk && varianceOk && missing.length === 0,
  };
}

export function droneCommand(
  refs: SceneObject[],
  lives: SceneObject[],
  opts: { distanceM?: number; hfovDeg?: number; aspect?: number } = {},
): DroneCommand {
  const match = pairObjects(refs, lives);
  const ref = refs[0];
  const live = match.pairs[0]?.live ?? lives[0];
  if (!ref || !live) {
    return {
      forwardM: 0,
      rightM: 0,
      upM: 0,
      yawDeg: 0,
      pitchDeg: 0,
      text: lives.length ? "参考物体没对上，把主体放进画面" : "画面里没有 ≥1% 的物体",
      cues: ["对准主体"],
    };
  }
  const distanceM = Math.max(0.4, opts.distanceM ?? 2);
  const hfov = deg(opts.hfovDeg ?? 66);
  const aspect = Math.max(0.2, opts.aspect ?? 4 / 3);
  const vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect);
  const refBox = xyxyToBox(ref.xyxy);
  const liveBox = xyxyToBox(live.xyxy);
  const heightRatio = liveBox.h / Math.max(1e-6, refBox.h);
  const dx = liveBox.x + liveBox.w / 2 - (refBox.x + refBox.w / 2);
  const dy = liveBox.y + liveBox.h / 2 - (refBox.y + refBox.h / 2);
  const forwardM = round3(distanceM * (1 / Math.max(0.25, heightRatio) - 1));
  const rightM = round3(distanceM * dx * 2 * Math.tan(hfov / 2));
  const upM = round3(-distanceM * dy * 2 * Math.tan(vfov / 2));
  const yawDeg = round2((Math.atan(dx * 2 * Math.tan(hfov / 2)) * 180) / Math.PI);
  const pitchDeg = round2((-Math.atan(dy * 2 * Math.tan(vfov / 2)) * 180) / Math.PI);
  const cues: string[] = [];
  if (Math.abs(forwardM) >= 0.08) {
    cues.push(forwardM > 0 ? "近了" : "远了");
  }
  if (Math.abs(rightM) >= 0.06) {
    cues.push(rightM > 0 ? "偏右" : "偏左");
  }
  if (Math.abs(upM) >= 0.06) {
    cues.push(upM > 0 ? "偏上" : "偏下");
  }
  const parts = [
    bodyPhrase("前", "后", forwardM, "m"),
    bodyPhrase("右", "左", rightM, "m"),
    bodyPhrase("上", "下", upM, "m"),
    gimbalPhrase("云台右偏", "云台左偏", yawDeg),
    gimbalPhrase("云台上仰", "云台下俯", pitchDeg),
  ].filter(Boolean);
  return {
    forwardM,
    rightM,
    upM,
    yawDeg,
    pitchDeg,
    text: parts.join(" · ") || "已经很近，微调",
    cues: cues.length ? cues : ["继续对齐"],
  };
}

export function shotName(prefix: "a" | "b", index: number): string {
  return `${prefix}${index + 1}`;
}

function xyxyIou(a: Xyxy, b: Xyxy): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union =
    Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1) +
    Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1) -
    inter;
  return union <= 0 ? 0 : inter / union;
}

function centerDist(a: Xyxy, b: Xyxy): number {
  const acx = (a.x1 + a.x2) / 2;
  const acy = (a.y1 + a.y2) / 2;
  const bcx = (b.x1 + b.x2) / 2;
  const bcy = (b.y1 + b.y2) / 2;
  return Math.hypot(acx - bcx, acy - bcy);
}

function bodyPhrase(pos: string, neg: string, value: number, unit: string): string {
  if (Math.abs(value) < 0.05) {
    return "";
  }
  const dir = value > 0 ? pos : neg;
  return `机身往${dir} ${Math.abs(value).toFixed(2)} ${unit}`;
}

function gimbalPhrase(pos: string, neg: string, value: number): string {
  if (Math.abs(value) < 0.4) {
    return "";
  }
  const label = value > 0 ? pos : neg;
  return `${label} ${Math.abs(value).toFixed(1)}°`;
}

function deg(value: number): number {
  return (value * Math.PI) / 180;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
