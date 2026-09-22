/** MobileCLIP2-S0 vision encoder via onnxruntime-web. */

import type { RgbPixels } from "./flyvision-match";
import { cosineSimilarity } from "./flyvision-match";

export const CLIP_INPUT = 256;
export const CLIP_DIM = 512;
export const CLIP_MODEL_URL = "/flyvision/mobileclip2-s0.onnx";
export const CLIP_WASM_CDN =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/";

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

export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return vector.slice();
  }
  return vector.map((value) => value / norm);
}

export function clipTensor(image: RgbPixels): Float32Array {
  const tensor = new Float32Array(3 * CLIP_INPUT * CLIP_INPUT);
  const side = Math.min(image.width, image.height);
  const x0 = Math.floor((image.width - side) / 2);
  const y0 = Math.floor((image.height - side) / 2);
  const plane = CLIP_INPUT * CLIP_INPUT;
  for (let y = 0; y < CLIP_INPUT; y += 1) {
    const srcY = Math.min(side - 1, Math.floor((y * side) / CLIP_INPUT) + y0);
    for (let x = 0; x < CLIP_INPUT; x += 1) {
      const srcX = Math.min(side - 1, Math.floor((x * side) / CLIP_INPUT) + x0);
      const src = (srcY * image.width + srcX) * 3;
      const dest = y * CLIP_INPUT + x;
      tensor[dest] = image.pixels[src] / 255;
      tensor[plane + dest] = image.pixels[src + 1] / 255;
      tensor[2 * plane + dest] = image.pixels[src + 2] / 255;
    }
  }
  return tensor;
}

export async function getClipSession(): Promise<OrtSession> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const ort = await getOrt();
      return ort.InferenceSession.create(CLIP_MODEL_URL, {
        executionProviders: ["wasm"],
      });
    })();
  }
  return sessionPromise;
}

export async function embedClip(image: RgbPixels): Promise<number[]> {
  const releaseWait = inferLock;
  let release!: () => void;
  inferLock = new Promise((resolve) => {
    release = resolve;
  });
  await releaseWait;
  try {
    const session = await getClipSession();
    const ort = await getOrt();
    const input = new ort.Tensor("float32", clipTensor(image), [1, 3, CLIP_INPUT, CLIP_INPUT]);
    const out = await session.run({ [session.inputNames[0] || "pixel_values"]: input });
    const first = out[session.outputNames[0] || "image_embeds"];
    return l2Normalize(Array.from(first.data as Float32Array));
  } finally {
    release();
  }
}

export function clipCosine(left: number[], right: number[]): number {
  return cosineSimilarity(left, right);
}

async function getOrt(): Promise<OrtRuntime> {
  if (ortModule) {
    return ortModule;
  }
  const ort = (await import("onnxruntime-web")) as unknown as OrtRuntime;
  ort.env.wasm.wasmPaths = CLIP_WASM_CDN;
  ort.env.wasm.numThreads = 1;
  ortModule = ort;
  return ort;
}
