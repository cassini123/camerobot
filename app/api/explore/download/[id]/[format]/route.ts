import { NextResponse } from "next/server";
import { EXPLORE_FEED, MODEL_FORMATS, type ModelFormat } from "@/lib/library-explore";

export const runtime = "nodejs";

function plyFor(id: string, format: ModelFormat): string {
  return `ply
format ascii 1.0
comment yunjing explore ${id} ${format}
element vertex 3
property float x
property float y
property float z
end_header
0 0 0
1 0 0
0 1.6 0
`;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string; format: string }> },
) {
  const { id, format } = await context.params;
  const item = EXPLORE_FEED.find((entry) => entry.id === id);
  if (!item || !MODEL_FORMATS.includes(format as ModelFormat)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const body = plyFor(item.id, format as ModelFormat);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${item.id}.${format}"`,
    },
  });
}
