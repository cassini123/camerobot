import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/onnxruntime-web/dist");
const dest = join(root, "public/flyvision/ort");
const files = [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
];

if (!existsSync(src)) {
  console.warn("onnxruntime-web is not installed; skip ORT wasm copy");
  process.exit(0);
}

mkdirSync(dest, { recursive: true });
for (const file of files) {
  const from = join(src, file);
  if (!existsSync(from)) {
    throw new Error(`missing ${from}`);
  }
  copyFileSync(from, join(dest, file));
}
console.log(`copied ORT wasm → ${dest}`);
