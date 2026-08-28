import { describe, expect, it } from "vitest";
import { detectGenerateIntent } from "../lib/generate-intent";
import { filmDuration, filmTAtShot, sampleFilm } from "../lib/film-timeline";
import { searchShotBoard, SHOT_PRESETS, applyPresetToShot } from "../lib/shot-catalog";
import type { Shot } from "../lib/types";

function shot(id: string, duration: number, type: string): Shot {
  return {
    shot_id: id,
    scene_id: "s",
    reference_id: "r",
    title: id,
    kind: "character",
    target: { type: "person", object_id: "person_01", position: [0, 1, 0] },
    camera: { position: [0, 1.6, 4], rotation: [0, 0, 0], lens: 35, height: 1.6 },
    composition: { subject_ratio: 0.3, horizontal: 0.5, vertical: 0.5 },
    movement: { type, start: [0, 1.6, 4], end: [0, 1.6, 2], duration },
    path: { start: [0, 1.6, 4], waypoints: [], end: [0, 1.6, 2], target: [0, 1, 0] },
    match: { composition: 1, subject: 1, color: 1, camera: 1, overall: 1 },
  };
}

describe("generate intent", () => {
  it("opens object generate from a chair prompt", () => {
    expect(detectGenerateIntent("生成一把红色木椅")?.kind).toBe("object");
  });

  it("opens world generate from a scene prompt", () => {
    expect(detectGenerateIntent("生成一个暖金厅堂场景")?.kind).toBe("world");
  });

  it("does not steal Generate Shots", () => {
    expect(detectGenerateIntent("生成镜头")).toBeNull();
  });
});

describe("generate job copy", () => {
  it("surfaces failure reason and done copy", async () => {
    const { jobHeadline, GENERATE_FAIL } = await import("../lib/generate-job");
    expect(GENERATE_FAIL.has("FAILED")).toBe(true);
    expect(
      jobHeadline({
        id: "1",
        kind: "world",
        prompt: "hall",
        status: "failed",
        phase: "x",
        error: "世界生成失败（TIMEOUT）",
        minimized: true,
        createdAt: 0,
      }),
    ).toBe("世界生成失败（TIMEOUT）");
    expect(
      jobHeadline({
        id: "1",
        kind: "world",
        prompt: "hall",
        status: "done",
        phase: "ok",
        minimized: true,
        createdAt: 0,
      }),
    ).toBe("已加入 Library");
  });
});

describe("film timeline", () => {
  it("walks across shots by duration", () => {
    const shots = [shot("a", 2, "STATIC"), shot("b", 2, "ORBIT")];
    expect(filmDuration(shots)).toBe(4);
    expect(sampleFilm(shots, 0.25)?.shot.shot_id).toBe("a");
    expect(sampleFilm(shots, 0.75)?.shot.shot_id).toBe("b");
    expect(filmTAtShot(shots, "b")).toBe(0.5);
  });
});

describe("shot board search", () => {
  it("filters presets by color keyword", () => {
    const { presets } = searchShotBoard("暖", [], SHOT_PRESETS);
    expect(presets.some((item) => item.id === "warm")).toBe(true);
  });

  it("keeps OTS / establishing / character and drops ECU CU WS", () => {
    const ids = SHOT_PRESETS.map((item) => item.id);
    expect(ids).toContain("ots");
    expect(ids).toContain("establishing");
    expect(ids).toContain("character");
    expect(ids).toContain("fisheye");
    expect(ids).toContain("black_soft");
    expect(ids).toContain("white_soft");
    expect(ids).not.toContain("ecu");
    expect(ids).not.toContain("cu");
    expect(ids).not.toContain("ws");
    expect(ids).not.toContain("ms");
  });

  it("applies look and fisheye immediately", () => {
    const base = shot("a", 2, "STATIC");
    const fisheye = SHOT_PRESETS.find((item) => item.id === "fisheye")!;
    const soft = SHOT_PRESETS.find((item) => item.id === "black_soft")!;
    expect(applyPresetToShot(fisheye, base).lensStyle).toBe("fisheye");
    expect(applyPresetToShot(soft, base).look).toBe("black_soft");
  });
});
