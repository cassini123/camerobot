import type { Vec3, SpaceModel } from "./types";

export type HeroView = {
  position: Vec3;
  target: Vec3;
  fov: number;
};

export const HALL_HERO: HeroView = {
  position: [14, 9, -12],
  target: [0, 1.2, 6],
  fov: 42,
};

/** Elevated establishing camera that keeps the fitted splat filling the frame. */
export function heroView(space: SpaceModel): HeroView {
  if (space.kind !== "upload") {
    return HALL_HERO;
  }
  const min = space.bounds.min;
  const max = space.bounds.max;
  const target: Vec3 = [
    (min[0] + max[0]) / 2,
    min[1] + (max[1] - min[1]) * 0.32,
    (min[2] + max[2]) / 2,
  ];
  const spanX = Math.max(1, max[0] - min[0]);
  const spanY = Math.max(1, max[1] - min[1]);
  const spanZ = Math.max(1, max[2] - min[2]);
  const radius = Math.max(spanX, spanZ) * 0.72 + spanY * 0.35;
  return {
    position: [target[0], target[1] + spanY * 0.55 + 1.8, target[2] + radius],
    target,
    fov: 46,
  };
}
