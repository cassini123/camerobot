"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useReducer, useState } from "react";
import storyData from "@/data/story_boktu.json";
import spaceData from "@/data/space_heritage_hall.json";
import { buildExportPayload } from "@/lib/export";
import { EXAMPLE_VISUAL_DNA, heuristicDirector, QUICK_PROMPTS } from "@/lib/fallbacks";
import { applyPathToShot } from "@/lib/path-engine";
import { deepMerge, setPath } from "@/lib/patch";
import type {
  DirectorChange,
  DirectorResponse,
  Scene,
  Shot,
  SpaceModel,
  Story,
  VisualDNA,
} from "@/lib/types";

const SpaceViewer = dynamic(
  () => import("./SpaceViewer").then((m) => m.SpaceViewer),
  { ssr: false },
);

const story = storyData as Story;
const defaultSpace = spaceData as SpaceModel;

const FAQ = [
  ["推 DOLLY IN", "摄影机沿光轴靠近主体，建立空间后进入人物。"],
  ["拉 DOLLY OUT", "远离主体，交代环境关系。"],
  ["摇 PAN", "机位不动，镜头水平扫过。"],
  ["移 TRACKING", "平行跟随人物走位。"],
  ["跟 FOLLOW", "侧后跟拍，可绕到建筑正面。"],
  ["环 ORBIT", "绕主体旋转，揭示立面。"],
];

type State = {
  currentSceneId: string;
  space: SpaceModel;
  dna: VisualDNA | null;
  imageDataUrl: string | null;
  shots: Shot[];
  currentShotId: string | null;
  instruction: string;
  pending: DirectorResponse | null;
  busy: string | null;
};

type Action =
  | { type: "scene"; id: string }
  | { type: "space"; space: SpaceModel }
  | { type: "dna"; dna: VisualDNA; image?: string }
  | { type: "shots"; shots: Shot[] }
  | { type: "selectShot"; id: string }
  | { type: "instruction"; text: string }
  | { type: "pending"; pending: DirectorResponse | null }
  | { type: "busy"; busy: string | null }
  | { type: "apply"; shot: Shot };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "scene":
      return { ...state, currentSceneId: action.id };
    case "space":
      return { ...state, space: action.space };
    case "dna":
      return {
        ...state,
        dna: action.dna,
        imageDataUrl: action.image ?? state.imageDataUrl,
      };
    case "shots":
      return {
        ...state,
        shots: action.shots,
        currentShotId:
          action.shots.find((s) => s.shot_id === "shot_02")?.shot_id ??
          action.shots[0]?.shot_id ??
          null,
      };
    case "selectShot":
      return { ...state, currentShotId: action.id };
    case "instruction":
      return { ...state, instruction: action.text };
    case "pending":
      return { ...state, pending: action.pending };
    case "busy":
      return { ...state, busy: action.busy };
    case "apply":
      return {
        ...state,
        shots: state.shots.map((s) =>
          s.shot_id === action.shot.shot_id ? action.shot : s,
        ),
        pending: null,
      };
    default:
      return state;
  }
}

