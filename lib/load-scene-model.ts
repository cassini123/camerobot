import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  boundsFromObjects,
  clusterPointCloud,
  colorsFromHeight,
  draftsToObjects,
  fitPositions,
  IDENTITY_FIT,
  likelyZUp,
  rotateZUpToYUp,
  type FitTransform,
} from "./point-cluster";
import { formatBytes, isGaussianPly, readPlyHeader, samplePlyFile } from "./ply-stream";
import { SPARK_MAX_BYTES, type SceneVisual } from "./scene-visual";
import type { SpaceModel } from "./types";

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

const SPARK_EXTS = new Set(["ply", "spz", "splat", "ksplat", "glb", "gltf"]);

/** Spark 用 fileName 判断格式；中文名会导致 SPZ/PLY 被当成未知类型，场景是空的。 */
export function sparkFileName(name: string): string {
  const rawExt = extOf(name);
  const ext = SPARK_EXTS.has(rawExt) ? rawExt : "spz";
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "scene";
  return `${base}.${ext}`;
}

export function modelUrlExtension(url: string): string {
  return url.toLowerCase().match(/\.(ply|spz|splat|ksplat|glb|gltf)(?:$|\?)/)?.[1] ?? "spz";
}

export function remoteSparkScene(opts: {
  url: string;
  fileName: string;
  format: string;
  label: string;
}): { space: SpaceModel; visual: SceneVisual } {
  const fileName = sparkFileName(opts.fileName);
  const ext = SPARK_EXTS.has(opts.format) ? opts.format : modelUrlExtension(opts.url);
  return {
    space: placeholderSpace(fileName, ext, opts.label),
    visual: {
      mode: "spark",
      geometry: null,
      splat: {
        url: opts.url,
        fileName,
        paged: ext === "ply",
        zUp: true,
        autoFit: true,
        fit: IDENTITY_FIT,
      },
    },
  };
}

function geometryFromArrays(
  positions: Float32Array,
  colors: Float32Array,
): { geometry: THREE.BufferGeometry; fit: FitTransform } {
  const fit = fitPositions(positions);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, fit };
}

function spaceFromGeometry(
  fileName: string,
  format: string,
  geometry: THREE.BufferGeometry,
): SpaceModel {
  const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
  const col = geometry.getAttribute("color") as THREE.BufferAttribute | undefined;
  const positions = pos.array as Float32Array;
  const colors = col ? (col.array as Float32Array) : colorsFromHeight(positions);
  if (!col) {
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  const drafts = clusterPointCloud(positions, colors);
  const objects = draftsToObjects(drafts);
  const bounds = boundsFromObjects(objects);
  return {
    space_id: "space_upload",
    model: fileName,
    kind: "upload",
    format,
    fileName,
    description: `上传场景 ${fileName}，已聚类 ${objects.length} 个可选物体。`,
    bounds,
    objects,
    zones: [
      {
        id: "walkable_01",
        type: "walkable",
        bounds: [
          [bounds.min[0], 0, bounds.min[2]],
          [bounds.max[0], 0, bounds.max[2]],
        ],
      },
    ],
  };
}

function placeholderSpace(fileName: string, format: string, note: string): SpaceModel {
  return {
    space_id: "space_upload",
    model: fileName,
    kind: "upload",
    format,
    fileName,
    description: note,
    bounds: { min: [-8, 0, -8], max: [8, 8, 8] },
    objects: [
      {
        id: "scene_01",
        type: "object",
        position: [0, 2, 0],
        size: [16, 4, 16],
        color: "#6b5c7a",
        colorName: "紫",
        label: "场景",
        aliases: ["场景", "scene"],
      },
    ],
    zones: [],
  };
}

export function rgbCloudToSplat(
  positions: Float32Array,
  colors: Float32Array,
): ArrayBuffer {
  const n = Math.floor(positions.length / 3);
  const buf = new ArrayBuffer(n * 32);
  const view = new DataView(buf);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 0.001);
  const scale = (span / Math.max(8, Math.cbrt(n))) * 0.85;
  for (let i = 0; i < n; i++) {
    const o = i * 32;
    view.setFloat32(o, positions[i * 3], true);
    view.setFloat32(o + 4, positions[i * 3 + 1], true);
    view.setFloat32(o + 8, positions[i * 3 + 2], true);
    view.setFloat32(o + 12, scale, true);
    view.setFloat32(o + 16, scale, true);
    view.setFloat32(o + 20, scale, true);
    view.setUint8(o + 24, Math.max(0, Math.min(255, Math.round(colors[i * 3] * 255))));
    view.setUint8(o + 25, Math.max(0, Math.min(255, Math.round(colors[i * 3 + 1] * 255))));
    view.setUint8(o + 26, Math.max(0, Math.min(255, Math.round(colors[i * 3 + 2] * 255))));
    view.setUint8(o + 27, 255);
    view.setUint8(o + 28, 0);
    view.setUint8(o + 29, 0);
    view.setUint8(o + 30, 0);
    view.setUint8(o + 31, 255);
  }
  return buf;
}

