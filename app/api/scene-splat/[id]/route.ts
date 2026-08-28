import { NextResponse } from "next/server";
import { GENERATED_WORLDS } from "@/lib/generated-worlds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const world = GENERATED_WORLDS.find((item) => item.id === id);
  if (!world) {
    return NextResponse.json({ error: "unknown world" }, { status: 404 });
  }
  const upstream = await fetch(world.spzUrl);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: `upstream ${upstream.status}` },
      { status: 502 },
    );
  }
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `inline; filename="${id}.spz"`,
      "Cache-Control": "public, max-age=86400",
    },
  });
}
