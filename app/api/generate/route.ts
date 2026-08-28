import { NextRequest, NextResponse } from "next/server";
import type { GenerateKind } from "@/lib/generate-intent";
import { hasAholoKey, pollAholoJob, startAholoJob, uploadAholoBuffer } from "@/lib/aholo";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseDataUrl(dataUrl: string): { buffer: Buffer; filename: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }
  const mime = match[1];
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return { buffer: Buffer.from(match[2], "base64"), filename: `ref.${ext}` };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    kind?: GenerateKind;
    prompt?: string;
    imageDataUrl?: string;
  };
  const kind: GenerateKind = body.kind === "world" ? "world" : "object";
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "缺少 prompt" }, { status: 400 });
  }
  if (!hasAholoKey()) {
    return NextResponse.json({
      configured: false,
      kind,
      prompt,
      message: "缺少 AHOLO_API_KEY，已写入素材库占位。把 key 配到 Vercel 后即可真生成。",
    });
  }
  try {
    let imageUrl: string | undefined;
    if (body.imageDataUrl) {
      const parsed = parseDataUrl(body.imageDataUrl);
      if (parsed) {
        imageUrl = await uploadAholoBuffer(parsed.buffer, parsed.filename);
      }
    }
    const job = await startAholoJob({ kind, prompt, imageUrl });
    return NextResponse.json({ configured: true, ...job, prompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Aholo 创建任务失败";
    return NextResponse.json({ error: message, configured: true }, { status: 502 });
  }
}

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind") === "world" ? "world" : "object";
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  }
  if (!hasAholoKey()) {
    return NextResponse.json({ status: "SUCCEEDED", configured: false });
  }
  try {
    const result = await pollAholoJob(kind, id);
    return NextResponse.json({ configured: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "查询失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
