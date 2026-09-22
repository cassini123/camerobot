import {
  compareSpatial,
  estimateSpatial,
  formatMeters,
  inferVisibleSize,
  SpatialSmoother,
} from "@/lib/spatial";
import { describe, expect, it } from "vitest";

describe("spatial pinhole", () => {
  it("estimates a nearer distance when the person box is larger", () => {
    const far = estimateSpatial("person", { x: 0.4, y: 0.3, w: 0.12, h: 0.22 }, 4 / 3);
    const near = estimateSpatial("person", { x: 0.35, y: 0.15, w: 0.28, h: 0.6 }, 4 / 3);
    expect(far).not.toBeNull();
    expect(near).not.toBeNull();
    expect(near!.distanceM).toBeLessThan(far!.distanceM);
    expect(["near", "mid"]).toContain(near!.range);
  });

  it("puts a left-of-center box on the left", () => {
    const fix = estimateSpatial("person", { x: 0.05, y: 0.2, w: 0.18, h: 0.5 }, 4 / 3);
    expect(fix?.heading).toBe("left");
    expect(fix!.rightM).toBeLessThan(0);
  });

  it("summarizes live vs reference in meters", () => {
    const reference = estimateSpatial("person", { x: 0.4, y: 0.2, w: 0.18, h: 0.45 }, 4 / 3)!;
    const live = estimateSpatial("person", { x: 0.55, y: 0.15, w: 0.28, h: 0.65 }, 4 / 3)!;
    const delta = compareSpatial(reference, live);
    expect(delta.closerM).toBeGreaterThan(0);
    expect(delta.rightM).toBeGreaterThan(0);
    expect(delta.summary).toContain("近了");
    expect(delta.summary).toContain("偏右");
  });

  it("returns null without a known real height", () => {
    expect(estimateSpatial("toaster", { x: 0.2, y: 0.2, w: 0.2, h: 0.2 })).toBeNull();
  });

  it("formats meters compactly", () => {
    expect(formatMeters(1.24)).toBe("1.2 m");
    expect(formatMeters(12.6)).toBe("13 m");
  });

  it("treats a webcam bust as about a meter, not five", () => {
    const bust = estimateSpatial(
      "person",
      { x: 0.3, y: 0.18, w: 0.4, h: 0.58 },
      16 / 9,
      70,
    );
    expect(bust).not.toBeNull();
    expect(bust!.crop).toBe("bust");
    expect(bust!.distanceM).toBeGreaterThan(0.45);
    expect(bust!.distanceM).toBeLessThan(1.6);
    expect(bust!.range).toBe("near");
  });

  it("treats a tight head crop as arm's-length, not a hallway", () => {
    const head = estimateSpatial(
      "person",
      { x: 0.36, y: 0.22, w: 0.28, h: 0.36 },
      16 / 9,
      70,
    );
    expect(head!.crop).toBe("head");
    expect(head!.distanceM).toBeGreaterThan(0.3);
    expect(head!.distanceM).toBeLessThan(1.2);
  });

  it("keeps a distant full-body figure several meters out", () => {
    const full = estimateSpatial(
      "person",
      { x: 0.44, y: 0.28, w: 0.07, h: 0.26 },
      16 / 9,
      70,
    );
    expect(full!.crop).toBe("full");
    expect(full!.distanceM).toBeGreaterThan(3);
    expect(full!.distanceM).toBeLessThan(10);
  });

  it("does not use standing height when the box fills the frame", () => {
    const clipped = inferVisibleSize("person", { x: 0.18, y: 0.0, w: 0.64, h: 1.0 });
    expect(clipped?.heightUsable).toBe(false);
    expect(clipped?.crop).toMatch(/bust|waist|knee/);
    const fix = estimateSpatial("person", { x: 0.18, y: 0.0, w: 0.64, h: 1.0 }, 16 / 9, 70);
    expect(fix!.distanceM).toBeLessThan(2.2);
  });

  it("maps image x to tan(angle), not tan(tan(angle))", () => {
    const fix = estimateSpatial("person", { x: 0.02, y: 0.25, w: 0.1, h: 0.4 }, 16 / 9, 70)!;
    const cx = 0.02 + 0.1 / 2;
    const hfov = (70 * Math.PI) / 180;
    const expected = fix.distanceM * (cx - 0.5) * 2 * Math.tan(hfov / 2);
    expect(fix.rightM).toBeCloseTo(expected, 5);
    expect(Math.abs(fix.rightM)).toBeLessThan(
      Math.abs(fix.distanceM * Math.tan((cx - 0.5) * 2 * Math.tan(hfov / 2))),
    );
  });

  it("smooths jittery live distances with a median window", () => {
    const smooth = new SpatialSmoother(5);
    const a = estimateSpatial("person", { x: 0.32, y: 0.2, w: 0.36, h: 0.55 }, 16 / 9, 70)!;
    const b = estimateSpatial("person", { x: 0.3, y: 0.18, w: 0.4, h: 0.58 }, 16 / 9, 70)!;
    const spike = estimateSpatial("person", { x: 0.28, y: 0.1, w: 0.2, h: 0.3 }, 16 / 9, 70)!;
    smooth.push(a);
    smooth.push(b);
    const out = smooth.push(spike);
    const raw = [a.distanceM, b.distanceM, spike.distanceM].sort((x, y) => x - y);
    expect(out!.distanceM).toBeCloseTo(raw[1], 5);
  });
});
