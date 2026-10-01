import {
  compareSpatial,
  DEFAULT_ESP_CAM_STREAM_URL,
  ESP32CAM_HFOV_DEG,
  estimateSpatial,
  formatDistance,
  formatMeters,
  formatMetersHint,
  hfovForSource,
  httpsBlocksHttpStream,
  inferVisibleSize,
  judgeGeometry,
  normalizeStreamUrl,
  SpatialSmoother,
  WEBCAM_HFOV_DEG,
} from "@/lib/spatial";
import { CAPTURE_GO, CONTINUE_FOLLOW, nextDecision } from "@/lib/flyvision-match";
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

  it("summarizes live vs reference without publishing meters as the cue", () => {
    const reference = estimateSpatial("person", { x: 0.4, y: 0.2, w: 0.18, h: 0.45 }, 4 / 3)!;
    const live = estimateSpatial("person", { x: 0.55, y: 0.15, w: 0.28, h: 0.65 }, 4 / 3)!;
    const delta = compareSpatial(reference, live);
    expect(delta.closerM).toBeGreaterThan(0);
    expect(delta.rightM).toBeGreaterThan(0);
    expect(delta.summary).toContain("近了");
    expect(delta.summary).toContain("偏右");
    expect(delta.summary).not.toMatch(/\d+(\.\d+)? m/);
    expect(delta.metersHint).toContain("约");
    expect(delta.metersHint).toContain("不可靠");
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

describe("occupancy heading gate vs meters", () => {
  it("calls a larger live box 近了 from height ratio, not from pinhole meters", () => {
    const reference = { x: 0.4, y: 0.3, w: 0.12, h: 0.22 };
    const live = { x: 0.38, y: 0.18, w: 0.16, h: 0.42 };
    const gate = judgeGeometry(reference, live);
    expect(gate.rangeCue).toBe("近了");
    expect(gate.occupancyOk).toBe(false);
    expect(gate.geometryOk).toBe(false);
    expect(gate.summary).not.toMatch(/\d+(\.\d+)? m/);
  });

  it("calls a smaller live box 远了", () => {
    const gate = judgeGeometry(
      { x: 0.35, y: 0.15, w: 0.28, h: 0.6 },
      { x: 0.42, y: 0.32, w: 0.12, h: 0.22 },
    );
    expect(gate.rangeCue).toBe("远了");
    expect(gate.headingCue).toBe("居中");
  });

  it("flags 偏右 from center offset even when meters would be a different story", () => {
    const ref = { x: 0.4, y: 0.2, w: 0.2, h: 0.5 };
    const live = { x: 0.62, y: 0.2, w: 0.2, h: 0.5 };
    const gate = judgeGeometry(ref, live);
    expect(gate.headingCue).toBe("偏右");
    expect(gate.rangeCue).toBe("远近合适");
    expect(gate.offsetOk).toBe(false);
    expect(gate.geometryOk).toBe(false);
    expect(ESP32CAM_HFOV_DEG).not.toBe(WEBCAM_HFOV_DEG);
  });

  it("passes when occupancy and heading stay in band", () => {
    const ref = { x: 0.4, y: 0.25, w: 0.2, h: 0.5 };
    const live = { x: 0.41, y: 0.26, w: 0.21, h: 0.51 };
    const gate = judgeGeometry(ref, live);
    expect(gate.geometryOk).toBe(true);
    expect(gate.summary).toContain("远近合适");
    expect(gate.summary).toContain("居中");
  });

  it("does not emit CAPTURE_GO when CLIP matches but occupancy is out of band", () => {
    const far = judgeGeometry(
      { x: 0.4, y: 0.2, w: 0.2, h: 0.5 },
      { x: 0.4, y: 0.35, w: 0.08, h: 0.18 },
    );
    expect(far.geometryOk).toBe(false);
    const step = nextDecision(true, far.geometryOk, 3, 4);
    expect(step.decision).toBe(CONTINUE_FOLLOW);
    expect(step.nextCount).toBe(0);
  });

  it("emits CAPTURE_GO only after occupancy+heading hold", () => {
    const ok = judgeGeometry(
      { x: 0.4, y: 0.25, w: 0.2, h: 0.5 },
      { x: 0.4, y: 0.25, w: 0.2, h: 0.5 },
    );
    let count = 0;
    let last = CONTINUE_FOLLOW;
    for (let i = 0; i < 4; i += 1) {
      const step = nextDecision(true, ok.geometryOk, count, 4);
      count = step.nextCount;
      last = step.decision;
    }
    expect(last).toBe(CAPTURE_GO);
  });

  it("marks pinhole meters as a low-authority hint", () => {
    const fix = estimateSpatial("person", { x: 0.44, y: 0.28, w: 0.07, h: 0.26 }, 16 / 9, 70)!;
    expect(formatDistance(fix).startsWith("约")).toBe(true);
    expect(formatMetersHint(fix)).toContain("不可靠");
  });
});

describe("CAM live source vs webcam FOV", () => {
  it("does not silently reuse the 70° laptop guess for OV2640", () => {
    expect(ESP32CAM_HFOV_DEG).not.toBe(WEBCAM_HFOV_DEG);
    expect(hfovForSource("esp-cam", 70, 66)).toBe(66);
    expect(hfovForSource("webcam", 70, 66)).toBe(70);
    expect(hfovForSource("idle", 70, 66)).toBe(70);
  });

  it("keeps the default CAM stream URL and does not break the webcam path", () => {
    expect(DEFAULT_ESP_CAM_STREAM_URL).toBe("http://192.168.4.1/stream");
    expect(normalizeStreamUrl("")).toBe(DEFAULT_ESP_CAM_STREAM_URL);
    expect(normalizeStreamUrl("  http://192.168.4.1/stream  ")).toBe(
      "http://192.168.4.1/stream",
    );
    expect(httpsBlocksHttpStream("https:", DEFAULT_ESP_CAM_STREAM_URL)).toBe(true);
    expect(httpsBlocksHttpStream("http:", DEFAULT_ESP_CAM_STREAM_URL)).toBe(false);
    expect(hfovForSource("webcam", WEBCAM_HFOV_DEG, ESP32CAM_HFOV_DEG)).toBe(WEBCAM_HFOV_DEG);
  });
});
