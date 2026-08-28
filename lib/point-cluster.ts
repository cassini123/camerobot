import { nameColor, rgbToHex } from "./color-name";
import type { SemanticType, SpaceObject, Vec3 } from "./types";

export type ClusterDraft = {
  id: string;
  type: SemanticType;
  position: Vec3;
  size: Vec3;
  color: string;
  colorName: string;
  label: string;
  aliases: string[];
  pointCount: number;
};

function dist2(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

export function downsampleStride(count: number, cap = 60000): number {
  return count <= cap ? 1 : Math.ceil(count / cap);
}

export function fitPositions(positions: Float32Array, targetSpan = 16): void {
  const count = Math.floor(positions.length / 3);
  if (!count) {
    return;
  }
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.001);
  const scale = targetSpan / span;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (positions[i * 3] - cx) * scale;
    positions[i * 3 + 1] = (positions[i * 3 + 1] - minY) * scale;
    positions[i * 3 + 2] = (positions[i * 3 + 2] - cz) * scale;
  }
}

export function colorsFromHeight(positions: Float32Array): Float32Array {
  const count = Math.floor(positions.length / 3);
  const colors = new Float32Array(count * 3);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    minY = Math.min(minY, positions[i * 3 + 1]);
    maxY = Math.max(maxY, positions[i * 3 + 1]);
  }
  const span = Math.max(0.001, maxY - minY);
  for (let i = 0; i < count; i++) {
    const t = (positions[i * 3 + 1] - minY) / span;
    colors[i * 3] = 0.45 + t * 0.4;
    colors[i * 3 + 1] = 0.38 + t * 0.28;
    colors[i * 3 + 2] = 0.3 + t * 0.18;
  }
  return colors;
}

export function guessType(size: Vec3, position: Vec3, worldSize: Vec3): SemanticType {
  const [sx, sy, sz] = size;
  const volume = sx * sy * sz;
  const worldVolume = Math.max(1, worldSize[0] * worldSize[1] * worldSize[2]);
  const tall = sy > sx * 1.6 && sy > sz * 1.6;
  const flat = sy < Math.max(sx, sz) * 0.22;
  const low = position[1] < worldSize[1] * 0.18;
  if (flat && low && volume > worldVolume * 0.08) {
    return "ground";
  }
  if (tall && sy > 1.2 && sy < 2.4 && Math.max(sx, sz) < 1.1) {
    return "person";
  }
  if (volume > worldVolume * 0.12 && sy > worldSize[1] * 0.35) {
    return "building";
  }
  if (sy > 1.8 && Math.max(sx, sz) < 2.2 && low) {
    return "tree";
  }
  return "object";
}

