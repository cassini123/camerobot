import { describe, expect, it } from "vitest";
import { applyPathToShot, buildPath, normalizeMovement, samplePath } from "../lib/path-engine";
import { deepMerge, setPath } from "../lib/patch";
import { fallbackShots, heuristicDirector } from "../lib/fallbacks";
import space from "../data/space_heritage_hall.json";
import type { SpaceModel } from "../lib/types";

const hall = space as SpaceModel;

describe("path engine", () => {
  it("normalizes movement aliases", () => {
    expect(normalizeMovement("dolly in")).toBe("DOLLY_IN");
    expect(normalizeMovement("track")).toBe("TRACKING");
  });

  it("builds seven movement types inside bounds", () => {
    const [establishing] = fallbackShots("scene_02", hall);
    const types = [
      "STATIC",
      "DOLLY_IN",
      "DOLLY_OUT",
      "TRACKING",
      "PAN",
      "ORBIT",
      "FOLLOW",
    ] as const;
    for (const type of types) {
      const path = buildPath(
        { ...establishing, movement: { ...establishing.movement, type } },
        hall,
      );
      expect(path.start[0]).toBeGreaterThanOrEqual(hall.bounds.min[0]);
      expect(path.start[0]).toBeLessThanOrEqual(hall.bounds.max[0]);
      expect(path.end[2]).toBeLessThanOrEqual(hall.bounds.max[2]);
      const mid = samplePath(path, 0.5);
      expect(mid).toHaveLength(3);
    }
  });

  it("applyPathToShot writes camera start", () => {
    const shots = fallbackShots("scene_02", hall);
    const next = applyPathToShot(shots[1], hall);
    expect(next.path.waypoints.length).toBeGreaterThan(0);
    expect(next.camera.position).toEqual(next.path.start);
  });
});

describe("patch merge", () => {
  it("merges nested camera height", () => {
    const merged = deepMerge(
      { camera: { height: 1.6, lens: 35 }, movement: { type: "DOLLY_IN" } },
      { camera: { height: 1.1 }, movement: { type: "TRACKING" } },
    );
    expect(merged.camera.height).toBe(1.1);
    expect(merged.camera.lens).toBe(35);
    expect(merged.movement.type).toBe("TRACKING");
  });

  it("setPath updates duration", () => {
    const next = setPath({ movement: { duration: 5 } }, "movement.duration", 8);
    expect(next.movement).toEqual({ duration: 8 });
  });
});

describe("director heuristic", () => {
  it("maps the demo prompt to slower tracking", () => {
    const shot = fallbackShots("scene_02", hall)[1];
    const result = heuristicDirector(
      "让人物走慢一点，镜头从人物侧后方跟拍，最后绕到建筑正面。",
      shot,
    );
    expect(result.changes.some((item) => item.key === "movement.speed")).toBe(true);
    expect(JSON.stringify(result.patch)).toMatch(/FOLLOW|TRACKING/);
  });
});