export function Workbench() {
  const [state, dispatch] = useReducer(reducer, {
    currentSceneId: "scene_02",
    space: defaultSpace,
    dna: null,
    imageDataUrl: "/references/heritage-wide.svg",
    shots: [],
    currentShotId: null,
    instruction: "让人物走慢一点，镜头从人物侧后方跟拍，最后绕到建筑正面。",
    pending: null,
    busy: null,
  });
  const [previewing, setPreviewing] = useState(false);
  const [previewT, setPreviewT] = useState(0);
  const [showKb, setShowKb] = useState(false);
  const [dual, setDual] = useState(true);

  const scene = story.scenes.find((s) => s.scene_id === state.currentSceneId)!;
  const currentShot = state.shots.find((s) => s.shot_id === state.currentShotId);

  useEffect(() => {
    if (!previewing || !currentShot) {
      return;
    }
    let frame = 0;
    const started = performance.now();
    const duration = Math.max(1, currentShot.movement.duration) * 1000;
    const tick = (now: number) => {
      setPreviewT(((now - started) % duration) / duration);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [previewing, currentShot]);

  async function analyzeReference(image?: string) {
    dispatch({ type: "busy", busy: "分析参考图…" });
    const res = await fetch("/api/reference/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, reference_id: "ref_001" }),
    });
    const json = await res.json();
    dispatch({ type: "dna", dna: json.visual_dna, image });
    dispatch({ type: "busy", busy: null });
  }

  async function generateShots() {
    dispatch({ type: "busy", busy: "生成镜头与路径…" });
    try {
      const res = await fetch("/api/shots/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scene,
          space: state.space,
          visual_dna: state.dna || EXAMPLE_VISUAL_DNA,
        }),
      });
      const json = await res.json();
      if (!Array.isArray(json.shots) || json.shots.length === 0) {
        throw new Error("empty shots");
      }
      dispatch({ type: "shots", shots: json.shots });
    } catch {
      dispatch({ type: "busy", busy: "生成失败，请重试" });
      return;
    }
    dispatch({ type: "busy", busy: null });
  }

  async function runDirector(instruction: string) {
    if (!currentShot) {
      dispatch({ type: "busy", busy: "请先 Generate Shots 并选择镜头" });
      return;
    }
    const local = heuristicDirector(instruction, currentShot);
    dispatch({ type: "pending", pending: local });
    dispatch({ type: "busy", busy: "导演指令解析…" });
    try {
      const res = await fetch("/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: currentShot.shot_id,
          instruction,
          current_state: currentShot,
        }),
      });
      const json = (await res.json()) as DirectorResponse;
      if (Array.isArray(json.changes) && json.changes.length > 0) {
        dispatch({ type: "pending", pending: json });
      }
    } catch {
      dispatch({ type: "pending", pending: local });
    } finally {
      dispatch({ type: "busy", busy: null });
    }
  }

  function updatePending(change: DirectorChange, value: number) {
    if (!state.pending) {
      return;
    }
    const changes = state.pending.changes.map((c) =>
      c.key === change.key ? { ...c, to: value } : c,
    );
    const patch = setPath(
      state.pending.patch as Record<string, unknown>,
      change.key,
      value,
    );
    dispatch({ type: "pending", pending: { patch, changes } });
  }

  function applyPending() {
    if (!currentShot || !state.pending) {
      return;
    }
    const merged = deepMerge(currentShot, state.pending.patch) as Shot;
    dispatch({ type: "apply", shot: applyPathToShot(merged, state.space) });
  }

  function exportJson() {
    const payload = buildExportPayload({
      project: { id: "yun-jing-001", name: "Boktu Heritage" },
      story,
      space: state.space,
      references: [
        {
          id: "ref_001",
          visual_dna: state.dna || EXAMPLE_VISUAL_DNA,
        },
      ],
      scenes: story.scenes.map((item) => ({
        id: item.scene_id,
        story: item,
        shots: item.scene_id === scene.scene_id ? state.shots : [],
      })),
      shots: state.shots,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "yun-jing-project.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const dnaChips = useMemo(() => {
    if (!state.dna) {
      return [];
    }
    const d = state.dna;
    return [
      `${d.camera.lens}mm`,
      d.camera.angle,
      d.composition.shot_type,
      d.color.temperature,
      `depth ${d.composition.depth}`,
      `person ${d.subject.position}`,
      `building ${Math.round(d.composition.building_ratio * 100)}%`,
    ];
  }, [state.dna]);

  return (
    <div className="workbench">
      <header className="hdr">
        <div className="brand">
          <b>YUNJING</b>
          <span>{story.title} · {scene.title}</span>
        </div>
        <div className="hdr-actions">
          <button className="btn" onClick={() => setShowKb((v) => !v)}>
            镜头语言
          </button>
          <button className="btn" onClick={() => setDual((v) => !v)}>
            {dual ? "单视口" : "双视口"}
          </button>
          <button
            className="btn"
            disabled={!currentShot}
            onClick={() => setPreviewing((v) => !v)}
          >
            {previewing ? "Stop" : "Preview"}
          </button>
          <button className="btn" disabled={!state.shots.length} onClick={exportJson}>
            Export
          </button>
          <button
            className="btn primary"
            disabled={state.busy !== null}
            onClick={generateShots}
          >
            Generate Shots
          </button>
        </div>
      </header>

      <div className="workspace">
      <div className="stage">
        <aside className="col">
          <div className="col-h">STORY</div>
          {story.scenes.map((item: Scene) => (
            <div
              key={item.scene_id}
              className={item.scene_id === scene.scene_id ? "scene active" : "scene"}
              onClick={() => dispatch({ type: "scene", id: item.scene_id })}
            >
              {item.scene_id.replace("scene_0", "Scene ")} {item.title}
              <small>{item.description}</small>
            </div>
          ))}
        </aside>

        <SpaceViewer
          space={state.space}
          shots={state.shots}
          currentShotId={state.currentShotId}
          previewing={previewing}
          previewT={previewT}
          dual={dual}
        />

        <aside className="col">
          <div className="col-h">SHOTS</div>
          {state.shots.length === 0 ? (
            <div className="scene">
              尚未生成镜头
              <small>分析参考图后点击 Generate Shots</small>
            </div>
          ) : (
            state.shots.map((shot) => (
              <div
                key={shot.shot_id}
                className={shot.shot_id === state.currentShotId ? "shot active" : "shot"}
                onClick={() => {
                  dispatch({ type: "selectShot", id: shot.shot_id });
                  setPreviewing(false);
                  setPreviewT(0);
                }}
              >
                {shot.title} · {shot.movement.type} · {shot.camera.lens}mm
                <small>
                  {shot.camera.height}m · {shot.movement.duration}s
                </small>
                <div className="match">
                  MATCH {Math.round(shot.match.overall * 100)}%　构图{" "}
                  {Math.round(shot.match.composition * 100)} 主体{" "}
                  {Math.round(shot.match.subject * 100)} 机位{" "}
                  {Math.round(shot.match.camera * 100)} 色彩{" "}
                  {Math.round(shot.match.color * 100)}
                </div>
              </div>
            ))
          )}
        </aside>
      </div>

      <section className="ref-bar">
        <div className="ref-row">
          <img
            className={
              state.imageDataUrl?.includes("heritage-wide")
                ? "ref-thumb active"
                : "ref-thumb"
            }
            src="/references/heritage-wide.svg"
            alt="主参考"
            onClick={() => analyzeReference("/references/heritage-wide.svg")}
          />
          <img
            className="ref-thumb"
            src="/references/person-building.svg"
            alt="人物与建筑"
            onClick={() => analyzeReference("/references/person-building.svg")}
          />
          <button className="btn ghost" onClick={() => analyzeReference()}>
            Visual DNA
          </button>
        </div>
        <div className="dna">
          {state.busy ? <span className="chip">{state.busy}</span> : null}
          {dnaChips.map((chip) => (
            <span className="chip" key={chip}>
              {chip}
            </span>
          ))}
        </div>
      </section>

      <div className="composer-dock">
        {state.pending ? (
          <div className="changes">
            <div className="col-h" style={{ border: "none", padding: "0 0 8px" }}>
              CHANGES
            </div>
            {state.pending.changes.map((change, index) => (
              <div key={`${change.key}-${index}`} className="change">
                <div>
                  <div>{change.label}</div>
                  <small style={{ color: "var(--muted)" }}>
                    {String(change.from)} → {String(change.to)}
                  </small>
                  {change.slider && typeof change.to === "number" ? (
                    <input
                      type="range"
                      min={change.slider.min}
                      max={change.slider.max}
                      step={change.slider.step}
                      value={Number(change.to)}
                      onChange={(e) =>
                        updatePending(change, Number(e.target.value))
                      }
                      style={{ width: "100%" }}
                    />
                  ) : null}
                </div>
              </div>
            ))}
            <div className="dir-row">
              <button className="btn" onClick={() => dispatch({ type: "pending", pending: null })}>
                Cancel
              </button>
              <button className="btn primary" onClick={applyPending}>
                Apply
              </button>
            </div>
          </div>
        ) : null}

        {state.shots.length > 0 ? (
          <footer className="timeline">
            <span>TIMELINE</span>
            {state.shots.map((shot) => (
              <div
                key={shot.shot_id}
                className={shot.shot_id === state.currentShotId ? "clip on" : "clip"}
                style={{ width: `${40 + shot.movement.duration * 10}px` }}
              >
                {shot.title}
              </div>
            ))}
          </footer>
        ) : null}

        <div className="composer-tools">
          <select defaultValue="shot" aria-label="scope">
            <option value="shot">Current Shot</option>
            <option value="scene" disabled>
              Current Scene
            </option>
            <option value="story" disabled>
              Entire Story
            </option>
          </select>
          {QUICK_PROMPTS.map((item) => (
            <button
              key={item.id}
              className="quick"
              onClick={() => {
                dispatch({ type: "instruction", text: item.instruction });
                void runDirector(item.instruction);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <section className="composer" aria-label="Director prompt">
          {state.busy ? <p className="composer-status">{state.busy}</p> : null}
          <div className="composer-shell">
            <label className="composer-plus" title="上传参考图" aria-label="上传参考图">
              +
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  const dataUrl = await fileToDataUrl(file);
                  await analyzeReference(dataUrl);
                }}
              />
            </label>
            <textarea
              className="prompt"
              placeholder="给导演一句话：跟拍、绕到正面、放慢人物…"
              value={state.instruction}
              rows={1}
              onChange={(e) => dispatch({ type: "instruction", text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void runDirector(state.instruction);
                }
              }}
            />
            <button
              className="composer-send"
              aria-label="发送导演指令"
              disabled={!currentShot || state.busy !== null}
              onClick={() => runDirector(state.instruction)}
            >
              ↑
            </button>
          </div>
        </section>
      </div>

      {showKb ? (
        <aside className="kb">
          <b>基本镜头语言</b>
          {FAQ.map(([k, v]) => (
            <p key={k}>
              <b>{k}</b> {v}
            </p>
          ))}
        </aside>
      ) : null}
      </div>
    </div>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
