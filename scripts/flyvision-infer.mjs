/** Local Node YOLO/CLIP. Browser never imports wasm. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DIST = `${path.join(process.cwd(), "node_modules/onnxruntime-web/dist")}/`;
const YOLO_PATH = path.join(process.cwd(), "public/flyvision/yolov8n.onnx");
const CLIP_PATH = path.join(process.cwd(), "public/flyvision/mobileclip2-s0.onnx");

let ortPromise = null;

async function getOrt() {
  if (!ortPromise) {
    ortPromise = (async () => {
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = pathToFileURL(DIST).href;
      return ort;
    })();
  }
  return ortPromise;
}

async function loadSession(file, cache) {
  if (!cache.promise) {
    cache.promise = (async () => {
      const ort = await getOrt();
      const model = await readFile(file);
      return ort.InferenceSession.create(model, {
        executionProviders: ["wasm"],
      });
    })();
  }
  return cache.promise;
}

const yoloCache = { promise: null };
const clipCache = { promise: null };

export async function ensureYolo() {
  return loadSession(YOLO_PATH, yoloCache);
}

export async function ensureClip() {
  return loadSession(CLIP_PATH, clipCache);
}

export async function ready() {
  await ensureYolo();
  let clip = false;
  try {
    await ensureClip();
    clip = true;
  } catch {
    clip = false;
  }
  return { yolo: true, clip };
}

export async function runYolo(tensor) {
  const ort = await getOrt();
  const session = await ensureYolo();
  const input = new ort.Tensor("float32", tensor, [1, 3, 640, 640]);
  const out = await session.run({ [session.inputNames[0]]: input });
  const first = out[session.outputNames[0]];
  return {
    data: Float32Array.from(first.data),
    dims: Array.from(first.dims),
  };
}

export async function runClip(tensor) {
  const ort = await getOrt();
  const session = await ensureClip();
  const input = new ort.Tensor("float32", tensor, [1, 3, 256, 256]);
  const out = await session.run({
    [session.inputNames[0] || "pixel_values"]: input,
  });
  const first = out[session.outputNames[0] || "image_embeds"];
  return Array.from(first.data);
}
