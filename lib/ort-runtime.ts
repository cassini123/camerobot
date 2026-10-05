/** Same-origin onnxruntime-web. CAM AP has no CDN. */

export const ORT_WASM_DIR = "/flyvision/ort/";

export const ORT_WASM_FILES = {
  mjs: `${ORT_WASM_DIR}ort-wasm-simd-threaded.mjs`,
  wasm: `${ORT_WASM_DIR}ort-wasm-simd-threaded.wasm`,
} as const;

export type OrtRuntime = {
  env: {
    wasm: {
      wasmPaths: string | { mjs?: string; wasm?: string };
      numThreads: number;
      proxy?: boolean;
    };
  };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => unknown;
  InferenceSession: {
    create: (
      path: string,
      options: { executionProviders: string[] },
    ) => Promise<OrtSession>;
  };
};

export type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  run: (feeds: Record<string, unknown>) => Promise<
    Record<string, { data: Float32Array; dims: readonly number[] }>
  >;
};

let ortModule: OrtRuntime | null = null;
let ortPromise: Promise<OrtRuntime> | null = null;

export function isLocalOrtPath(path: string): boolean {
  return path.startsWith("/") && !/^https?:\/\//.test(path);
}

export async function getOrt(): Promise<OrtRuntime> {
  if (ortModule) {
    return ortModule;
  }
  if (!ortPromise) {
    ortPromise = (async () => {
      const ort = (await import("onnxruntime-web")) as unknown as OrtRuntime;
      ort.env.wasm.wasmPaths = { ...ORT_WASM_FILES };
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ortModule = ort;
      return ort;
    })();
  }
  return ortPromise;
}
