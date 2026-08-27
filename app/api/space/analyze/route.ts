import { NextResponse } from "next/server";
import spaceExample from "@/data/space_heritage_hall.json";
import { qingchengJson } from "@/lib/qingcheng";
import type { SpaceModel } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    description?: string;
    images?: string[];
  };
  const base = spaceExample as SpaceModel;

  try {
    if (body.description || (body.images && body.images.length > 0)) {
      const { data } = await qingchengJson({
        vision: Boolean(body.images?.length),
        system:
          "You analyze film locations. Return JSON only with keys: description, objects (array of {id,type,position}). Do not invent GPS. Types limited to building,door,window,tree,road,ground,person,object,camera_zone,walkable.",
        user: body.images?.length
          ? [
              {
                type: "text",
                text: `Enrich this space JSON description. Existing space: ${JSON.stringify(base)}\nUser note: ${body.description || ""}`,
              },
              {
                type: "image_url",
                image_url: { url: body.images[0] },
              },
            ]
          : `Enrich description only. Existing space: ${JSON.stringify({ space_id: base.space_id, objects: base.objects })}\nUser note: ${body.description}`,
      });
      const parsed = data as { description?: string; objects?: SpaceModel["objects"] };
      return NextResponse.json({
        space: {
          ...base,
          description: parsed.description || body.description || base.description,
          objects: Array.isArray(parsed.objects) && parsed.objects.length ? parsed.objects : base.objects,
        },
        provider: "qingcheng",
        note: "Aholo world.reconstructions.create is async 3DGS; MVP maps InteriorGS-style labels to Space JSON.",
      });
    }
  } catch {
    // fall through to example
  }

  return NextResponse.json({
    space: {
      ...base,
      description: body.description || base.description,
    },
    provider: "example",
    note: "Using InteriorGS-style heritage hall proxy. Connect AHOLO_API_KEY later for world.reconstructions.create (video/images → PLY).",
  });
}
