"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { DraggablePanel } from "./DraggablePanel";
import { IntroSplash } from "./IntroSplash";
import { ToolDock } from "./ToolDock";
import storyData from "@/data/story_boktu.json";
import spaceData from "@/data/space_heritage_hall.json";
import { buildExportPayload } from "@/lib/export";
import { sampleStillFrames } from "@/lib/still-frames";
import { EXAMPLE_VISUAL_DNA, fallbackShots, heuristicDirector } from "@/lib/fallbacks";
import { applyPathToShot } from "@/lib/path-engine";
import { applyPresetToShot, type CatalogPreset } from "@/lib/shot-catalog";
import { filmDuration, filmTAtShot, keepCurrentShotId, sampleFilm } from "@/lib/film-timeline";
import { deepMerge, setPath } from "@/lib/patch";
import {
  FULL_EXAMPLE_GAUSSIANS,
  FULL_EXAMPLE_PLY_BYTES,
  FULL_EXAMPLE_PLY_URL,
  exampleSpace,
  resolveSpaceObject,
  SCENE_MODEL_ACCEPT,
  SCENE_MODEL_FORMATS,
} from "@/lib/space-objects";
import { GENERATED_WORLDS } from "@/lib/generated-worlds";
import { heroView } from "@/lib/view-frame";
import { formatBytes } from "@/lib/ply-stream";
import { IDENTITY_FIT } from "@/lib/point-cluster";
import { matchTools, type ToolId } from "@/lib/tools";
import type { BufferGeometry } from "three";
import Link from "next/link";
import { ShotBoard } from "./ShotBoard";
import { useLibrary } from "./LibraryProvider";
import { detectGenerateIntent } from "@/lib/generate-intent";
import type { SceneSplat } from "@/lib/scene-visual";
import type {
  DirectorChange,
  DirectorResponse,
  Scene,
  Shot,
  SpaceModel,
  Story,
  VisualDNA,
} from "@/lib/types";
import { CINPATH_SCENE_PARAM } from "@/lib/library-types";

const SpaceViewer = dynamic(
  () => import("./SpaceViewer").then((m) => m.SpaceViewer),
  { ssr: false },
);

const defaultSpace = exampleSpace(spaceData as SpaceModel);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const FAQ = [
  ["推 DOLLY IN", "摄影机沿光轴靠近主体，建立空间后进入人物。"],
  ["拉 DOLLY OUT", "远离主体，交代环境关系。"],
  ["摇 PAN", "机位不动，镜头水平扫过。"],
  ["移 TRACKING", "平行跟随人物走位。"],
  ["跟 FOLLOW", "侧后跟拍，可绕到建筑正面。"],
  ["环 ORBIT", "绕主体旋转，揭示立面。"],
];

type SceneAssets = { images: string[]; videos: string[] };

type LibraryItem = {
  id: string;
  name: string;
  sizeLabel: string;
  source: "example" | "upload" | "bundled" | "generated";
  file?: File;
  space?: SpaceModel;
  geometry?: BufferGeometry | null;
  splat?: SceneSplat | null;
  ready: boolean;
  error?: string;
  previewUrl?: string;
  remoteUrl?: string;
  plyUrl?: string;
  spzUrl?: string;
};

type Toast = { kind: "ok" | "err"; text: string };

type State = {
  currentSceneId: string;
  story: Story;
  space: SpaceModel;
  dna: VisualDNA | null;
  imageDataUrl: string | null;
  shots: Shot[];
  currentShotId: string | null;
  instruction: string;
  pending: DirectorResponse | null;
  busy: string | null;
  sceneAssets: Record<string, SceneAssets>;
  toneSkill: { name: string; dataUrl: string } | null;
  modelName: string | null;
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
  | { type: "apply"; shot: Shot }
  | { type: "moveObject"; id: string; position: [number, number, number]; rebuild?: boolean }
  | { type: "editScene"; id: string; title?: string; description?: string }
  | { type: "sceneAsset"; id: string; kind: "image" | "video"; dataUrl: string }
  | { type: "tone"; name: string; dataUrl: string }
  | { type: "model"; name: string | null; space?: SpaceModel };

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
        currentShotId: keepCurrentShotId(action.shots, state.currentShotId),
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
    case "moveObject": {
      const space = {
        ...state.space,
        objects: state.space.objects.map((obj) =>
          obj.id === action.id ? { ...obj, position: action.position } : obj,
        ),
      };
      return {
        ...state,
        space,
        shots: action.rebuild
          ? state.shots.map((shot) => applyPathToShot(shot, space))
          : state.shots,
      };
    }
    case "editScene":
      return {
        ...state,
        story: {
          ...state.story,
          scenes: state.story.scenes.map((item) =>
            item.scene_id === action.id
              ? {
                  ...item,
                  title: action.title ?? item.title,
                  description: action.description ?? item.description,
                }
              : item,
          ),
        },
      };
    case "sceneAsset": {
      const current = state.sceneAssets[action.id] ?? { images: [], videos: [] };
      const next =
        action.kind === "image"
          ? { ...current, images: [...current.images, action.dataUrl] }
          : { ...current, videos: [...current.videos, action.dataUrl] };
      return {
        ...state,
        sceneAssets: { ...state.sceneAssets, [action.id]: next },
      };
    }
    case "tone":
      return { ...state, toneSkill: { name: action.name, dataUrl: action.dataUrl } };
    case "model":
      return {
        ...state,
        modelName: action.name,
        space: action.space ?? (action.name ? state.space : defaultSpace),
      };
    default:
      return state;
  }
}

