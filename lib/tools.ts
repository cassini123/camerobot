export type ToolId =
  | "move"
  | "follow"
  | "orbit"
  | "dolly"
  | "lens"
  | "height"
  | "speed"
  | "preview"
  | "generate"
  | "export"
  | "reference"
  | "language";

export interface StudioTool {
  id: ToolId;
  icon: string;
  label: string;
  keywords: string[];
  hint: string;
}

export const STUDIO_TOOLS: StudioTool[] = [
  {
    id: "move",
    icon: "✥",
    label: "摆放",
    keywords: ["移动", "摆", "物体", "拖", "右键", "放置", "人物走", "挪", "选中", "点选"],
    hint: "按住触控板右键拖动物体，两视口同步",
  },
  {
    id: "follow",
    icon: "↪",
    label: "跟拍",
    keywords: ["跟拍", "跟随", "侧后", "follow", "tracking"],
    hint: "侧后跟拍，可绕到建筑正面",
  },
  {
    id: "orbit",
    icon: "↻",
    label: "环绕",
    keywords: ["环绕", "绕到", "绕", "orbit", "环"],
    hint: "绕主体旋转，揭示立面",
  },
  {
    id: "dolly",
    icon: "⇔",
    label: "推拉",
    keywords: ["推", "拉", "靠近", "远离", "dolly", "推进"],
    hint: "沿光轴推近或拉远",
  },
  {
    id: "lens",
    icon: "◎",
    label: "焦段",
    keywords: ["焦段", "广角", "长焦", "35mm", "镜头", "电影感", "mm"],
    hint: "调整镜头焦段",
  },
  {
    id: "height",
    icon: "↕",
    label: "机位",
    keywords: ["机位", "高度", "低", "仰拍", "俯"],
    hint: "调整摄影机高度",
  },
  {
    id: "speed",
    icon: "⏱",
    label: "速度",
    keywords: ["慢", "快", "速度", "放慢", "走慢"],
    hint: "人物与镜头运动速度",
  },
  {
    id: "preview",
    icon: "▶",
    label: "预览",
    keywords: ["预览", "preview", "播放"],
    hint: "沿路径预演镜头",
  },
  {
    id: "generate",
    icon: "✦",
    label: "生成",
    keywords: ["生成", "分镜", "generate shots", "generate"],
    hint: "根据场景与参考生成镜头",
  },
  {
    id: "export",
    icon: "⇧",
    label: "导出",
    keywords: ["导出", "export", "json", "视频", "pdf", "excel"],
    hint: "JSON / 视频 / 静帧",
  },
  {
    id: "reference",
    icon: "▣",
    label: "参考",
    keywords: ["参考", "visual dna", "shot pattern", "构图", "参考图"],
    hint: "分析参考图 shot pattern",
  },
  {
    id: "language",
    icon: "⌘",
    label: "镜头语言",
    keywords: ["镜头语言", "运镜", "dolly", "pan"],
    hint: "推拉摇移跟环",
  },
];

export function matchTools(text: string): ToolId[] {
  const source = text.trim().toLowerCase();
  if (!source) {
    return [];
  }
  return STUDIO_TOOLS.filter((tool) =>
    tool.keywords.some((keyword) => source.includes(keyword.toLowerCase())),
  ).map((tool) => tool.id);
}
