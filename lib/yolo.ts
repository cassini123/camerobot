/** YOLOv8n via the local Next infer API. No browser wasm. */

import type { BBox } from "./flyvision-match";
import {
  FLYVISION_DETECT_URL,
  pingFlyvisionReady,
  postFloat32,
} from "./flyvision-infer-client";

export const YOLO_WASM_PATHS = "/api/flyvision/";

export const YOLO_INPUT = 640;
export const YOLO_CONF = 0.35;
export const YOLO_IOU = 0.45;
export const YOLO_MODEL_URL = "/flyvision/yolov8n.onnx";

export const COCO_LABELS = [
  "person",
  "bicycle",
  "car",
  "motorcycle",
  "airplane",
  "bus",
  "train",
  "truck",
  "boat",
  "traffic light",
  "fire hydrant",
  "stop sign",
  "parking meter",
  "bench",
  "bird",
  "cat",
  "dog",
  "horse",
  "sheep",
  "cow",
  "elephant",
  "bear",
  "zebra",
  "giraffe",
  "backpack",
  "umbrella",
  "handbag",
  "tie",
  "suitcase",
  "frisbee",
  "skis",
  "snowboard",
  "sports ball",
  "kite",
  "baseball bat",
  "baseball glove",
  "skateboard",
  "surfboard",
  "tennis racket",
  "bottle",
  "wine glass",
  "cup",
  "fork",
  "knife",
  "spoon",
  "bowl",
  "banana",
  "apple",
  "sandwich",
  "orange",
  "broccoli",
  "carrot",
  "hot dog",
  "pizza",
  "donut",
  "cake",
  "chair",
  "couch",
  "potted plant",
  "bed",
  "dining table",
  "toilet",
  "tv",
  "laptop",
  "mouse",
  "remote",
  "keyboard",
  "cell phone",
  "microwave",
  "oven",
  "toaster",
  "sink",
  "refrigerator",
  "book",
  "clock",
  "vase",
  "scissors",
  "teddy bear",
  "hair drier",
  "toothbrush",
] as const;

export type YoloDet = {
  label: string;
  score: number;
  box: BBox;
};

let sessionPromise: Promise<void> | null = null;
let inferLock: Promise<void> = Promise.resolve();