export function Workbench({ skipIntro = false }: { skipIntro?: boolean }) {
  const { addFromFile, addFromDataUrl, openGenerate, assets, getBlob } = useLibrary();
  const [state, dispatch] = useReducer(reducer, {
    currentSceneId: "scene_02",
    story: storyData as Story,
    space: defaultSpace,
    dna: null,
    imageDataUrl: null,
    shots: [],
    currentShotId: null,
    instruction: "",
    pending: null,
    busy: null,
    sceneAssets: {},
    toneSkill: null,
    modelName: null,
  });
  const [previewing, setPreviewing] = useState(false);
  const [previewT, setPreviewT] = useState(0);
  const [showKb, setShowKb] = useState(false);
  const [dual, setDual] = useState(true);
  const [introDone, setIntroDone] = useState(skipIntro);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [filmPlaying, setFilmPlaying] = useState(false);
  const [filmT, setFilmT] = useState(0);
  const filmOriginRef = useRef(0);
  const [exportOpen, setExportOpen] = useState(false);
  const [activeToolIds, setActiveToolIds] = useState<ToolId[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>("person_01");
  const [modelOpen, setModelOpen] = useState(false);
  const [cloud, setCloud] = useState<BufferGeometry | null>(null);
  const [splat, setSplat] = useState<SceneSplat | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([
    {
      id: "example",
      name: "Example · 厅堂代理",
      sizeLabel: "内置",
      source: "example",
      ready: true,
      space: defaultSpace,
      geometry: null,
    },
    {
      id: "example-ply",
      name: "Example · model.ply",
      sizeLabel: `${formatBytes(FULL_EXAMPLE_PLY_BYTES)} · ${FULL_EXAMPLE_GAUSSIANS.toLocaleString("en")} Gaussians`,
      source: "bundled",
      ready: false,
    },
    ...GENERATED_WORLDS.map((world) => ({
      id: world.id,
      name: world.name,
      sizeLabel: "3DGS SPZ",
      source: "generated" as const,
      ready: false,
      previewUrl: world.pano,
      remoteUrl: world.spzUrl,
      plyUrl: world.plyUrl,
      spzUrl: world.spzUrl,
    })),
  ]);
  const [activeModelId, setActiveModelId] = useState("example");
  const toneInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const appliedSceneRef = useRef<string | null>(null);
  const finishIntro = useCallback(() => setIntroDone(true), []);

  useEffect(() => {
    const scenes = assets.filter((item) => item.kind === "scene" || item.kind === "object");
    if (!scenes.length) {
      return;
    }
    setLibrary((cur) => {
      const owned = new Set(cur.map((item) => item.id));
      const extra = scenes
        .filter((item) => !owned.has(item.id))
        .map((item) => ({
          id: item.id,
          name: item.name,
          sizeLabel: item.sizeLabel,
          source: (item.source === "generated" ? "generated" : "upload") as LibraryItem["source"],
          ready: false,
          previewUrl: item.previewUrl,
          remoteUrl: item.remoteUrl,
          plyUrl: item.plyUrl,
          spzUrl: item.spzUrl,
        }));
      return extra.length ? [...cur, ...extra] : cur;
    });
  }, [assets]);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get(CINPATH_SCENE_PARAM);
    if (!wanted || appliedSceneRef.current === wanted) {
      return;
    }
    const item = library.find((entry) => entry.id === wanted);
    if (!item) {
      return;
    }
    appliedSceneRef.current = wanted;
    applyLibrary(item);
    // applyLibrary is recreated each render; we only auto-apply once per scene id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library]);

  const scene = state.story.scenes.find((s) => s.scene_id === state.currentSceneId)!;
  const playheadShotId = filmPlaying
    ? (sampleFilm(state.shots, filmT)?.shot.shot_id ?? state.currentShotId)
    : state.currentShotId;
  const currentShot = state.shots.find((s) => s.shot_id === playheadShotId);
  const selected = state.space.objects.find((obj) => obj.id === selectedId);

  function patchCurrentShot(partial: Record<string, unknown>) {
    if (!currentShot) {
      return;
    }
    const merged = deepMerge(currentShot, partial) as Shot;
    dispatch({ type: "apply", shot: applyPathToShot(merged, state.space) });
  }

  function seedShots(): Shot[] {
    if (state.shots.length) {
      return state.shots;
    }
    const next = fallbackShots(
      scene.scene_id,
      state.space,
      state.dna?.reference_id ?? "ref_001",
    );
    dispatch({ type: "shots", shots: next });
    return next;
  }

  function applyCatalog(preset: CatalogPreset) {
    const seeded = seedShots();
    const playheadId = filmPlaying
      ? (sampleFilm(seeded, filmT)?.shot.shot_id ?? state.currentShotId)
      : state.currentShotId;
    const current = seeded.find((item) => item.shot_id === playheadId) ?? seeded[0];
    const patched = applyPathToShot(applyPresetToShot(preset, current), state.space);
    const shots = seeded.map((item) => (item.shot_id === patched.shot_id ? patched : item));
    dispatch({ type: "shots", shots });
    dispatch({ type: "selectShot", id: patched.shot_id });
    setFilmPlaying(false);
    setPreviewing(true);
    setPreviewT(0);
    setFilmT(filmTAtShot(shots, patched.shot_id));
  }

  useEffect(() => {
    if (!previewing || filmPlaying || !currentShot) {
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
  }, [previewing, currentShot, filmPlaying]);

  useEffect(() => {
    if (!filmPlaying || state.shots.length === 0) {
      return;
    }
    let frame = 0;
    const duration = filmDuration(state.shots) * 1000;
    filmOriginRef.current = performance.now() - filmT * duration;
    const tick = (now: number) => {
      setFilmT(((now - filmOriginRef.current) % duration) / duration);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // filmT is the seek offset at the moment play starts / shots change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmPlaying, state.shots]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), 5200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function ingestModel(file: File, existingId?: string, source: LibraryItem["source"] = "upload") {
    const id = existingId ?? `${file.name}-${file.size}-${Date.now()}`;
    if (!existingId) {
      setLibrary((cur) => [
        ...cur,
        {
          id,
          name: file.name,
          sizeLabel: formatBytes(file.size),
          source,
          file,
          ready: false,
        },
      ]);
    }
    if (!existingId?.startsWith("world-")) {
      void addFromFile(file, {
        kind: "scene",
        source: existingId === "example-ply" ? "bundled" : source === "generated" ? "generated" : "upload",
      });
    }
    setToast({
      kind: "ok",
      text: `开始解析 ${file.name}（${formatBytes(file.size)}）。大文件只抽样读取，不会整包进内存。`,
    });
    dispatch({ type: "busy", busy: `解析 ${file.name}…` });
    try {
      const { loadUploadedScene } = await import("@/lib/load-scene-model");
      const { space, visual } = await loadUploadedScene(file, (_ratio, label) => {
        dispatch({ type: "busy", busy: label });
      });
      let labeled = space;
      dispatch({ type: "busy", busy: "AI 解析物体与颜色…" });
      try {
        const res = await fetch("/api/space/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: space.description,
            space,
            clusters: space.objects.map((obj) => ({
              id: obj.id,
              type: obj.type,
              position: obj.position,
              size: obj.size,
              color: obj.color,
              colorName: obj.colorName,
              label: obj.label,
              aliases: obj.aliases,
            })),
          }),
        });
        const json = await res.json();
        if (json.space?.objects) {
          labeled = json.space;
        }
      } catch {
        // keep heuristic labels
      }
      const geometry = visual?.geometry ?? null;
      const nextSplat = visual?.splat ?? null;
      setLibrary((cur) =>
        cur.map((item) =>
          item.id === id
            ? { ...item, ready: true, space: labeled, geometry, splat: nextSplat, error: undefined }
            : item,
        ),
      );
      const world = GENERATED_WORLDS.find((item) => item.id === id);
      const nextSource: LibraryItem["source"] =
        existingId === "example-ply"
          ? "bundled"
          : world || source === "generated"
            ? "generated"
            : source;
      applyLibrary({
        id,
        name:
          existingId === "example-ply"
            ? "Example · model.ply"
            : world?.name ?? file.name,
        sizeLabel: formatBytes(file.size),
        source: nextSource,
        file,
        ready: true,
        space: labeled,
        geometry,
        splat: nextSplat,
        previewUrl: world?.pano,
        remoteUrl: world?.spzUrl,
        plyUrl: world?.plyUrl,
        spzUrl: world?.spzUrl,
      });
      setToast({
        kind: "ok",
        text:
          existingId === "example-ply"
            ? nextSplat
              ? "已载入 Example · model.ply（3DGS 原场景）。"
              : "已载入 Example · model.ply。"
            : nextSplat
              ? `上传成功：${file.name}。已用原场景 3DGS 渲染并加入左侧模型栏。`
              : `上传成功：${file.name}。已加入左侧模型栏，可随时 Apply。`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "模型解析失败";
      setLibrary((cur) =>
        cur.map((item) => (item.id === id ? { ...item, ready: false, error: message } : item)),
      );
      dispatch({ type: "busy", busy: null });
      setToast({ kind: "err", text: `上传失败：${message}` });
      return;
    }
    dispatch({ type: "busy", busy: null });
  }

  async function loadBundledExample(item: LibraryItem) {
    dispatch({ type: "busy", busy: "载入 Example · model.ply（3.29GB）…" });
    setToast({ kind: "ok", text: "正在流式载入 3DGS 原扫描…" });
    try {
      const meta = await fetch(`${FULL_EXAMPLE_PLY_URL}?meta=1`).then(async (res) => {
        const json = (await res.json()) as {
          complete?: boolean;
          bytes?: number;
          expectedBytes?: number;
          hint?: string;
        };
        return json;
      });
      if (!meta.complete) {
        await fetch(FULL_EXAMPLE_PLY_URL, { method: "POST" }).catch(() => undefined);
        throw new Error(
          meta.hint ||
            `完整扫描尚未就绪（${formatBytes(meta.bytes ?? 0)} / ${formatBytes(meta.expectedBytes ?? FULL_EXAMPLE_PLY_BYTES)}）。本地运行 ./example/fetch-model.sh，或设置 EXAMPLE_PLY_URL。`,
        );
      }
      const nextSplat: SceneSplat = {
        url: FULL_EXAMPLE_PLY_URL,
        fileName: "model.ply",
        paged: true,
        zUp: true,
        autoFit: true,
        fit: IDENTITY_FIT,
      };
      setLibrary((cur) =>
        cur.map((it) =>
          it.id === item.id
            ? {
                ...it,
                ready: true,
                splat: nextSplat,
                space: {
                  ...defaultSpace,
                  kind: "upload",
                  format: "ply",
                  fileName: "model.ply",
                  model: "model.ply",
                  description: `Example · model.ply · ${formatBytes(FULL_EXAMPLE_PLY_BYTES)} · ${FULL_EXAMPLE_GAUSSIANS.toLocaleString("en")} Gaussians`,
                },
              }
            : it,
        ),
      );
      setCloud(null);
      setSplat(nextSplat);
      setActiveModelId(item.id);
      dispatch({
        type: "model",
        name: "Example · model.ply",
        space: {
          ...defaultSpace,
          kind: "upload",
          format: "ply",
          fileName: "model.ply",
          model: "model.ply",
        },
      });
      setToast({
        kind: "ok",
        text: "已载入 Example · model.ply（3.29GB 3DGS 原场景）。",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "扫描载入失败";
      setLibrary((cur) =>
        cur.map((it) => (it.id === item.id ? { ...it, ready: false, error: message } : it)),
      );
      dispatch({ type: "busy", busy: null });
      setToast({ kind: "err", text: message });
      return;
    }
    dispatch({ type: "busy", busy: null });
  }

  async function loadRemoteModel(item: LibraryItem) {
    const url = item.spzUrl || item.remoteUrl;
    if (!url) {
      setToast({ kind: "err", text: "这个场景没有可载入的模型地址" });
      return;
    }
    dispatch({ type: "busy", busy: `载入 ${item.name}…` });
    setToast({ kind: "ok", text: `正在拉取 ${item.name} 的 3DGS…` });
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`无法下载场景（${res.status}）`);
      }
      const blob = await res.blob();
      const extMatch = url.toLowerCase().match(/\.(ply|spz|splat|ksplat|glb|gltf)(?:$|\?)/);
      const ext = extMatch?.[1] ?? "spz";
      const file = new File([blob], `${item.name}.${ext}`, { type: "application/octet-stream" });
      setLibrary((cur) => cur.map((it) => (it.id === item.id ? { ...it, file } : it)));
      await ingestModel(file, item.id, item.source);
    } catch (error) {
      const message = error instanceof Error ? error.message : "场景载入失败";
      setLibrary((cur) =>
        cur.map((it) => (it.id === item.id ? { ...it, ready: false, error: message } : it)),
      );
      dispatch({ type: "busy", busy: null });
      setToast({ kind: "err", text: message });
    }
  }

  function applyLibrary(item: LibraryItem) {
    if (item.source === "example") {
      restoreExample();
      setActiveModelId("example");
      setToast({ kind: "ok", text: "已 Apply Example 厅堂。" });
      return;
    }
    if (item.source === "bundled" && !item.ready) {
      void loadBundledExample(item);
      return;
    }
    if ((item.source === "generated" || item.remoteUrl || item.spzUrl) && !item.ready) {
      void loadRemoteModel(item);
      return;
    }
    if (!item.ready || !item.space) {
      if (item.file) {
        void ingestModel(item.file, item.id);
        return;
      }
      void (async () => {
        const blob = await getBlob(item.id);
        if (!blob) {
          setToast({ kind: "err", text: item.error || "模型尚未解析完成" });
          return;
        }
        const named = item.name.includes(".") ? item.name : `${item.name}.ply`;
        await ingestModel(new File([blob], named, { type: "application/octet-stream" }), item.id);
      })();
      return;
    }
    const nextSpace = item.space;
    setCloud(item.geometry ?? null);
    setSplat(item.splat ?? null);
    dispatch({ type: "space", space: nextSpace });
    dispatch({ type: "model", name: item.name, space: nextSpace });
    const remapped = (state.shots.length
      ? state.shots
      : fallbackShots(scene.scene_id, nextSpace)
    ).map((shot) => applyPathToShot(shot, nextSpace));
    dispatch({ type: "shots", shots: remapped });
    setSelectedId(nextSpace.objects.find((obj) => obj.type !== "ground")?.id ?? null);
    setActiveModelId(item.id);
    setModelOpen(false);
    setPreviewing(false);
    setFilmPlaying(false);
    setToast({ kind: "ok", text: `已 Apply ${item.name}` });
  }

  function restoreExample() {
    setCloud(null);
    setSplat(null);
    dispatch({ type: "space", space: defaultSpace });
    dispatch({ type: "model", name: null, space: defaultSpace });
    if (state.shots.length) {
      dispatch({
        type: "shots",
        shots: state.shots.map((shot) => applyPathToShot(shot, defaultSpace)),
      });
    }
    setSelectedId("person_01");
    setModelOpen(false);
    setActiveModelId("example");
  }

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
      dispatch({
        type: "shots",
        shots: json.shots.map((shot: Shot) => applyPathToShot(shot, state.space)),
      });
    } catch {
      dispatch({
        type: "shots",
        shots: fallbackShots(scene.scene_id, state.space, state.dna?.reference_id ?? "ref_001"),
      });
    }
    dispatch({ type: "busy", busy: null });
  }

  async function runDirector(instruction: string) {
    const text = instruction.trim();
    if (!text) {
      return;
    }
    const generate = detectGenerateIntent(text);
    if (generate) {
      openGenerate(generate.kind, generate.prompt);
      return;
    }
    const hit = resolveSpaceObject(state.space, text);
    const tools = matchTools(text);
    if (hit && !tools.includes("move")) {
      tools.push("move");
    }
    setActiveToolIds(tools);
    if (hit) {
      setSelectedId(hit.id);
    }
    const seeded =
      currentShot && state.shots.length
        ? state.shots
        : fallbackShots(scene.scene_id, state.space, state.dna?.reference_id ?? "ref_001");
    if (!state.shots.length) {
      dispatch({ type: "shots", shots: seeded });
    }
    const shot = seeded.find((item) => item.shot_id === state.currentShotId) ?? seeded[0];
    const local = heuristicDirector(instruction, shot, state.space);
    dispatch({ type: "pending", pending: local });
    dispatch({ type: "busy", busy: "导演指令解析…" });
    try {
      const res = await fetch("/api/director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: shot.shot_id,
          instruction,
          current_state: shot,
          space: state.space,
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
      story: state.story,
      space: state.space,
      references: [
        {
          id: "ref_001",
          visual_dna: state.dna || EXAMPLE_VISUAL_DNA,
        },
      ],
      scenes: state.story.scenes.map((item) => ({
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

  async function runExport(kind: "json" | "motion" | "preview" | "jpg") {
    setExportOpen(false);
    if (kind === "json") {
      exportJson();
      return;
    }
    dispatch({ type: "busy", busy: "正在导出…" });
    try {
      if (!state.shots.length) {
        seedShots();
      }
      const shots = state.shots.length
        ? state.shots
        : fallbackShots(scene.scene_id, state.space, state.dna?.reference_id ?? "ref_001");
      if (!shots.length) {
        throw new Error("没有可导出的镜头");
      }
      const media = await import("@/lib/media-export");
      if (kind === "motion") {
        await media.exportCameraVideo(
          state.space,
          shots,
          "motion",
          "yunjing-camera-move.mp4",
          (label) => dispatch({ type: "busy", busy: `导出运动视频 · ${label}` }),
        );
      } else if (kind === "preview") {
        await media.exportCameraVideo(
          state.space,
          shots,
          "preview",
          "yunjing-preview.mp4",
          (label) => dispatch({ type: "busy", busy: `导出预览视频 · ${label}` }),
        );
      } else {
        const rows = await media.captureStillRows(
          state.space,
          shots,
          sampleStillFrames,
        );
        await media.exportStillsJpgs(rows, "yunjing-stills.zip");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "导出失败，请重试";
      dispatch({ type: "busy", busy: null });
      setToast({ kind: "err", text: message });
      return;
    }
    dispatch({ type: "busy", busy: null });
    setToast({ kind: "ok", text: kind === "jpg" ? "静帧 JPG 已下载" : "MP4 已下载" });
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
          <Link href="/yunjing">
            <b>YUNJING</b>
          </Link>
          <span>CinPath</span>
        </div>
        <div className="hdr-actions">
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
          <div className="export-wrap">
            <button
              className="btn"
              disabled={!state.shots.length || state.busy !== null}
              onClick={() => setExportOpen((v) => !v)}
            >
              Export
            </button>
            {exportOpen ? (
              <div className="export-menu" role="menu">
                <button onClick={() => void runExport("json")}>JSON</button>
                <button onClick={() => void runExport("motion")}>摄影机运动视频 MP4</button>
                <button onClick={() => void runExport("preview")}>预览视频 MP4</button>
                <button onClick={() => void runExport("jpg")}>静帧 JPG</button>
              </div>
            ) : null}
          </div>
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
        <aside className="col story-col">
          <div className="col-h">STORY</div>
          <div className="story-list">
            {state.story.scenes.map((item: Scene) => {
              const assets = state.sceneAssets[item.scene_id];
              return (
                <div
                  key={item.scene_id}
                  className={
                    item.scene_id === scene.scene_id
                      ? "scene active gemini-glow"
                      : "scene"
                  }
                  onClick={() => dispatch({ type: "scene", id: item.scene_id })}
                >
                  <div className="scene-head">
                    <span className="sid">{item.scene_id.replace("scene_0", "Scene ")}</span>
                    <label
                      className="scene-plus"
                      title="本镜参考图 / 参考视频"
                      onClick={(e) => e.stopPropagation()}
                    >
                      +
                      <input
                        type="file"
                        accept="image/*,video/*"
                        hidden
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) {
                            return;
                          }
                          const dataUrl = await readFileAsDataUrl(file);
                          dispatch({
                            type: "sceneAsset",
                            id: item.scene_id,
                            kind: file.type.startsWith("video") ? "video" : "image",
                            dataUrl,
                          });
                          void addFromDataUrl(
                            file.name,
                            dataUrl,
                            file.type.startsWith("video") ? "video" : "image",
                          );
                        }}
                      />
                    </label>
                  </div>
                  <input
                    className="scene-title"
                    value={item.title}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={() => dispatch({ type: "scene", id: item.scene_id })}
                    onChange={(e) =>
                      dispatch({ type: "editScene", id: item.scene_id, title: e.target.value })
                    }
                  />
                  <textarea
                    className="scene-copy"
                    rows={2}
                    value={item.description}
                    onClick={(e) => e.stopPropagation()}
                    onFocus={() => dispatch({ type: "scene", id: item.scene_id })}
                    onChange={(e) =>
                      dispatch({
                        type: "editScene",
                        id: item.scene_id,
                        description: e.target.value,
                      })
                    }
                  />
                  {assets && (assets.images.length || assets.videos.length) ? (
                    <div className="scene-assets">
                      {assets.images.map((url, i) => (
                        <img key={`img-${i}`} src={url} alt="" />
                      ))}
                      {assets.videos.map((url, i) => (
                        <video key={`vid-${i}`} src={url} muted />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="col-h">MODELS</div>
          <div className="model-lib">
            {library.map((item) => (
              <div
                key={item.id}
                className={
                  item.id === activeModelId ? "model-lib-item on gemini-glow" : "model-lib-item"
                }
              >
                <button type="button" className="model-lib-name" onClick={() => applyLibrary(item)}>
                  {item.previewUrl ? (
                    <img className="model-lib-thumb" src={item.previewUrl} alt="" />
                  ) : null}
                  <span>
                    <b>{item.name}</b>
                    <small>
                      {item.sizeLabel}
                      {item.ready
                        ? " · 可 Apply"
                        : item.error
                          ? ` · ${item.error}`
                          : item.source === "bundled" || item.source === "generated"
                            ? " · 点击载入"
                            : " · 解析中"}
                    </small>
                  </span>
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!item.ready && item.source === "upload" && !item.file && !item.remoteUrl}
                  onClick={() => applyLibrary(item)}
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
          <div className="lens-dock">
            {showKb ? (
              <aside className="kb">
                <b>镜头语言</b>
                {FAQ.map(([k, v]) => (
                  <p key={k}>
                    <b>{k}</b> {v}
                  </p>
                ))}
              </aside>
            ) : null}
            <button
              className={showKb ? "lens-btn on" : "lens-btn"}
              aria-label="镜头语言"
              title="镜头语言"
              onClick={() => setShowKb((v) => !v)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="8.2" />
                <circle cx="12" cy="12" r="3.2" />
                <path d="M12 3.8v2.4M12 17.8v2.4M3.8 12h2.4M17.8 12h2.4M6.2 6.2l1.7 1.7M16.1 16.1l1.7 1.7M17.8 6.2l-1.7 1.7M7.9 16.1l-1.7 1.7" />
              </svg>
            </button>
          </div>
        </aside>

        <SpaceViewer
          space={state.space}
          viewKey={activeModelId}
          shots={state.shots}
          currentShotId={playheadShotId}
          previewing={filmPlaying || previewing}
          previewT={
            filmPlaying || !previewing
              ? (sampleFilm(state.shots, filmT)?.localT ?? previewT)
              : previewT
          }
          dual={dual}
          selectedId={selectedId}
          cloud={cloud}
          splat={splat}
          timelineOpen={timelineOpen}
          filmPlaying={filmPlaying}
          filmT={filmT}
          onToggleTimeline={() => setTimelineOpen((v) => !v)}
          onPlayFilm={() => {
            seedShots();
            setPreviewing(false);
            setFilmPlaying((v) => !v);
          }}
          onSeekFilm={(t) => {
            const shots = seedShots();
            setFilmT(t);
            const duration = filmDuration(shots) * 1000;
            filmOriginRef.current = performance.now() - t * duration;
            const hit = sampleFilm(shots, t);
            if (hit) {
              dispatch({ type: "selectShot", id: hit.shot.shot_id });
              setPreviewT(hit.localT);
            }
          }}
          onEnsureShots={() => {
            seedShots();
          }}
          onSelectObject={setSelectedId}
          onMoveObject={(id, position, done) =>
            dispatch({
              type: "moveObject",
              id,
              position,
              rebuild: done,
            })
          }
        />

        <ShotBoard
          shots={state.shots}
          currentShotId={playheadShotId}
          onSelectShot={(id) => {
            setFilmPlaying(false);
            dispatch({ type: "selectShot", id });
            setPreviewing(true);
            setPreviewT(0);
            setFilmT(filmTAtShot(state.shots, id));
          }}
          onPreset={(preset) => applyCatalog(preset)}
        />
      </div>

      <ToolDock
        ids={activeToolIds}
        currentShot={currentShot}
        selectedLabel={
          selected
            ? `${selected.label ?? selected.id} · ${selected.colorName ?? selected.type} · 双击选中后按住触控板拖动`
            : "双击选中物体，再按住触控板拖动"
        }
        previewing={previewing}
        onClose={(id) => setActiveToolIds((cur) => cur.filter((item) => item !== id))}
        onFollow={() => void runDirector("镜头从人物侧后方跟拍")}
        onOrbit={() => void runDirector("环绕人物，最后绕到建筑正面")}
        onDolly={(dir) =>
          void runDirector(dir === "in" ? "镜头靠近主体，推进" : "镜头拉远，远离主体")
        }
        onLens={(value) => patchCurrentShot({ camera: { lens: value } })}
        onHeight={(value) => patchCurrentShot({ camera: { height: value } })}
        onSpeed={(value) => patchCurrentShot({ movement: { speed: value } })}
        onPreview={() => setPreviewing((value) => !value)}
        onGenerate={() => void generateShots()}
        onExport={() => setExportOpen(true)}
        onReference={() =>
          void analyzeReference(state.toneSkill?.dataUrl ?? state.imageDataUrl ?? undefined)
        }
        onLanguage={() => setShowKb((value) => !value)}
      />

      {toast ? (
        <div className={`toast sky-glass gemini-glow ${toast.kind === "err" ? "err" : "ok"}`}>
          <button type="button" className="panel-x" onClick={() => setToast(null)}>
            ×
          </button>
          {toast.text}
        </div>
      ) : null}

      {dnaChips.length ? (
        <section className="shot-pattern sky-glass" aria-label="shot pattern">
          <span>SHOT PATTERN</span>
          {dnaChips.map((chip) => (
            <em key={chip}>{chip}</em>
          ))}
        </section>
      ) : null}

      <DraggablePanel
        className="model-dock sky-glass"
        ignore=".panel-x, .model-menu, input"
      >
        <input
          ref={modelInputRef}
          type="file"
          accept={SCENE_MODEL_ACCEPT}
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) {
              setModelOpen(false);
              void ingestModel(file);
            }
          }}
        />
        <button
          type="button"
          className="panel-x"
          aria-label="关闭"
          onClick={() => setModelOpen(false)}
        >
          ×
        </button>
        <button type="button" className="model-pick" onClick={() => setModelOpen((v) => !v)}>
          <strong>场景模型</strong>
          <span>
            {state.space.kind === "upload"
              ? state.modelName
              : "Example · 厅堂代理"}
          </span>
        </button>
        {modelOpen ? (
          <div className="model-menu" role="menu">
            <button type="button" onClick={() => modelInputRef.current?.click()}>
              + 上传模型
              <small>{SCENE_MODEL_FORMATS}</small>
            </button>
            <button
              type="button"
              className={state.space.kind === "upload" ? "" : "on"}
              onClick={restoreExample}
            >
              Example
              <small>当前预览厅堂</small>
            </button>
          </div>
        ) : null}
      </DraggablePanel>

      <div className={timelineOpen ? "composer-dock timeline-up" : "composer-dock"}>
        {state.pending ? (
          <DraggablePanel>
          <div className="changes sky-glass">
            <button
              type="button"
              className="panel-x"
              aria-label="关闭"
              onClick={() => dispatch({ type: "pending", pending: null })}
            >
              ×
            </button>
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
          </DraggablePanel>
        ) : null}

        <DraggablePanel>
        <section className="composer gemini-glow" aria-label="Director prompt">
          {state.busy ? <p className="composer-status">{state.busy}</p> : null}
          <div className="composer-shell">
            <label className="composer-plus" title="全片调性参考（本次对话 skill）">
              +
              <input
                ref={toneInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) {
                    return;
                  }
                  dispatch({
                    type: "tone",
                    name: file.name,
                    dataUrl: await readFileAsDataUrl(file),
                  });
                  void addFromFile(file, { kind: "image" });
                }}
              />
            </label>
            {state.toneSkill ? (
              <img className="tone-chip" src={state.toneSkill.dataUrl} alt="" title={state.toneSkill.name} />
            ) : null}
            <textarea
              className="prompt"
              placeholder="用自然语言描述镜头与空间… 如：选中红色椅子，镜头靠近"
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
              disabled={!state.instruction.trim() || state.busy !== null}
              onClick={() => void runDirector(state.instruction)}
            >
              ↑
            </button>
          </div>
        </section>
        </DraggablePanel>
      </div>
      </div>
      {introDone ? null : <IntroSplash onDone={finishIntro} />}
    </div>
  );
}
