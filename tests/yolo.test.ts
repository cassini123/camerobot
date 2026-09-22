import { boxIou, decodeYoloOutput, nms, primarySubject, type YoloDet } from "@/lib/yolo";
import { describe, expect, it } from "vitest";

describe("yolo decode / nms", () => {
  it("keeps the higher-score box when overlap is high", () => {
    const kept = nms(
      [
        { label: "person", score: 0.9, box: { x: 0.1, y: 0.1, w: 0.4, h: 0.5 } },
        { label: "person", score: 0.4, box: { x: 0.12, y: 0.12, w: 0.4, h: 0.5 } },
        { label: "car", score: 0.8, box: { x: 0.7, y: 0.2, w: 0.2, h: 0.2 } },
      ],
      0.45,
    );
    expect(kept.map((item) => item.label)).toEqual(["person", "car"]);
  });

  it("prefers person as the primary subject", () => {
    const pick = primarySubject([
      { label: "car", score: 0.99, box: { x: 0, y: 0, w: 0.9, h: 0.9 } },
      { label: "person", score: 0.6, box: { x: 0.2, y: 0.2, w: 0.2, h: 0.4 } },
    ]);
    expect(pick?.label).toBe("person");
  });

  it("decodes a channel-major YOLOv8 tensor into a person box", () => {
    const anchors = 2;
    const channels = 84;
    const data = new Float32Array(channels * anchors);
    // anchor 0: person at center of 640 letterbox, size 128, no pad, scale=1, image 640x640
    data[0 * anchors + 0] = 320;
    data[1 * anchors + 0] = 320;
    data[2 * anchors + 0] = 128;
    data[3 * anchors + 0] = 128;
    data[4 * anchors + 0] = 0.92;
    const dets = decodeYoloOutput(data, [1, 84, anchors], 640, 640, 1, 0, 0, 0.3);
    expect(dets[0]?.label).toBe("person");
    expect(dets[0]?.score).toBeGreaterThan(0.9);
    expect(dets[0]?.box.w).toBeCloseTo(128 / 640, 2);
  });

  it("reports low iou for separated boxes", () => {
    expect(
      boxIou(
        { x: 0, y: 0, w: 0.2, h: 0.2 },
        { x: 0.7, y: 0.7, w: 0.2, h: 0.2 },
      ),
    ).toBe(0);
  });
});

describe("yolo types compile", () => {
  it("builds a detection object", () => {
    const det: YoloDet = {
      label: "person",
      score: 0.8,
      box: { x: 0.1, y: 0.1, w: 0.2, h: 0.3 },
    };
    expect(det.label).toBe("person");
  });
});
