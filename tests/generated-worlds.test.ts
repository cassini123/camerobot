import { describe, expect, it } from "vitest";
import { cinpathHrefForAsset } from "../lib/library-types";
import { bundledLibraryAssets, GENERATED_WORLDS, mergeLibraryAssets } from "../lib/generated-worlds";
import { HALL_HERO, heroView } from "../lib/view-frame";
import type { SpaceModel } from "../lib/types";

const hall: SpaceModel = {
  space_id: "hall",
  model: "hall",
  kind: "example",
  bounds: { min: [-10, 0, -10], max: [10, 8, 20] },
  objects: [],
  zones: [],
};

const upload: SpaceModel = {
  space_id: "space_upload",
  model: "fjord.spz",
  kind: "upload",
  bounds: { min: [-8, 0, -8], max: [8, 8, 8] },
  objects: [],
  zones: [],
};

describe("generated worlds catalog", () => {
  it("ships ten worlds with pano plus ply/spz", () => {
    expect(GENERATED_WORLDS).toHaveLength(10);
    for (const world of GENERATED_WORLDS) {
      expect(world.pano).toMatch(/^\/library\/worlds\/.+\.jpg$/);
      expect(world.plyUrl).toContain(".ply");
      expect(world.spzUrl).toContain(".spz");
    }
    const assets = bundledLibraryAssets();
    expect(assets.filter((item) => item.kind === "image")).toHaveLength(10);
    expect(assets.filter((item) => item.kind === "scene")).toHaveLength(10);
  });

  it("keeps user uploads when seeding bundled worlds", () => {
    const merged = mergeLibraryAssets([
      {
        id: "user-1",
        name: "mine.ply",
        kind: "scene",
        source: "upload",
        sizeLabel: "1 MB",
        createdAt: 1,
      },
    ]);
    expect(merged.some((item) => item.id === "world-fjord")).toBe(true);
    expect(merged.some((item) => item.id === "user-1")).toBe(true);
  });

  it("opens library scenes in CinPath by id, including pano cards", () => {
    expect(cinpathHrefForAsset({ id: "world-fjord", kind: "scene" })).toBe(
      "/yunjing/cinpath?scene=world-fjord",
    );
    expect(cinpathHrefForAsset({ id: "world-fjord-pano", kind: "image" })).toBe(
      "/yunjing/cinpath?scene=world-fjord",
    );
    expect(cinpathHrefForAsset({ id: "ref-1", kind: "image" })).toBeNull();
  });
});

describe("hero view", () => {
  it("keeps the hall camera for the example space", () => {
    expect(heroView(hall)).toEqual(HALL_HERO);
  });

  it("looks into a fitted splat from an elevated establishing point", () => {
    const view = heroView(upload);
    expect(view.target[1]).toBeGreaterThan(0);
    expect(view.position[2]).toBeGreaterThan(view.target[2]);
    expect(view.position[1]).toBeGreaterThan(view.target[1]);
  });
});
