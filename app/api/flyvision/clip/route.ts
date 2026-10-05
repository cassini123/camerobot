import { NextResponse } from "next/server";
import { loadFlyvisionInfer } from "@/lib/flyvision-infer-load";
import { l2Normalize } from "@/lib/clip-embed";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const buf = await request.arrayBuffer();
    if (buf.byteLength < 4) {
      return NextResponse.json({ error: "empty tensor" }, { status: 400 });
    }
    const infer = await loadFlyvisionInfer();
    const raw = await infer.runClip(new Float32Array(buf));
    return NextResponse.json({ embedding: l2Normalize(raw) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "clip failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
