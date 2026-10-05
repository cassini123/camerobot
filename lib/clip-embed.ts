/** MobileCLIP2-S0 via the local Next infer API. No browser wasm. */

import type { RgbPixels } from "./flyvision-match";
import { cosineSimilarity } from "./flyvision-match";
import { FLYVISION_CLIP_URL, pingFlyvisionReady, postFloat32 } from "./flyvision-infer-client";

export const CLIP_WASM_PATHS = "/api/flyvision/";

export const CLIP_INPUT = 256;
export const CLIP_DIM = 512;
export const CLIP_MODEL_URL = "/flyvision/mobileclip2-s0.onnx";

let sessionPromise: Promise<void> | null = null;
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

export async function getClipSession(): Promise<void> {
  if (!sessionPromise) {
    sessionPromise = pingFlyvisionReady().then((status) => {
      if (!status.clip) {
        throw new Error("CLIP 本机没起来");
      }
    });
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
    await getClipSession();
    const res = await postFloat32(FLYVISION_CLIP_URL, clipTensor(image));
    const body = (await res.json()) as { embedding?: number[]; error?: string };
    if (!body.embedding?.length) {
      throw new Error(body.error || "clip empty");
    }
    return body.embedding;
  } finally {
    release();
  }
}

export function clipCosine(left: number[], right: number[]): number {
  return cosineSimilarity(left, right);
}
