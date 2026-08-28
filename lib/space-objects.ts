import type { SpaceModel, SpaceObject } from "./types";

export const SCENE_MODEL_ACCEPT =
  ".ply,.spz,.splat,.ksplat,.glb,.gltf,model/gltf-binary,model/gltf+json,application/octet-stream";

export const SCENE_MODEL_FORMATS = "PLY · GLB · GLTF · SPLAT · KSPLAT · SPZ";

/** Vercel-safe sampled preview of the 3.3GB Drive reconstruction. */
export const BUNDLED_EXAMPLE_PLY = "/example/model.ply";

export function exampleSpace(base: SpaceModel): SpaceModel {
  return {
    ...base,
    kind: "example",
    format: "proxy",
    fileName: "heritage_hall.example",
    objects: base.objects.map((obj) => {
      if (obj.label && obj.colorName) {
        return obj;
      }
      const palette: Record<string, { color: string; zh: string; label: string }> = {
        building: { color: "#8a6a45", zh: "棕", label: "棕色建筑" },
        door: { color: "#c4a36a", zh: "金", label: "金色门" },
        window: { color: "#7aa0c4", zh: "蓝", label: "蓝色窗" },
        tree: { color: "#3f6b48", zh: "绿", label: "绿色树" },
        road: { color: "#3a3d45", zh: "灰", label: "灰色路" },
        ground: { color: "#2a2c32", zh: "灰", label: "灰色地面" },
        person: { color: "#e8d2b0", zh: "米", label: "米色人物" },
        object: { color: "#6b5c7a", zh: "紫", label: "紫色物体" },
      };
      const hit = palette[obj.type] ?? palette.object;
      return {
        ...obj,
        color: hit.color,
        colorName: hit.zh,
        label: hit.label,
        aliases: [hit.zh, hit.label, obj.type, obj.id],
      };
    }),
  };
}

export function objectTokens(obj: SpaceObject): string[] {
  return [obj.id, obj.type, obj.label, obj.colorName, ...(obj.aliases ?? [])]
    .filter(Boolean)
    .map((item) => String(item).toLowerCase());
}

export function resolveSpaceObject(
  space: SpaceModel,
  text: string,
): SpaceObject | undefined {
  const source = text.trim().toLowerCase();
  if (!source) {
    return undefined;
  }
  const scored = space.objects
    .map((obj) => {
      const tokens = objectTokens(obj);
      const hits = tokens.filter((token) => token.length >= 1 && source.includes(token));
      return { obj, score: hits.reduce((sum, token) => sum + token.length, 0) };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.obj;
}

export function catalogForPrompt(space: SpaceModel) {
  return space.objects.map((obj) => ({
    id: obj.id,
    type: obj.type,
    label: obj.label ?? obj.type,
    color: obj.color,
    colorName: obj.colorName,
    position: obj.position,
  }));
}
