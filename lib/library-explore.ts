export const MODEL_FORMATS = ["plz", "ply", "usdz", "obj", "spz", "fbx"] as const;
export type ModelFormat = (typeof MODEL_FORMATS)[number];

export type ExploreItem = {
  id: string;
  title: string;
  body: string;
  kind: "video";
  src: string;
  kicker: string;
  span: "tall" | "wide" | "square";
  who?: string;
  placeId?: string;
};

export const EXPLORE_FEED: ExploreItem[] = [
  {
    id: "pv-continent",
    title: "大陆聚焦 · 背影与兽",
    kicker: "游戏 PV",
    body: "从大陆尺度落到具体地点，人物背影走入战场，与几只怪兽交锋。",
    kind: "video",
    src: "/explore/clip-pv.mp4",
    span: "wide",
    who: "heng",
    placeId: "ridge",
  },
  {
    id: "market-track",
    title: "横移集市 · 花瓣",
    kicker: "移 TRACKING",
    body: "小人越过画面，下一镜集市买花，撞到镜头花瓣洒落，再横移切进另一条街。",
    kind: "video",
    src: "/explore/clip-market.mp4",
    span: "wide",
    who: "you",
    placeId: "east-port",
  },
  {
    id: "drone-f1",
    title: "无人机编队",
    kicker: "空中交错",
    body: "你是一架无人机。多机在空中交错穿行，节奏接近 F1 编队。",
    kind: "video",
    src: "/explore/clip-drone.mp4",
    span: "wide",
    who: "bei",
    placeId: "isles",
  },
  {
    id: "static-lock",
    title: "定 · 锁死机位",
    kicker: "定 STATIC",
    body: "机位完全锁死，只交代构图与空间关系。",
    kind: "video",
    src: "/explore/clip-static.mp4",
    span: "tall",
    who: "heng",
    placeId: "north-bay",
  },
  {
    id: "dolly-in",
    title: "推 · 沿光轴靠近",
    kicker: "推 DOLLY IN",
    body: "镜头沿光轴推进，从环境落到主体。",
    kind: "video",
    src: "/explore/clip-dolly-in.mp4",
    span: "square",
    who: "you",
    placeId: "ridge",
  },
  {
    id: "dolly-out",
    title: "拉 · 交代环境",
    kicker: "拉 DOLLY OUT",
    body: "远离主体，把人物放回更大的场景里。",
    kind: "video",
    src: "/explore/clip-dolly-out.mp4",
    span: "tall",
    who: "bei",
    placeId: "south-cape",
  },
  {
    id: "pan-scan",
    title: "摇 · 水平扫过",
    kicker: "摇 PAN",
    body: "机位不动，镜头水平摇过空间。",
    kind: "video",
    src: "/explore/clip-pan.mp4",
    span: "wide",
    who: "heng",
    placeId: "east-port",
  },
  {
    id: "follow-move",
    title: "跟 · 侧后走位",
    kicker: "跟 FOLLOW",
    body: "侧后方跟拍人物走位，可绕到建筑正面。",
    kind: "video",
    src: "/explore/clip-track.mp4",
    span: "tall",
    who: "bei",
    placeId: "ridge",
  },
];

export function downloadUrl(id: string, format: ModelFormat): string {
  return `/api/explore/download/${id}/${format}`;
}
