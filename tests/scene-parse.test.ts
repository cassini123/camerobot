import { describe, expect, it } from "vitest";
import { clusterPointCloud, fitPositions, guessType, likelyZUp, rotateZUpToYUp } from "../lib/point-cluster";
import { nameColor } from "../lib/color-name";
import { exampleSpace } from "../lib/space-objects";
import { resolveSpaceObject } from "../lib/space-objects";
import hall from "../data/space_heritage_hall.json";
import type { SpaceModel } from "../lib/types";

describe("point clustering", () => {
  it("separates two colored blobs", () => {
    const positions = new Float32Array([
      0, 0.5, 0, 0.1, 0.5, 0, 0, 0.6, 0.1,
      4, 0.5, 0, 4.1, 0.5, 0, 4, 0.6, 0.1,
    ]);
    const colors = new Float32Array([
      0.9, 0.1, 0.1, 0.9, 0.12, 0.1, 0.88, 0.1, 0.12,
      0.1, 0.2, 0.9, 0.12, 0.2, 0.88, 0.1, 0.22, 0.9,
    ]);
    const clusters = clusterPointCloud(positions, colors, { maxClusters: 8 });
    expect(clusters.length).toBeGreaterThanOrEqual(2);
    const names = clusters.map((item) => item.colorName);
    expect(names).toContain("红");
    expect(names).toContain("蓝");
  });

  it("fits the cloud onto the ground", () => {
    const positions = new Float32Array([10, 20, 30, 12, 24, 32]);
    fitPositions(positions, 16);
    expect(Math.min(positions[1], positions[4])).toBeCloseTo(0, 5);
  });

  it("treats taller Z as Z-up and rotates to Y-up", () => {
    const positions = new Float32Array([0, 0, 0, 1, 0.2, 4]);
    expect(likelyZUp(positions)).toBe(true);
    rotateZUpToYUp(positions);
    expect(positions[4]).toBeCloseTo(4);
    expect(positions[5]).toBeCloseTo(-0.2);
  });

  it("guesses a tall thin volume as a person", () => {
    expect(guessType([0.5, 1.7, 0.4], [0, 0.85, 0], [10, 4, 10])).toBe("person");
  });
});

describe("color names", () => {
  it("maps rgb to a chinese color", () => {
    expect(nameColor(0.9, 0.1, 0.1).zh).toBe("红");
  });
});

describe("nl object resolve", () => {
  it("finds the beige person in the example hall", () => {
    const space = exampleSpace(hall as SpaceModel);
    const hit = resolveSpaceObject(space, "选中米色人物");
    expect(hit?.type).toBe("person");
  });
});