function parseSplat(buffer: ArrayBuffer): { positions: Float32Array; colors: Float32Array } {
  if (buffer.byteLength < 32 || buffer.byteLength % 32 !== 0) {
    throw new Error("不是可解析的 splat 文件");
  }
  const n = buffer.byteLength / 32;
  const view = new DataView(buffer);
  const positions = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const o = i * 32;
    positions[i * 3] = view.getFloat32(o, true);
    positions[i * 3 + 1] = view.getFloat32(o + 4, true);
    positions[i * 3 + 2] = view.getFloat32(o + 8, true);
    colors[i * 3] = view.getUint8(o + 24) / 255;
    colors[i * 3 + 1] = view.getUint8(o + 25) / 255;
    colors[i * 3 + 2] = view.getUint8(o + 26) / 255;
  }
  return { positions, colors };
}

async function loadGltf(file: File): Promise<{ space: SpaceModel; visual: SceneVisual }> {
  const loader = new GLTFLoader();
  const buffer = await file.arrayBuffer();
  const gltf = await loader.parseAsync(buffer, "");
  gltf.scene.updateMatrixWorld(true);
  const positions: number[] = [];
  const colors: number[] = [];
  gltf.scene.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || !node.geometry.getAttribute("position")) {
      return;
    }
    const attr = node.geometry.getAttribute("position");
    const color = (node.material as THREE.MeshStandardMaterial)?.color ?? new THREE.Color("#888");
    const stride = Math.max(1, Math.floor(attr.count / 4000));
    const v = new THREE.Vector3();
    for (let i = 0; i < attr.count; i += stride) {
      v.fromBufferAttribute(attr, i).applyMatrix4(node.matrixWorld);
      positions.push(v.x, v.y, v.z);
      colors.push(color.r, color.g, color.b);
    }
  });
  if (!positions.length) {
    throw new Error("GLB 里没有可解析的网格");
  }
  const { geometry } = geometryFromArrays(new Float32Array(positions), new Float32Array(colors));
  const drafts = clusterPointCloud(
    geometry.getAttribute("position").array as Float32Array,
    geometry.getAttribute("color").array as Float32Array,
  );
  const finalObjects = draftsToObjects(drafts);
  return {
    visual: { mode: "points", geometry },
    space: {
      space_id: "space_upload",
      model: file.name,
      kind: "upload",
      format: extOf(file.name),
      fileName: file.name,
      description: `上传场景 ${file.name}`,
      bounds: boundsFromObjects(finalObjects),
      objects: finalObjects,
      zones: [],
    },
  };
}

async function sparkVisual(
  file: File,
  fileName: string,
  zUp: boolean,
  fit: FitTransform,
  geometry: THREE.BufferGeometry | null,
  autoFit = false,
): Promise<SceneVisual> {
  const fileBytes = (await file.arrayBuffer()).slice(0);
  return {
    mode: "spark",
    geometry,
    splat: { fileBytes, fileName: sparkFileName(fileName), zUp, fit, autoFit },
  };
}

