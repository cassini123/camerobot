import { describe, expect, it } from "vitest";
import {
  CORNER_REL_LIMIT,
  CORNER_VAR_LIMIT,
  boxToXyxy,
  cornerRelErrors,
  droneCommand,
  matchFailText,
  pairObjects,
  sceneObjects,
  shotName,
  variance,
} from "@/lib/flyvision-sequence";
import type { YoloDet } from "@/lib/yolo";

function det(label: string, x: number, y: number, w: number, h: number): YoloDet {
  return { label, score: 0.9, box: { x, y, w, h } };
}

describe("sequence objects", () => {
  it("keeps objects that cover at least 1% of the frame", () => {
    const objects = sceneObjects([
      det("person", 0.2, 0.2, 0.3, 0.4),
      det("bottle", 0.8, 0.8, 0.04, 0.04),
    ]);
    expect(objects.map((item) => item.label)).toEqual(["person"]);
    expect(objects[0].xyxy).toEqual({ x1: 0.2, y1: 0.2, x2: 0.5, y2: 0.6 });
  });

  it("converts xywh to xyxy", () => {
    expect(boxToXyxy({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toEqual({
      x1: 0.1,
      y1: 0.2,
      x2: 0.4,
      y2: 0.6,
    });
  });
});

describe("10% corner + variance gate", () => {
  it("passes a small consistent shift under 10%", () => {
    const refs = sceneObjects([det("person", 0.3, 0.2, 0.2, 0.5)]);
    const lives = sceneObjects([det("person", 0.31, 0.21, 0.2, 0.5)]);
    const match = pairObjects(refs, lives);
    expect(match.ok).toBe(true);
    expect(match.maxAbsRel).toBeLessThanOrEqual(CORNER_REL_LIMIT);
    expect(match.variance).toBeLessThanOrEqual(CORNER_VAR_LIMIT);
  });

  it("fails when one corner is more than 10% of the box", () => {
    const refs = sceneObjects([det("person", 0.3, 0.2, 0.2, 0.5)]);
    const lives = sceneObjects([det("person", 0.42, 0.2, 0.2, 0.5)]);
    const match = pairObjects(refs, lives);
    expect(match.cornersOk).toBe(false);
    expect(match.ok).toBe(false);
  });

  it("uses variance to reject objects that disagree", () => {
    const errs = [0.09, 0.09, -0.09, -0.09, 0.08, -0.08, 0.01, -0.01];
    expect(variance(errs)).toBeGreaterThan(CORNER_VAR_LIMIT);
    const tight = cornerRelErrors(
      { x1: 0.3, y1: 0.2, x2: 0.5, y2: 0.7 },
      { x1: 0.302, y1: 0.202, x2: 0.502, y2: 0.702 },
    );
    expect(variance(tight)).toBeLessThan(CORNER_VAR_LIMIT);
  });

  it("names shots a1 / b2", () => {
    expect(shotName("a", 0)).toBe("a1");
    expect(shotName("b", 1)).toBe("b2");
  });

  it("explains a failed match instead of staying silent", () => {
    const refs = sceneObjects([det("person", 0.3, 0.2, 0.2, 0.5), det("chair", 0.7, 0.4, 0.2, 0.3)]);
    const lives = sceneObjects([det("person", 0.5, 0.2, 0.2, 0.5)]);
    const match = pairObjects(refs, lives);
    expect(match.ok).toBe(false);
    expect(matchFailText(match)).toMatch(/缺 chair/);
    expect(matchFailText(match)).toMatch(/角点|方差/);
  });

  it("returns an empty fail text when the pair already passed", () => {
    const refs = sceneObjects([det("person", 0.3, 0.2, 0.2, 0.5)]);
    const lives = sceneObjects([det("person", 0.31, 0.21, 0.2, 0.5)]);
    expect(matchFailText(pairObjects(refs, lives))).toBe("");
  });
});

describe("drone command", () => {
  it("asks the body to back up and the gimbal to yaw left when the subject is too close and left", () => {
    const refs = sceneObjects([det("person", 0.4, 0.25, 0.2, 0.45)]);
    const lives = sceneObjects([det("person", 0.18, 0.1, 0.36, 0.75)]);
    const cmd = droneCommand(refs, lives, { distanceM: 2, hfovDeg: 66, aspect: 4 / 3 });
    expect(cmd.forwardM).toBeLessThan(0);
    expect(cmd.rightM).toBeLessThan(0);
    expect(cmd.yawDeg).toBeLessThan(0);
    expect(cmd.cues.join("")).toMatch(/近了|偏左/);
    expect(cmd.text).toMatch(/机身往/);
  });
});
