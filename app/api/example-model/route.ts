import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { FULL_EXAMPLE_PLY_BYTES } from "@/lib/space-objects";
import { extOf, sparkHintName, sparkNativeMeta } from "@/lib/splat-formats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DIR = path.join(process.cwd(), "example");
const PLY = path.join(DIR, "model.ply");
const SCRIPT = path.join(process.cwd(), "example", "fetch-model.sh");

/** Prefer compressed 3DGS that Spark can actually decode in a tab. */
const COMPRESSED = ["model.plz", "model.spz", "model.sog", "model.zip", "model.rad"] as const;

function fileMeta(filePath: string) {
  const present = existsSync(filePath);
  const bytes = present ? statSync(filePath).size : 0;
  return { present, bytes };
}

function pickLocal() {
  for (const name of COMPRESSED) {
    const filePath = path.join(DIR, name);
    const info = fileMeta(filePath);
    if (info.present && info.bytes > 1024) {
      const format = extOf(name);
      const native = sparkNativeMeta(format);
      return {
        filePath,
        fileName: sparkHintName(name),
        diskName: name,
        format,
        bytes: info.bytes,
        quality: "full" as const,
        paged: native?.paged ?? false,
        complete: true,
      };
    }
  }
  const ply = fileMeta(PLY);
  const complete = ply.present && ply.bytes >= FULL_EXAMPLE_PLY_BYTES * 0.98;
  return {
    filePath: PLY,
    fileName: "model.ply",
    diskName: "model.ply",
    format: "ply",
    bytes: ply.bytes,
    quality: "preview" as const,
    paged: false,
    complete,
  };
}

function jsonHeaders() {
  return { "Cache-Control": "no-store" };
}

function splatHeaders(fileName: string, extra: Record<string, string> = {}) {
  return {
    "Content-Type": "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Content-Disposition": `inline; filename="${fileName}"`,
    "Cache-Control": "public, max-age=3600",
    ...extra,
  };
}

export async function GET(req: NextRequest) {
  const local = pickLocal();
  const splatUrl = (process.env.EXAMPLE_SPLAT_URL ?? "").trim();
  const plyUrl = (process.env.EXAMPLE_PLY_URL ?? "").trim();

  if (req.nextUrl.searchParams.get("meta") === "1") {
    const webReady = local.quality === "full" || Boolean(splatUrl);
    return NextResponse.json(
      {
        present: local.bytes > 0 || Boolean(splatUrl),
        bytes: local.bytes,
        expectedBytes: local.format === "ply" ? FULL_EXAMPLE_PLY_BYTES : local.bytes,
        complete: webReady || local.complete,
        fileName: splatUrl ? sparkHintName(splatUrl.split("?")[0].split("/").pop() || "model.plz") : local.fileName,
        diskName: local.diskName,
        format: splatUrl ? extOf(splatUrl) || "plz" : local.format,
        quality: webReady ? "full" : local.quality,
        paged: local.paged,
        splatUrl: splatUrl || undefined,
        hint: webReady
          ? undefined
          : "网页高质量需要 PLZ / SPZ / SOG。把压缩包放到 example/model.plz，或设置 EXAMPLE_SPLAT_URL。数 GB 的高斯 PLY 无法在浏览器里原样解码。",
      },
      { headers: jsonHeaders() },
    );
  }

  if (splatUrl && local.quality !== "full") {
    return NextResponse.redirect(splatUrl, 307);
  }

  if (local.quality === "full") {
    const size = local.bytes;
    const range = req.headers.get("range");
    const match = range ? /bytes=(\d+)-(\d*)/.exec(range) : null;
    if (match) {
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : size - 1;
      const stream = createReadStream(local.filePath, { start, end });
      return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
        status: 206,
        headers: splatHeaders(local.fileName, {
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        }),
      });
    }
    const stream = createReadStream(local.filePath);
    return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
      headers: splatHeaders(local.fileName, { "Content-Length": String(size) }),
    });
  }

  if (plyUrl) {
    return NextResponse.json(
      {
        missing: true,
        format: "ply",
        hint: "EXAMPLE_PLY_URL 指向的是原始高斯 PLY。网页请改成 EXAMPLE_SPLAT_URL（PLZ / SPZ / SOG）。",
      },
      { status: 404, headers: jsonHeaders() },
    );
  }

  return NextResponse.json(
    {
      ...local,
      missing: true,
      hint: "完整扫描若只有 example/model.ply（约 3.29GB），浏览器出不了高质量。导出 PLZ/SPZ 后放到 example/，或设置 EXAMPLE_SPLAT_URL。",
    },
    { status: 404, headers: jsonHeaders() },
  );
}

export async function POST() {
  const current = pickLocal();
  if (current.quality === "full" || current.complete) {
    return NextResponse.json({ ok: true, started: false, ...current });
  }
  spawn("bash", [SCRIPT], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
  }).unref();
  return NextResponse.json({ ok: true, started: true, ...pickLocal() });
}
