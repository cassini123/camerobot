import { normalizeMovement, pathPoints } from "./path-engine";
import type { CameraPath, Shot } from "./types";

export type StillKind = "linear" | "curve";

export interface StillSample {
  t: number;
  label: string;
}

function unwrapDelta(prev: number, next: number): number {
  let delta = next - prev;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}

export function pathYawSweepDeg(path: CameraPath): number {
  const points = pathPoints(path);
  if (points.length < 2) {
    return 0;
  }
  const target = path.target;
  let prev = Math.atan2(points[0][2] - target[2], points[0][0] - target[0]);
  let acc = 0;
  for (let i = 1; i < points.length; i += 1) {
    const next = Math.atan2(points[i][2] - target[2], points[i][0] - target[0]);
    acc += unwrapDelta(prev, next);
    prev = next;
  }
  return Math.abs(acc) * (180 / Math.PI);
}

export function stillKind(shot: Shot): StillKind {
  return normalizeMovement(shot.movement.type) === "ORBIT" ? "curve" : "linear";
}

export function stillFrameCount(shot: Shot): number {
  if (stillKind(shot) === "linear") {
    return 2;
  }
  const degrees = pathYawSweepDeg(shot.path);
  if (degrees <= 360) {
    return 3;
  }
  return Math.ceil(degrees / 360) * 3;
}

export function sampleStillFrames(shot: Shot): StillSample[] {
  const count = stillFrameCount(shot);
  if (count <= 1) {
    return [{ t: 0, label: "start" }];
  }
  if (stillKind(shot) === "linear") {
    return [
      { t: 0, label: "start" },
      { t: 1, label: "end" },
    ];
  }
  return Array.from({ length: count }, (_, index) => ({
    t: index / (count - 1),
    label: `frame_${index + 1}`,
  }));
}
