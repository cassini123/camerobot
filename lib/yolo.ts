/** Browser YOLOv8n via onnxruntime-web. No mock boxes. */

import type { BBox } from "./flyvision-match";

export const YOLO_INPUT = 640;
export const YOLO_CONF = 0.35;
export const YOLO_IOU = 0.45;
export const YOLO_MODEL_URL = "/flyvision/yolov8n.onnx";
export const YOLO_WASM_CDN =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/";

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

type OrtRuntime = {
  env: { wasm: { wasmPaths: string; numThreads: number } };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
  InferenceSession: {
    create: (
      path: string,
      options: { executionProviders: string[] },
    ) => Promise<OrtSession>;
  };
};

type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  run: (feeds: Record<string, unknown>) => Promise<
    Record<string, { data: Float32Array; dims: readonly number[] }>
  >;
};

let ortModule: OrtRuntime | null = null;
let sessionPromise: Promise<OrtSession> | null = null;
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
    const session = await getYoloSession();
    const ort = await getOrt();
    const { tensor, scale, padX, padY } = letterboxTensor(source, width, height);
    const input = new ort.Tensor("float32", tensor, [1, 3, YOLO_INPUT, YOLO_INPUT]);
    const out = await session.run({ [session.inputNames[0]]: input });
    const first = out[session.outputNames[0]];
    const data = first.data as Float32Array;
    return decodeYoloOutput(data, first.dims, width, height, scale, padX, padY);
  } finally {
    release();
  }
}

export async function getYoloSession(): Promise<OrtSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await getOrt();
      return ort.InferenceSession.create(YOLO_MODEL_URL, {
        executionProviders: ["wasm"],
      });
    })();
  }
  return sessionPromise;
}

async function getOrt(): Promise<OrtRuntime> {
  if (ortModule) {
    return ortModule;
  }
  const ort = (await import("onnxruntime-web")) as unknown as OrtRuntime;
  ort.env.wasm.wasmPaths = YOLO_WASM_CDN;
  ort.env.wasm.numThreads = 1;
  ortModule = ort;
  return ort;
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