export function clusterPointCloud(
  positions: Float32Array,
  colors: Float32Array | null,
  options?: { maxClusters?: number },
): ClusterDraft[] {
  const count = Math.floor(positions.length / 3);
  if (count === 0) {
    return [];
  }
  const stride = downsampleStride(count);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < count; i += stride) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  const world: Vec3 = [Math.max(0.01, maxX - minX), Math.max(0.01, maxY - minY), Math.max(0.01, maxZ - minZ)];
  const cell = Math.max(0.12, Math.max(world[0], world[1], world[2]) / 40);
  const voxels = new Map<
    string,
    { n: number; x: number; y: number; z: number; r: number; g: number; b: number; ix: number; iy: number; iz: number }
  >();

  for (let i = 0; i < count; i += stride) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const ix = Math.floor((x - minX) / cell);
    const iy = Math.floor((y - minY) / cell);
    const iz = Math.floor((z - minZ) / cell);
    const key = `${ix},${iy},${iz}`;
    const cr = colors ? colors[i * 3] : 0.55;
    const cg = colors ? colors[i * 3 + 1] : 0.55;
    const cb = colors ? colors[i * 3 + 2] : 0.55;
    const cur = voxels.get(key);
    if (cur) {
      cur.n += 1;
      cur.x += x;
      cur.y += y;
      cur.z += z;
      cur.r += cr;
      cur.g += cg;
      cur.b += cb;
    } else {
      voxels.set(key, { n: 1, x, y, z, r: cr, g: cg, b: cb, ix, iy, iz });
    }
  }

  const keys = [...voxels.keys()];
  const parent = keys.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const unite = (a: number, b: number) => {
    const pa = find(a);
    const pb = find(b);
    if (pa !== pb) {
      parent[pb] = pa;
    }
  };
  const indexOf = new Map(keys.map((key, i) => [key, i]));

  for (let i = 0; i < keys.length; i++) {
    const a = voxels.get(keys[i])!;
    const meanA: [number, number, number] = [a.r / a.n, a.g / a.n, a.b / a.n];
    for (const [dx, dy, dz] of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ] as const) {
      const neighbor = `${a.ix + dx},${a.iy + dy},${a.iz + dz}`;
      const j = indexOf.get(neighbor);
      if (j === undefined) {
        continue;
      }
      const b = voxels.get(keys[j])!;
      const meanB: [number, number, number] = [b.r / b.n, b.g / b.n, b.b / b.n];
      if (dist2(meanA, meanB) < 0.08) {
        unite(i, j);
      }
    }
  }

  const groups = new Map<
    number,
    { n: number; x: number; y: number; z: number; r: number; g: number; b: number; min: Vec3; max: Vec3 }
  >();
  for (let i = 0; i < keys.length; i++) {
    const root = find(i);
    const v = voxels.get(keys[i])!;
    const g = groups.get(root);
    const min: Vec3 = [
      minX + v.ix * cell,
      minY + v.iy * cell,
      minZ + v.iz * cell,
    ];
    const max: Vec3 = [min[0] + cell, min[1] + cell, min[2] + cell];
    if (g) {
      g.n += v.n;
      g.x += v.x;
      g.y += v.y;
      g.z += v.z;
      g.r += v.r;
      g.g += v.g;
      g.b += v.b;
      g.min = [Math.min(g.min[0], min[0]), Math.min(g.min[1], min[1]), Math.min(g.min[2], min[2])];
      g.max = [Math.max(g.max[0], max[0]), Math.max(g.max[1], max[1]), Math.max(g.max[2], max[2])];
    } else {
      groups.set(root, {
        n: v.n,
        x: v.x,
        y: v.y,
        z: v.z,
        r: v.r,
        g: v.g,
        b: v.b,
        min,
        max,
      });
    }
  }

  const sampled = Math.ceil(count / stride);
  const minCount = sampled < 80 ? 1 : Math.max(6, Math.floor(sampled * 0.002));
  const ranked = [...groups.values()]
    .filter((g) => g.n >= minCount)
    .sort((a, b) => b.n - a.n)
    .slice(0, options?.maxClusters ?? 22);

  return ranked.map((g, index) => {
    const size: Vec3 = [
      Math.max(0.2, g.max[0] - g.min[0]),
      Math.max(0.2, g.max[1] - g.min[1]),
      Math.max(0.2, g.max[2] - g.min[2]),
    ];
    const position: Vec3 = [
      (g.min[0] + g.max[0]) / 2,
      (g.min[1] + g.max[1]) / 2,
      (g.min[2] + g.max[2]) / 2,
    ];
    const r = g.r / g.n;
    const gc = g.g / g.n;
    const b = g.b / g.n;
    const named = nameColor(r, gc, b);
    const type = guessType(size, position, world);
    const label = `${named.zh}${type === "object" ? "物体" : type === "person" ? "人物" : type === "building" ? "建筑" : type === "tree" ? "树" : type === "ground" ? "地面" : type}`;
    const id = `${type}_${String(index + 1).padStart(2, "0")}`;
    return {
      id,
      type,
      position,
      size,
      color: rgbToHex(r, gc, b),
      colorName: named.zh,
      label,
      aliases: [named.en, named.zh, label, type],
      pointCount: g.n,
    };
  });
}

export function draftsToObjects(drafts: ClusterDraft[]): SpaceObject[] {
  return drafts.map((item) => ({
    id: item.id,
    type: item.type,
    position: item.position,
    size: item.size,
    color: item.color,
    colorName: item.colorName,
    label: item.label,
    aliases: item.aliases,
  }));
}

export function boundsFromObjects(objects: SpaceObject[]): { min: Vec3; max: Vec3 } {
  if (!objects.length) {
    return { min: [-8, 0, -8], max: [8, 6, 8] };
  }
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const obj of objects) {
    const half = obj.size ?? [0.5, 0.5, 0.5];
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], obj.position[i] - half[i] / 2);
      max[i] = Math.max(max[i], obj.position[i] + half[i] / 2);
    }
  }
  return { min, max };
}
