import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest, NextResponse } from "next/server";
import { FULL_EXAMPLE_PLY_BYTES } from "@/lib/space-objects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const FILE = path.join(process.cwd(), "example", "model.ply");
const SCRIPT = path.join(process.cwd(), "example", "fetch-model.sh");

function meta() {
  const present = existsSync(FILE);
  const bytes = present ? statSync(FILE).size : 0;
  return {
    present,
    bytes,
    expectedBytes: FULL_EXAMPLE_PLY_BYTES,
    complete: present && bytes >= FULL_EXAMPLE_PLY_BYTES * 0.98,
  };
}

function plyHeaders(extra: Record<string, string> = {}) {
  return {
    "Content-Type": "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Content-Disposition": 'inline; filename="model.ply"',
    "Cache-Control": "public, max-age=3600",
    ...extra,
  };
}

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("meta") === "1") {
    return NextResponse.json(meta());
  }

  const local = meta();
  if (!local.complete) {
    const remote = (process.env.EXAMPLE_PLY_URL ?? "").trim();
    if (remote) {
      return NextResponse.redirect(remote, 307);
    }
    return NextResponse.json(
      {
        ...local,
        missing: true,
        hint: "完整扫描约 3.29GB。本地运行 ./example/fetch-model.sh，或在 Vercel 设置 EXAMPLE_PLY_URL。",
      },
      { status: 404 },
    );
  }

  const size = statSync(FILE).size;
  const range = req.headers.get("range");
  const match = range ? /bytes=(\d+)-(\d*)/.exec(range) : null;
  if (match) {
    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : size - 1;
    const stream = createReadStream(FILE, { start, end });
    return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 206,
      headers: plyHeaders({
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Content-Length": String(end - start + 1),
      }),
    });
  }

  const stream = createReadStream(FILE);
  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: plyHeaders({ "Content-Length": String(size) }),
  });
}

export async function POST() {
  const current = meta();
  if (current.complete) {
    return NextResponse.json({ ok: true, started: false, ...current });
  }
  spawn("bash", [SCRIPT], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
  }).unref();
  return NextResponse.json({ ok: true, started: true, ...meta() });
}
