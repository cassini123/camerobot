import { labelShot, labelSimilarity, shotScaleFromBox } from "@/lib/shot-labels";
import { describe, expect, it } from "vitest";

describe("FilmOps-style shot labels", () => {
  it("tags a distant full-body box as a long shot", () => {
    expect(shotScaleFromBox({ x: 0.44, y: 0.28, w: 0.07, h: 0.26 })).toBe("ELS");
  });

  it("tags a webcam bust as MCU and a tight head as CU/ECU", () => {
    expect(labelShot({ x: 0.3, y: 0.18, w: 0.4, h: 0.58 }).scale).toBe("MCU");
    expect(["CU", "ECU"]).toContain(labelShot({ x: 0.36, y: 0.22, w: 0.28, h: 0.36 }).scale);
  });

  it("marks a centered subject as center / vertical", () => {
    const labels = labelShot({ x: 0.38, y: 0.28, w: 0.24, h: 0.44 });
    expect(labels.tags).toContain("center");
  });

  it("gives a higher label score when scale and tags match", () => {
    const reference = labelShot({ x: 0.3, y: 0.18, w: 0.4, h: 0.58 });
    const same = labelShot({ x: 0.32, y: 0.2, w: 0.38, h: 0.56 });
    const far = labelShot({ x: 0.44, y: 0.28, w: 0.07, h: 0.26 });
    expect(labelSimilarity(same, reference)).toBeGreaterThan(labelSimilarity(far, reference));
  });
});
