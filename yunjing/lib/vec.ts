import type { Vec3 } from "./types";

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a) || 1;
  return scale(a, 1 / len);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function clampVec(
  p: Vec3,
  bounds: { min: Vec3; max: Vec3 },
  padding = 0.4,
): Vec3 {
  return [
    clamp(p[0], bounds.min[0] + padding, bounds.max[0] - padding),
    clamp(p[1], bounds.min[1], bounds.max[1] - padding),
    clamp(p[2], bounds.min[2] + padding, bounds.max[2] - padding),
  ];
}

export function roundVec(p: Vec3, digits = 2): Vec3 {
  const f = 10 ** digits;
  return [
    Math.round(p[0] * f) / f,
    Math.round(p[1] * f) / f,
    Math.round(p[2] * f) / f,
  ];
}

export function yawDeg(from: Vec3, to: Vec3): number {
  return (Math.atan2(to[0] - from[0], to[2] - from[2]) * 180) / Math.PI;
}

export function lookEuler(from: Vec3, to: Vec3): Vec3 {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const dist = Math.hypot(dx, dz) || 1;
  const pitch = (-Math.atan2(dy, dist) * 180) / Math.PI;
  const yaw = (Math.atan2(dx, dz) * 180) / Math.PI;
  return [Math.round(pitch * 10) / 10, Math.round(yaw * 10) / 10, 0];
}
