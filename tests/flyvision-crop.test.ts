import { describe, expect, it } from "vitest";
import { containBox, fittedCrop, imageAspect } from "@/lib/flyvision-crop";

describe("fitted crop", () => {
  it("returns the full frame when aspect is free", () => {
    expect(fittedCrop(4000, 2000, null)).toEqual({ x: 0, y: 0, w: 4000, h: 2000 });
  });

  it("cuts a wide still down to 4:3, centered", () => {
    const crop = fittedCrop(4000, 2000, 4 / 3, 0.5, 0.5, 1);
    expect(crop.h).toBe(2000);
    expect(crop.w).toBe(Math.round(2000 * (4 / 3)));
    expect(crop.x).toBe(Math.round((4000 - crop.w) / 2));
    expect(crop.y).toBe(0);
    expect(imageAspect(crop.w, crop.h)).toBeCloseTo(4 / 3, 3);
  });

  it("cuts a tall still down to 16:9", () => {
    const crop = fittedCrop(1080, 1920, 16 / 9, 0.5, 0.5, 1);
    expect(crop.w).toBe(1080);
    expect(crop.h).toBe(Math.round(1080 / (16 / 9)));
    expect(crop.x).toBe(0);
  });

  it("pans to the left edge", () => {
    const crop = fittedCrop(4000, 2000, 1, 0, 0.5, 1);
    expect(crop.x).toBe(0);
    expect(crop.w).toBe(2000);
  });

  it("zooms in and keeps the window inside the image", () => {
    const crop = fittedCrop(4000, 2000, 4 / 3, 0.5, 0.5, 2);
    expect(crop.w).toBeLessThan(2000 * (4 / 3));
    expect(crop.x + crop.w).toBeLessThanOrEqual(4000);
    expect(crop.y + crop.h).toBeLessThanOrEqual(2000);
  });
});

describe("contain box", () => {
  it("letterboxes a wide image in a square view", () => {
    const box = containBox(1600, 900, 400, 400);
    expect(box.w).toBeCloseTo(400);
    expect(box.h).toBeCloseTo(225);
    expect(box.y).toBeCloseTo(87.5);
  });
});
