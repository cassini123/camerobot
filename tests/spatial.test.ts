import {
  compareSpatial,
  estimateSpatial,
  formatMeters,
  inferVisibleSize,
  SpatialSmoother,
  VideoSpatialTracker,
  type SpatialDet,
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

  it("scales distance when the user sets a taller person height", () => {
    const box = { x: 0.44, y: 0.28, w: 0.07, h: 0.26 };
    const avg = estimateSpatial("person", box, { aspect: 16 / 9, personHeightM: 1.7 })!;
    const tall = estimateSpatial("person", box, { aspect: 16 / 9, personHeightM: 1.9 })!;
    expect(tall.distanceM).toBeGreaterThan(avg.distanceM);
  });

  it("drops a frame-filling truncated box when rejectPartial is on", () => {
    const box = { x: 0.18, y: 0.0, w: 0.64, h: 1.0 };
    expect(estimateSpatial("person", box, { aspect: 16 / 9, rejectPartial: true })).toBeNull();
    expect(estimateSpatial("person", box, { aspect: 16 / 9, rejectPartial: false })).not.toBeNull();
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

describe("video spatial tracker", () => {
  const opts = { aspect: 16 / 9, hfovDeg: 70 };

  function person(box: SpatialDet["box"], score = 0.9): SpatialDet {
    return { label: "person", score, box };
  }

  it("keeps tracking the first person when a larger box appears", () => {
    const tracker = new VideoSpatialTracker();
    const left = person({ x: 0.08, y: 0.22, w: 0.16, h: 0.42 });
    const rightSmall = person({ x: 0.68, y: 0.28, w: 0.1, h: 0.28 }, 0.8);
    const first = tracker.push([left, rightSmall], opts, 0);
    expect(first.trackId).not.toBeNull();
    expect(first.det?.box.x).toBeCloseTo(0.08, 2);

    const rightHuge = person({ x: 0.58, y: 0.08, w: 0.36, h: 0.82 }, 0.99);
    const leftMoved = person({ x: 0.1, y: 0.2, w: 0.17, h: 0.44 });
    const later = tracker.push([rightHuge, leftMoved], opts, 360);
    expect(later.trackId).toBe(first.trackId);
    expect(later.det?.box.x).toBeLessThan(0.25);
    expect(later.det?.box.x).toBeGreaterThan(0.05);
  });

  it("does not flip heading when the box jitters around the threshold", () => {
    const tracker = new VideoSpatialTracker();
    const frames = [
      { x: 0.47, y: 0.2, w: 0.2, h: 0.5 },
      { x: 0.485, y: 0.2, w: 0.2, h: 0.5 },
      { x: 0.468, y: 0.205, w: 0.2, h: 0.49 },
      { x: 0.49, y: 0.19, w: 0.2, h: 0.51 },
      { x: 0.47, y: 0.2, w: 0.2, h: 0.5 },
      { x: 0.482, y: 0.2, w: 0.2, h: 0.5 },
      { x: 0.472, y: 0.2, w: 0.2, h: 0.5 },
    ];
    const headings: string[] = [];
    const rawHeadings = new Set<string>();
    frames.forEach((box, index) => {
      const raw = estimateSpatial("person", box, opts)!;
      rawHeadings.add(raw.heading);
      const out = tracker.push([person(box)], opts, index * 360);
      headings.push(out.spatial!.heading);
    });
    expect(rawHeadings.size).toBeGreaterThan(1);
    expect(new Set(headings.slice(2)).size).toBe(1);
  });

  it("says 近了 when the tracked box grows versus a frozen reference", () => {
    const tracker = new VideoSpatialTracker();
    const far = { x: 0.42, y: 0.28, w: 0.08, h: 0.26 };
    const reference = estimateSpatial("person", far, opts)!;
    tracker.setReference(reference);
    const heights = [0.28, 0.34, 0.4, 0.48, 0.56, 0.64];
    let last = tracker.push([person(far)], opts, 0);
    heights.forEach((h, index) => {
      const scale = h / 0.26;
      const w = 0.08 * scale;
      const box = { x: 0.5 - w / 2, y: 0.55 - h, w, h };
      last = tracker.push([person(box)], opts, (index + 1) * 360);
    });
    expect(last.delta).not.toBeNull();
    expect(last.delta!.closerM).toBeGreaterThan(0.3);
    expect(last.delta!.summary).toContain("近了");
    expect(last.spatial!.distanceM).toBeLessThan(reference.distanceM - 0.25);
  });

  it("does not flip 近了/远了 on box-height flicker", () => {
    const tracker = new VideoSpatialTracker();
    const base = { x: 0.36, y: 0.22, w: 0.22, h: 0.48 };
    const reference = estimateSpatial("person", base, opts)!;
    tracker.setReference(reference);
    const heights = [0.48, 0.5, 0.46, 0.49, 0.47, 0.48, 0.51, 0.47, 0.48];
    const summaries: string[] = [];
    heights.forEach((h, index) => {
      const w = 0.22 * (h / 0.48);
      const box = { x: 0.47 - w / 2, y: 0.46 - h / 2, w, h };
      const out = tracker.push([person(box)], opts, index * 360);
      summaries.push(out.delta?.summary ?? "");
    });
    const later = summaries.slice(3);
    expect(later.every((text) => text.includes("距离接近") || !text.includes("远了"))).toBe(true);
    expect(later.some((text) => text.includes("近了") && text.includes("远了"))).toBe(false);
    const flipped = later.filter((text) => text.includes("近了") || text.includes("远了"));
    expect(flipped.length).toBeLessThan(3);
  });
});
