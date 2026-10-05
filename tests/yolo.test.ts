import { boxIou, decodeYoloOutput, nms, primarySubject, SubjectTracker, YOLO_WASM_PATHS, type YoloDet } from "@/lib/yolo";
import { isLocalOrtPath, ORT_WASM_FILES } from "@/lib/ort-runtime";
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

describe("subject tracker", () => {
  it("keeps the previous person by IoU even if a bigger box appears", () => {
    const tracker = new SubjectTracker(0.3);
    const first: YoloDet = {
      label: "person",
      score: 0.7,
      box: { x: 0.2, y: 0.2, w: 0.2, h: 0.4 },
    };
    tracker.push([first]);
    const jitter: YoloDet = {
      label: "person",
      score: 0.65,
      box: { x: 0.22, y: 0.21, w: 0.21, h: 0.41 },
    };
    const intruder: YoloDet = {
      label: "person",
      score: 0.99,
      box: { x: 0.7, y: 0.1, w: 0.25, h: 0.7 },
    };
    const locked = tracker.push([intruder, jitter]);
    expect(locked).not.toBeNull();
    expect(locked!.box.x).toBeLessThan(0.4);
    expect(boxIou(locked!.box, jitter.box)).toBeGreaterThan(0.5);
  });

  it("falls back to primarySubject when the lock is lost", () => {
    const tracker = new SubjectTracker(0.3);
    tracker.push([
      { label: "person", score: 0.8, box: { x: 0.1, y: 0.1, w: 0.2, h: 0.4 } },
    ]);
    const next = tracker.push([
      { label: "person", score: 0.9, box: { x: 0.7, y: 0.2, w: 0.2, h: 0.5 } },
    ]);
    expect(next?.box.x).toBeGreaterThan(0.5);
  });
});

describe("offline ORT wasm", () => {
  it("loads onnxruntime from the same origin, not a CDN", () => {
    expect(isLocalOrtPath(YOLO_WASM_PATHS)).toBe(true);
    expect(isLocalOrtPath(ORT_WASM_FILES.mjs)).toBe(true);
    expect(isLocalOrtPath(ORT_WASM_FILES.wasm)).toBe(true);
    expect(YOLO_WASM_PATHS).not.toMatch(/jsdelivr|unpkg|googleapis/);
  });
});
