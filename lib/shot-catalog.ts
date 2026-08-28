import type { MovementType, Shot } from "./types";

export type ShotPrimary =
  | "movement"
  | "type"
  | "fx"
  | "color";

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
    id: "ecu",
    primary: "type",
    label: "大特写 ECU",
    hint: "脸或手部细节",
    keywords: ["特写", "ecu", "大特写"],
    instruction: "换成大特写，贴近主体面部或手部细节。",
  },
  {
    id: "cu",
    primary: "type",
    label: "特写 CU",
    hint: "肩部以上",
    keywords: ["特写", "cu"],
    instruction: "换成人物特写，肩部以上。",
  },
  {
    id: "ms",
    primary: "type",
    label: "中景 MS",
    hint: "腰部以上",
    keywords: ["中景", "ms"],
    instruction: "换成中景，交代人物与近处道具。",
  },
  {
    id: "ws",
    primary: "type",
    label: "全景 WS",
    hint: "人与空间同框",
    keywords: ["全景", "远景", "ws"],
    instruction: "换成全景，人物与建筑同框。",
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
    id: "ots",
    primary: "type",
    label: "过肩 OTS",
    hint: "从人物后方看向空间",
    keywords: ["过肩", "ots"],
    instruction: "从人物过肩看向建筑正面。",
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
