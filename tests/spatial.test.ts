import { compareSpatial, estimateSpatial, formatMeters } from "@/lib/spatial";
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
});
