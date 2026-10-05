import { NextResponse } from "next/server";
import { loadFlyvisionInfer } from "@/lib/flyvision-infer-load";
import { decodeYoloOutput } from "@/lib/yolo";

export const runtime = "nodejs";

function num(request: Request, name: string, fallback: number): number {
  const raw = request.headers.get(name);
  const value = raw == null ? fallback : Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export async function POST(request: Request) {
  try {
    const buf = await request.arrayBuffer();
    if (buf.byteLength < 4) {
      return NextResponse.json({ error: "empty tensor" }, { status: 400 });
    }
    const tensor = new Float32Array(buf);
    const infer = await loadFlyvisionInfer();
    const raw = await infer.runYolo(tensor);
    const dets = decodeYoloOutput(
      raw.data,
      raw.dims,
      num(request, "x-orig-w", 640),
      num(request, "x-orig-h", 640),
      num(request, "x-scale", 1),
      num(request, "x-pad-x", 0),
      num(request, "x-pad-y", 0),
    );
    return NextResponse.json({ dets });
  } catch (err) {
    const message = err instanceof Error ? err.message : "detect failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
