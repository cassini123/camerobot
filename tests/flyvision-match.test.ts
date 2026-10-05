import {
  histogramCorrelation,
  hsvHistogram,
  judgeComposition,
  nextDecision,
  scoreMatch,
  solidRgb,
  CAPTURE_GO,
  CONTINUE_FOLLOW,
} from "@/lib/flyvision-match";
import { describe, expect, it } from "vitest";

describe("flyvision browser matcher", () => {
  it("ranks similar colors above dissimilar ones", () => {
    const warm = hsvHistogram(solidRgb(32, 32, [180, 120, 60]));
    const close = hsvHistogram(solidRgb(32, 32, [176, 118, 58]));
    const cold = hsvHistogram(solidRgb(32, 32, [40, 80, 180]));
    expect(histogramCorrelation(warm, close)).toBeGreaterThan(0.9);
    expect(histogramCorrelation(warm, close)).toBeGreaterThan(
      histogramCorrelation(warm, cold) + 0.2,
    );
  });

  it("marks composition ok near the shot target", () => {
    const ok = judgeComposition({ x: 0.3, y: 0.27, w: 0.16, h: 0.46 }, [0.38, 0.5]);
    expect(ok.compositionOk).toBe(true);
    const miss = judgeComposition({ x: 0.72, y: 0.0, w: 0.16, h: 0.46 }, [0.38, 0.5]);
    expect(miss.compositionOk).toBe(false);
  });

  it("emits CAPTURE_GO after enough ready frames", () => {
    let count = 0;
    let last = CONTINUE_FOLLOW;
    for (let i = 0; i < 3; i += 1) {
      const step = nextDecision(true, true, count, 3);
      count = step.nextCount;
      last = step.decision;
    }
    expect(last).toBe(CAPTURE_GO);
  });

  it("keeps following when the scene does not match", () => {
    const step = nextDecision(false, true, 4, 3);
    expect(step.decision).toBe(CONTINUE_FOLLOW);
    expect(step.nextCount).toBe(0);
  });

  it("scores identical features as a scene match", () => {
    const hist = hsvHistogram(solidRgb(16, 16, [120, 90, 40]));
    const features = { histogram: hist, subjectCenter: [0.38, 0.5] as [number, number], subjectArea: 0.07 };
    const score = scoreMatch(features, features, 0.85);
    expect(score.sceneMatch).toBe(true);
    expect(score.similarity).toBeGreaterThan(0.99);
  });

  it("keeps box-center composition independent of embedding similarity", () => {
    const onTarget = judgeComposition({ x: 0.3, y: 0.27, w: 0.16, h: 0.46 }, [0.38, 0.5]);
    const offTarget = judgeComposition({ x: 0.72, y: 0.0, w: 0.16, h: 0.46 }, [0.38, 0.5]);
    expect(onTarget.compositionOk).toBe(true);
    expect(offTarget.compositionOk).toBe(false);
    const hist = hsvHistogram(solidRgb(16, 16, [10, 10, 10]));
    const left = { histogram: hist, subjectCenter: [0.2, 0.2] as [number, number], subjectArea: 0.1 };
    const right = { histogram: hist, subjectCenter: [0.8, 0.8] as [number, number], subjectArea: 0.1 };
    const score = scoreMatch(left, right, 0.5, { clipCosine: 0.99 });
    expect(score.clipSimilarity).toBeCloseTo(0.99);
    expect(score.compositionSimilarity).toBeLessThan(0.5);
    expect(offTarget.compositionOk).toBe(false);
  });
});
