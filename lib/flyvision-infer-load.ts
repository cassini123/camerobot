import { pathToFileURL } from "node:url";
import path from "node:path";

type InferModule = {
  ready: () => Promise<{ yolo: boolean; clip: boolean }>;
  runYolo: (tensor: Float32Array) => Promise<{ data: Float32Array; dims: number[] }>;
  runClip: (tensor: Float32Array) => Promise<number[]>;
};

let cached: Promise<InferModule> | null = null;

const dynamicImport = new Function(
  "specifier",
  "return import(specifier)",
) as (specifier: string) => Promise<InferModule>;

export function loadFlyvisionInfer(): Promise<InferModule> {
  if (!cached) {
    const href = pathToFileURL(
      path.join(process.cwd(), "scripts/flyvision-infer.mjs"),
    ).href;
    cached = dynamicImport(href);
  }
  return cached;
}
