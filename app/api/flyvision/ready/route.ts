import { NextResponse } from "next/server";
import { loadFlyvisionInfer } from "@/lib/flyvision-infer-load";

export const runtime = "nodejs";

export async function GET() {
  try {
    const infer = await loadFlyvisionInfer();
    const status = await infer.ready();
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "YOLO 本机加载失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
