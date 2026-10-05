/** Talk to the local Next infer API. No onnxruntime in the browser. */

export const FLYVISION_READY_URL = "/api/flyvision/ready";
export const FLYVISION_DETECT_URL = "/api/flyvision/detect";
export const FLYVISION_CLIP_URL = "/api/flyvision/clip";

function float32Body(tensor: Float32Array): ArrayBuffer {
  const copy = new ArrayBuffer(tensor.byteLength);
  new Uint8Array(copy).set(
    new Uint8Array(tensor.buffer, tensor.byteOffset, tensor.byteLength),
  );
  return copy;
}

export async function postFloat32(
  url: string,
  tensor: Float32Array,
  headers: Record<string, string> = {},
): Promise<Response> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      ...headers,
    },
    body: float32Body(tensor),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `infer HTTP ${res.status}`);
  }
  return res;
}

export async function pingFlyvisionReady(): Promise<{ yolo: boolean; clip: boolean }> {
  const res = await fetch(FLYVISION_READY_URL, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "本机 YOLO 没起来。确认 npm run dev 在跑，不要开 Vercel");
  }
  return res.json() as Promise<{ yolo: boolean; clip: boolean }>;
}