export function boxIou(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

export function nms(dets: YoloDet[], iouThresh = YOLO_IOU): YoloDet[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const kept: YoloDet[] = [];
  for (const item of sorted) {
    if (kept.every((other) => boxIou(item.box, other.box) < iouThresh)) {
      kept.push(item);
    }
  }
  return kept;
}

export function decodeYoloOutput(
  data: Float32Array,
  dims: readonly number[],
  origW: number,
  origH: number,
  scale: number,
  padX: number,
  padY: number,
  confThresh = YOLO_CONF,
): YoloDet[] {
  const shape = layout(dims);
  const raw: YoloDet[] = [];
  for (let i = 0; i < shape.anchors; i += 1) {
    const cx = at(data, shape, 0, i);
    const cy = at(data, shape, 1, i);
    const w = at(data, shape, 2, i);
    const h = at(data, shape, 3, i);
    let best = 0;
    let bestCls = 0;
    for (let c = 0; c < COCO_LABELS.length; c += 1) {
      const score = at(data, shape, 4 + c, i);
      if (score > best) {
        best = score;
        bestCls = c;
      }
    }
    if (best < confThresh) {
      continue;
    }
    const x1 = (cx - w / 2 - padX) / scale;
    const y1 = (cy - h / 2 - padY) / scale;
    const box: BBox = {
      x: clamp01(x1 / origW),
      y: clamp01(y1 / origH),
      w: clamp01(w / scale / origW),
      h: clamp01(h / scale / origH),
    };
    if (box.x + box.w > 1) {
      box.w = 1 - box.x;
    }
    if (box.y + box.h > 1) {
      box.h = 1 - box.y;
    }
    if (box.w <= 0.002 || box.h <= 0.002) {
      continue;
    }
    raw.push({
      label: COCO_LABELS[bestCls] ?? "object",
      score: best,
      box,
    });
  }
  return nms(raw);
}

export function primarySubject(dets: YoloDet[]): YoloDet | null {
  if (!dets.length) {
    return null;
  }
  const people = dets.filter((item) => item.label === "person");
  const pool = people.length ? people : dets;
  return pool.reduce((best, item) =>
    item.score * item.box.w * item.box.h > best.score * best.box.w * best.box.h
      ? item
      : best,
  );
}

/**
 * Keep the same subject across frames (IoU lock) and smooth the box
 * with a constant-velocity Kalman. This is for temporal stability,
 * not for publishing meters as RTK.
 */
export class SubjectTracker {
  private prev: YoloDet | null = null;
  private kf: {
    cx: number;
    cy: number;
    w: number;
    h: number;
    vx: number;
    vy: number;
    p: number;
  } | null = null;

  constructor(
    private readonly iouMin = 0.3,
    private readonly q = 0.04,
    private readonly r = 0.12,
  ) {}

  reset(): void {
    this.prev = null;
    this.kf = null;
  }

  push(dets: YoloDet[]): YoloDet | null {
    const picked = this.pick(dets);
    if (!picked) {
      this.reset();
      return null;
    }
    const measCx = picked.box.x + picked.box.w / 2;
    const measCy = picked.box.y + picked.box.h / 2;
    if (!this.kf) {
      this.kf = {
        cx: measCx,
        cy: measCy,
        w: picked.box.w,
        h: picked.box.h,
        vx: 0,
        vy: 0,
        p: 1,
      };
    } else {
      this.kf.cx += this.kf.vx;
      this.kf.cy += this.kf.vy;
      this.kf.p += this.q;
      const gain = this.kf.p / (this.kf.p + this.r);
      const dx = measCx - this.kf.cx;
      const dy = measCy - this.kf.cy;
      this.kf.cx += gain * dx;
      this.kf.cy += gain * dy;
      this.kf.vx = (1 - gain) * this.kf.vx + gain * dx;
      this.kf.vy = (1 - gain) * this.kf.vy + gain * dy;
      this.kf.w += gain * (picked.box.w - this.kf.w);
      this.kf.h += gain * (picked.box.h - this.kf.h);
      this.kf.p *= 1 - gain;
    }
    this.prev = picked;
    const w = Math.min(1, Math.max(0.01, this.kf.w));
    const h = Math.min(1, Math.max(0.01, this.kf.h));
    const x = Math.min(1 - w, Math.max(0, this.kf.cx - w / 2));
    const y = Math.min(1 - h, Math.max(0, this.kf.cy - h / 2));
    return { ...picked, box: { x, y, w, h } };
  }

  private pick(dets: YoloDet[]): YoloDet | null {
    if (this.prev) {
      let best: YoloDet | null = null;
      let bestIou = this.iouMin;
      for (const det of dets) {
        if (det.label !== this.prev.label) {
          continue;
        }
        const iou = boxIou(det.box, this.prev.box);
        if (iou >= bestIou) {
          bestIou = iou;
          best = det;
        }
      }
      if (best) {
        return best;
      }
    }
    return primarySubject(dets);
  }
}

export async function detectYolo(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<YoloDet[]> {
  const releaseWait = inferLock;
  let release!: () => void;
  inferLock = new Promise((resolve) => {
    release = resolve;
  });
  await releaseWait;
  try {
    await getYoloSession();
    const { tensor, scale, padX, padY } = letterboxTensor(source, width, height);
    const res = await postFloat32(FLYVISION_DETECT_URL, tensor, {
      "x-orig-w": String(width),
      "x-orig-h": String(height),
      "x-scale": String(scale),
      "x-pad-x": String(padX),
      "x-pad-y": String(padY),
    });
    const body = (await res.json()) as { dets?: YoloDet[]; error?: string };
    if (!body.dets) {
      throw new Error(body.error || "detect empty");
    }
    return body.dets;
  } finally {
    release();
  }
}

export async function getYoloSession(): Promise<void> {
  if (!sessionPromise) {
    sessionPromise = pingFlyvisionReady().then((status) => {
      if (!status.yolo) {
        throw new Error("本机 YOLO 没起来。确认 npm run dev 在跑，不要开 Vercel");
      }
    });
  }
  return sessionPromise;
}

function letterboxTensor(
  source: CanvasImageSource,
  width: number,
  height: number,
): { tensor: Float32Array; scale: number; padX: number; padY: number } {
  const scale = Math.min(YOLO_INPUT / width, YOLO_INPUT / height);
  const newW = Math.round(width * scale);
  const newH = Math.round(height * scale);
  const padX = (YOLO_INPUT - newW) / 2;
  const padY = (YOLO_INPUT - newH) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = YOLO_INPUT;
  canvas.height = YOLO_INPUT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas");
  }
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, YOLO_INPUT, YOLO_INPUT);
  ctx.drawImage(source, padX, padY, newW, newH);
  const rgba = ctx.getImageData(0, 0, YOLO_INPUT, YOLO_INPUT).data;
  const tensor = new Float32Array(3 * YOLO_INPUT * YOLO_INPUT);
  const plane = YOLO_INPUT * YOLO_INPUT;
  for (let i = 0; i < plane; i += 1) {
    tensor[i] = rgba[i * 4] / 255;
    tensor[plane + i] = rgba[i * 4 + 1] / 255;
    tensor[2 * plane + i] = rgba[i * 4 + 2] / 255;
  }
  return { tensor, scale, padX, padY };
}

function layout(dims: readonly number[]): {
  channels: number;
  anchors: number;
  channelMajor: boolean;
} {
  const last = dims[dims.length - 1] ?? 0;
  const mid = dims[dims.length - 2] ?? 0;
  const classDim = 4 + COCO_LABELS.length;
  if (mid === classDim || mid === 84) {
    return { channels: mid, anchors: last, channelMajor: true };
  }
  return { channels: last, anchors: mid, channelMajor: false };
}

function at(
  data: Float32Array,
  shape: { channels: number; anchors: number; channelMajor: boolean },
  channel: number,
  anchor: number,
): number {
  const index = shape.channelMajor
    ? channel * shape.anchors + anchor
    : anchor * shape.channels + channel;
  return data[index] ?? 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
