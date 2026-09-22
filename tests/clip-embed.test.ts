import { clipTensor, l2Normalize } from "@/lib/clip-embed";
import { cosineSimilarity, scoreMatch, solidRgb } from "@/lib/flyvision-match";
import { describe, expect, it } from "vitest";

describe("MobileCLIP embedding helpers", () => {
  it("builds a 1x3x256x256 tensor from RGB", () => {
    const tensor = clipTensor(solidRgb(40, 30, [20, 80, 180]));
    expect(tensor.length).toBe(3 * 256 * 256);
    expect(tensor[0]).toBeCloseTo(20 / 255);
    expect(tensor[256 * 256]).toBeCloseTo(80 / 255);
  });

  it("uses CLIP cosine as the main match term and keeps hist as color", () => {
    const hist = [1, 0, 0, 0];
    const other = [0, 1, 0, 0];
    const current = {
      histogram: hist,
      subjectCenter: [0.5, 0.5] as [number, number],
      subjectArea: 0.1,
    };
    const reference = {
      histogram: other,
      subjectCenter: [0.5, 0.5] as [number, number],
      subjectArea: 0.1,
    };
    const withClip = scoreMatch(current, reference, 0.5, { clipCosine: 0.95 });
    const without = scoreMatch(current, reference, 0.5);
    expect(withClip.clipSimilarity).toBeCloseTo(0.95);
    expect(withClip.similarity).toBeGreaterThan(without.similarity);
    expect(withClip.histogramSimilarity).toBeLessThan(0.7);
  });

  it("maps identical L2 vectors to a high cosine", () => {
    const vector = l2Normalize([0.2, 0.4, 0.4, 0.8]);
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1);
  });
});
