import { NextResponse } from "next/server";
import { qingchengJson } from "@/lib/qingcheng";
import type { SemanticType, SpaceModel, SpaceObject } from "@/lib/types";

type ClusterIn = {
  id: string;
  type?: string;
  position: [number, number, number];
  size?: [number, number, number];
  color?: string;
  colorName?: string;
  label?: string;
  aliases?: string[];
  pointCount?: number;
};

function asObjects(clusters: ClusterIn[]): SpaceObject[] {
  return clusters.map((item) => ({
    id: item.id,
    type: (item.type as SemanticType) || "object",
    position: item.position,
    size: item.size,
    color: item.color,
    colorName: item.colorName,
    label: item.label,
    aliases: item.aliases,
  }));
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    description?: string;
    images?: string[];
    space?: SpaceModel;
    clusters?: ClusterIn[];
  };

  const objects = body.clusters?.length
    ? asObjects(body.clusters)
    : body.space?.objects ?? [];
  const base: SpaceModel = body.space ?? {
    space_id: "space_upload",
    model: "upload",
    kind: "upload",
    description: body.description,
    bounds: { min: [-8, 0, -8], max: [8, 6, 8] },
    objects,
    zones: [],
  };

  try {
    if (objects.length) {
      const { data } = await qingchengJson({
        system:
          "You label reconstructed film-set objects. Return JSON only: { description, objects:[{id,type,label,color,colorName,aliases,position,size}] }. Keep the same ids and positions. Types: building,door,window,tree,road,ground,person,object. colorName is a short Chinese color (红橙黄绿青蓝紫粉白灰黑棕米金). aliases include Chinese and English names a director might say. Do not invent extra objects.",
        user: JSON.stringify({
          note: body.description || "Parse this scanned scene",
          objects: objects.map((obj) => ({
            id: obj.id,
            type: obj.type,
            position: obj.position,
            size: obj.size,
            color: obj.color,
            colorName: obj.colorName,
            label: obj.label,
            pointCount: body.clusters?.find((c) => c.id === obj.id)?.pointCount,
          })),
        }),
      });
      const parsed = data as { description?: string; objects?: SpaceObject[] };
      if (Array.isArray(parsed.objects) && parsed.objects.length) {
        const byId = new Map(parsed.objects.map((obj) => [obj.id, obj]));
        const merged = objects.map((obj) => {
          const hit = byId.get(obj.id);
          if (!hit) {
            return obj;
          }
          return {
            ...obj,
            type: hit.type || obj.type,
            label: hit.label || obj.label,
            color: hit.color || obj.color,
            colorName: hit.colorName || obj.colorName,
            aliases: [...new Set([...(obj.aliases ?? []), ...(hit.aliases ?? [])])],
          };
        });
        return NextResponse.json({
          space: {
            ...base,
            objects: merged,
            description: parsed.description || base.description,
          },
          provider: "qingcheng",
        });
      }
    }
  } catch {
    // heuristic labels already on clusters
  }

  return NextResponse.json({
    space: {
      ...base,
      objects,
      description: body.description || base.description,
    },
    provider: "heuristic",
  });
}