export async function loadUploadedScene(
  file: File,
  onProgress?: (ratio: number, label: string) => void,
): Promise<{ space: SpaceModel; visual: SceneVisual }> {
  const ext = extOf(file.name);
  onProgress?.(0.01, `读取 ${file.name}（${formatBytes(file.size)}）`);
  if (ext === "spz") {
    if (file.size > SPARK_MAX_BYTES) {
      throw new Error("SPZ 超过 800MB，请导出为较小的 SPZ 或 PLY");
    }
    onProgress?.(0.4, "载入 3DGS SPZ…");
    const visual = await sparkVisual(file, file.name, true, IDENTITY_FIT, null, true);
    return {
      space: placeholderSpace(file.name, "spz", `${file.name} · 3DGS SPZ`),
      visual,
    };
  }
  if (ext === "glb" || ext === "gltf") {
    if (file.size > SPARK_MAX_BYTES) {
      throw new Error("GLB/GLTF 超过 800MB，请导出为 binary PLY 后再上传");
    }
    return loadGltf(file);
  }
  if (ext === "ksplat") {
    if (file.size > SPARK_MAX_BYTES) {
      throw new Error("KSPLAT 过大，请导出为 PLY 或 SPZ");
    }
    onProgress?.(0.4, "载入 3DGS KSPLAT…");
    const visual = await sparkVisual(file, file.name, false, IDENTITY_FIT, null, true);
    return {
      space: placeholderSpace(file.name, "ksplat", `${file.name} · 3DGS KSPLAT`),
      visual,
    };
  }
  if (ext === "splat") {
    if (file.size > SPARK_MAX_BYTES) {
      throw new Error("SPLAT 过大，请导出采样后的 PLY");
    }
    const bytes = await file.arrayBuffer();
    const { positions, colors } = parseSplat(bytes);
    const zUp = likelyZUp(positions);
    if (zUp) {
      rotateZUpToYUp(positions);
    }
    const { geometry, fit } = geometryFromArrays(positions, colors);
    return {
      space: spaceFromGeometry(file.name, ext, geometry),
      visual: {
        mode: "spark",
        geometry,
        splat: { fileBytes: bytes.slice(0), fileName: sparkFileName(file.name), zUp, fit },
      },
    };
  }
  const header = await readPlyHeader(file);
  const gaussian = isGaussianPly(header.properties);
  const sampled = await samplePlyFile(file, onProgress);
  onProgress?.(0.92, gaussian ? "构建 3DGS 预览…" : "构建预览点云…");
  const zUp = gaussian && likelyZUp(sampled.positions);
  if (zUp) {
    rotateZUpToYUp(sampled.positions);
  }
  const colors = sampled.colors.some(Boolean)
    ? sampled.colors
    : colorsFromHeight(sampled.positions);
  const { geometry, fit } = geometryFromArrays(sampled.positions, colors);
  const space = spaceFromGeometry(file.name, ext || "ply", geometry);
  space.description = `${file.name} · ${formatBytes(file.size)} · 从 ${sampled.total} 点采样 ${sampled.kept} 点`;
  if (file.size <= SPARK_MAX_BYTES && gaussian) {
    const visual = await sparkVisual(file, file.name, zUp, fit, geometry);
    space.description = `${file.name} · ${formatBytes(file.size)} · 3DGS 原场景`;
    return { space, visual };
  }
  if (gaussian) {
    const url = URL.createObjectURL(file);
    space.description = `${file.name} · ${formatBytes(file.size)} · 3DGS 原场景（流式）`;
    return {
      space,
      visual: {
        mode: "spark",
        geometry,
        splat: {
          url,
          fileName: sparkFileName(file.name),
          paged: true,
          zUp,
          fit,
          autoFit: true,
        },
      },
    };
  }
  const splatBytes = rgbCloudToSplat(
    geometry.getAttribute("position").array as Float32Array,
    geometry.getAttribute("color").array as Float32Array,
  );
  return {
    space,
    visual: {
      mode: "spark",
      geometry,
      splat: {
        fileBytes: splatBytes,
        fileName: sparkFileName(`${file.name.replace(/\.[^.]+$/, "")}.splat`),
        zUp: false,
        fit: IDENTITY_FIT,
      },
    },
  };
}
