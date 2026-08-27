import { describe, expect, it } from "vitest";
import { applyPathToShot, buildPath } from "../lib/path-engine";
import { pathYawSweepDeg, sampleStillFrames, stillFrameCount, stillKind } from "../lib/still-frames";
import { fallbackShots } from "../lib/fallbacks";
import space from "../data/space_heritage_hall.json";
import type { CameraPath, SpaceModel } from "../lib/types";

const hall = space as SpaceModel;

function ringPath(turns: number): CameraPath {
  const count = Math.max(8, Math.round(turns * 8));
  const points: CameraPath["start"][] = [];
  for (let i = 0; i <= count; i += 1) {
    const angle = (i / count) * Math.PI * 2 * turns;
    points.push([Math.cos(angle) * 6, 1.6, Math.sin(angle) * 6]);
  }
  return {
    start: points[0],
    waypoints: points.slice(1, -1),
    end: points[points.length - 1],
    target: [0, 1.2, 0],
  };
}

describe("still frame sampling", () => {
  it("exports start and end frames for linear moves", () => {
    const dolly = fallbackShots("scene_02", hall)[0];
    expect(stillKind(dolly)).toBe("linear");
    expect(sampleStillFrames(dolly).map((item) => item.label)).toEqual([
      "start",
      "end",
    ]);
  });

  it("takes 3 time-even frames for orbits within 360 degrees", () => {
    const orbit = applyPathToShot(fallbackShots("scene_02", hall)[2], hall);
    expect(stillKind(orbit)).toBe("curve");
    expect(pathYawSweepDeg(orbit.path)).toBeLessThanOrEqual(360);
    expect(sampleStillFrames(orbit).map((item) => item.t)).toEqual([0, 0.5, 1]);
  });

  it("takes 3 frames per 360 degrees for longer orbits", () => {
    const shot = applyPathToShot(fallbackShots("scene_02", hall)[2], hall);
    const spun = {
      ...shot,
      path: ringPath(2.2),
      movement: { ...shot.movement, type: "ORBIT" },
    };
    expect(pathYawSweepDeg(spun.path)).toBeGreaterThan(360);
    expect(stillFrameCount(spun)).toBe(9);
    expect(sampleStillFrames(spun)).toHaveLength(9);
    expect(sampleStillFrames(spun)[0].t).toBe(0);
    expect(sampleStillFrames(spun)[8].t).toBe(1);
  });

  it("keeps generated orbit paths inside the hall", () => {
    const orbit = fallbackShots("scene_02", hall)[2];
    const path = buildPath(orbit, hall);
    expect(path.start[0]).toBeGreaterThanOrEqual(hall.bounds.min[0]);
  });
});
