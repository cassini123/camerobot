import type { MovementType, Shot } from "./types";
import { deepMerge } from "./patch";
import { heuristicDirector } from "./fallbacks";

export type ShotPrimary = "movement" | "type" | "fx" | "color";

export const SHOT_PRIMARY: { id: ShotPrimary; label: string }[] = [
  { id: "movement", label: "镜头运动形式" },
  { id: "type", label: "镜头类型" },
  { id: "fx", label: "特殊效果" },
  { id: "color", label: "色彩效果" },
];

export const MOVEMENT_GROUPS: { type: MovementType; label: string; hint: string }[] = [
  { type: "STATIC", label: "定 STATIC", hint: "机位锁死，交代构图。" },
  { type: "DOLLY_IN", label: "推 DOLLY IN", hint: "沿光轴靠近主体。" },
  { type: "DOLLY_OUT", label: "拉 DOLLY OUT", hint: "远离主体，交代环境。" },
  { type: "PAN", label: "摇 PAN", hint: "机位不动，镜头水平扫过。" },
  { type: "TRACKING", label: "移 TRACKING", hint: "平行跟随人物走位。" },
  { type: "FOLLOW", label: "跟 FOLLOW", hint: "侧后跟拍，可绕到建筑正面。" },
  { type: "ORBIT", label: "环 ORBIT", hint: "绕主体旋转，揭示立面。" },
];

export type CatalogPreset = {
  id: string;
  primary: Exclude<ShotPrimary, "movement">;
  label: string;
  hint: string;
  keywords: string[];
  instruction: string;
};

export const SHOT_PRESETS: CatalogPreset[] = [
  {
    id: "ots",
    primary: "type",
    label: "过肩 OTS",
    hint: "从人物后方看向空间",
    keywords: ["过肩", "ots"],
    instruction: "从人物过肩看向建筑正面。",
  },
  {
    id: "establishing",
    primary: "type",
    label: "建立镜头",
    hint: "先交代空间",
    keywords: ["建立", "establishing"],
    instruction: "用建立镜头先交代厅堂空间关系。",
  },
  {
    id: "character",
    primary: "type",
    label: "人物",
    hint: "跟人物走位",
    keywords: ["人物", "character"],
    instruction: "换成人物镜头，跟拍主体。",
  },
  {
    id: "slowmo",
    primary: "fx",
    label: "慢动作",
    hint: "时间被拉长",
    keywords: ["慢动作", "slow"],
    instruction: "让人物和镜头都更慢，接近慢动作。",
  },
  {
    id: "dutch",
    primary: "fx",
    label: "荷兰角",
    hint: "倾斜地平线",
    keywords: ["荷兰", "倾斜", "dutch"],
    instruction: "稍微倾斜机位，荷兰角，增加不安感。",
  },
  {
    id: "crash",
    primary: "fx",
    label: "急推",
    hint: "短促 dolly in",
    keywords: ["急推", "crash"],
    instruction: "快速推进靠近主体。",
  },
  {
    id: "handheld",
    primary: "fx",
    label: "手持感",
    hint: "轻微呼吸感",
    keywords: ["手持", "handheld"],
    instruction: "带一点手持呼吸感，不要完全锁死。",
  },
  {
    id: "fisheye",
    primary: "fx",
    label: "鱼眼镜头",
    hint: "超广变形视野",
    keywords: ["鱼眼", "fisheye"],
    instruction: "换成鱼眼镜头，超广角变形视野。",
  },
  {
    id: "black_soft",
    primary: "fx",
    label: "柔焦 · 黑柔",
    hint: "暗部晕开、对比压低",
    keywords: ["柔焦", "黑柔", "black"],
    instruction: "加上黑柔焦，暗部晕开。",
  },
  {
    id: "white_soft",
    primary: "fx",
    label: "柔焦 · 白柔",
    hint: "亮部抬起、一层薄雾",
    keywords: ["柔焦", "白柔", "white"],
    instruction: "加上白柔焦，亮部抬起一层薄雾。",
  },
  {
    id: "warm",
    primary: "color",
    label: "暖调",
    hint: "金色厅堂光",
    keywords: ["暖", "金", "warm"],
    instruction: "色彩更暖，金色厅堂光。",
  },
  {
    id: "cool",
    primary: "color",
    label: "冷调",
    hint: "青蓝阴影",
    keywords: ["冷", "青", "cool"],
    instruction: "色彩更冷，阴影偏青蓝。",
  },
  {
    id: "contrast",
    primary: "color",
    label: "高对比",
    hint: "亮暗拉开",
    keywords: ["对比", "contrast"],
    instruction: "提高对比，亮部保留暖金，暗部更深。",
  },
  {
    id: "teal",
    primary: "color",
    label: "青橙",
    hint: "人物暖、环境冷",
    keywords: ["青橙", "teal"],
    instruction: "人物偏暖橙，环境偏青。",
  },
];

export function movementOf(shot: Shot): string {
  return (shot.movement.type || "STATIC").toUpperCase();
}

export function applyPresetToShot(preset: CatalogPreset, shot: Shot): Shot {
  if (preset.id === "ots") {
    return {
      ...shot,
      kind: "follow",
      title: "过肩",
      target: { ...shot.target, type: "person" },
      camera: { ...shot.camera, lens: 35, height: 1.55, angle: "rear_3_4" },
      movement: { ...shot.movement, type: "FOLLOW" },
    };
  }
  if (preset.id === "establishing") {
    return {
      ...shot,
      kind: "establishing",
      title: "建立",
      target: { ...shot.target, type: "building" },
      camera: { ...shot.camera, lens: 24, height: 2.1, angle: "eye_level" },
      movement: { ...shot.movement, type: "DOLLY_IN" },
    };
  }
  if (preset.id === "character") {
    return {
      ...shot,
      kind: "character",
      title: "人物",
      target: { ...shot.target, type: "person" },
      camera: { ...shot.camera, lens: 50, height: 1.5, angle: "eye_level" },
      movement: { ...shot.movement, type: "TRACKING" },
    };
  }
  if (preset.id === "fisheye") {
    return {
      ...shot,
      lensStyle: "fisheye",
      camera: { ...shot.camera, lens: 12 },
    };
  }
  if (preset.id === "black_soft") {
    return { ...shot, look: "black_soft" };
  }
  if (preset.id === "white_soft") {
    return { ...shot, look: "white_soft" };
  }
  if (preset.id === "slowmo") {
    const speed = 0.45;
    const duration =
      Math.round((shot.movement.duration / (shot.movement.speed || 1)) * (1 / speed) * 10) / 10;
    return {
      ...shot,
      movement: { ...shot.movement, speed, duration },
    };
  }
  if (preset.id === "dutch") {
    return { ...shot, camera: { ...shot.camera, angle: "dutch" } };
  }
  if (preset.id === "crash") {
    return {
      ...shot,
      movement: { ...shot.movement, type: "DOLLY_IN", duration: 1.2, speed: 1.45 },
    };
  }
  if (preset.id === "handheld") {
    return { ...shot, handheld: true };
  }
  if (preset.id === "warm") {
    return { ...shot, color: { temperature: "warm", contrast: shot.color?.contrast ?? "medium" } };
  }
  if (preset.id === "cool") {
    return { ...shot, color: { temperature: "cool", contrast: shot.color?.contrast ?? "medium" } };
  }
  if (preset.id === "contrast") {
    return {
      ...shot,
      color: { temperature: shot.color?.temperature ?? "warm", contrast: "high" },
    };
  }
  if (preset.id === "teal") {
    return { ...shot, color: { temperature: "teal_orange", contrast: "high" } };
  }
  const local = heuristicDirector(preset.instruction, shot);
  return deepMerge(shot, local.patch) as Shot;
}

export function presetMatchesShot(preset: CatalogPreset, shot: Shot | undefined): boolean {
  if (!shot) {
    return false;
  }
  switch (preset.id) {
    case "ots":
      return shot.kind === "follow" && shot.camera.angle === "rear_3_4";
    case "establishing":
      return shot.kind === "establishing";
    case "character":
      return shot.kind === "character";
    case "fisheye":
      return shot.lensStyle === "fisheye";
    case "black_soft":
      return shot.look === "black_soft";
    case "white_soft":
      return shot.look === "white_soft";
    case "slowmo":
      return (shot.movement.speed ?? 1) < 0.75;
    case "dutch":
      return shot.camera.angle === "dutch";
    case "crash":
      return shot.movement.type === "DOLLY_IN" && shot.movement.duration <= 1.6;
    case "handheld":
      return Boolean(shot.handheld);
    case "warm":
      return shot.color?.temperature === "warm";
    case "cool":
      return shot.color?.temperature === "cool";
    case "contrast":
      return shot.color?.contrast === "high";
    case "teal":
      return shot.color?.temperature === "teal_orange";
    default:
      return false;
  }
}

export function searchShotBoard(
  query: string,
  shots: Shot[],
  presets: CatalogPreset[],
): { shots: Shot[]; presets: CatalogPreset[] } {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { shots, presets };
  }
  return {
    shots: shots.filter((shot) =>
      `${shot.title} ${shot.movement.type} ${shot.kind} ${shot.camera.lens}`
        .toLowerCase()
        .includes(q),
    ),
    presets: presets.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.hint.toLowerCase().includes(q) ||
        item.keywords.some((word) => word.toLowerCase().includes(q)),
    ),
  };
}
