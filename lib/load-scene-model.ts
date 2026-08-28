import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  boundsFromObjects,
  clusterPointCloud,
  colorsFromHeight,
  draftsToObjects,
  fitPositions,
} from "./point-cluster";
import { formatBytes, samplePlyFile } from "./ply-stream";
import type { SpaceModel } from "./types";

export type SceneVisual = {
  mode: "points";
  geometry: THREE.BufferGeometry;
} | null;

function extOf(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function geometryFromArrays(
  positions: Float32Array,
  colors: Float32Array,
): THREE.BufferGeometry {
  fitPositions(positions);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
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
  const geometry = geometryFromArrays(new Float32Array(positions), new Float32Array(colors));
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

export async function loadUploadedScene(
  file: File,
  onProgress?: (ratio: number, label: string) => void,
): Promise<{ space: SpaceModel; visual: SceneVisual }> {
  const ext = extOf(file.name);
  onProgress?.(0.01, `读取 ${file.name}（${formatBytes(file.size)}）`);
  if (ext === "spz") {
    throw new Error("SPZ 需先转为 PLY 或 SPLAT 后再上传");
  }
  if (ext === "glb" || ext === "gltf") {
    if (file.size > 400 * 1024 * 1024) {
      throw new Error("GLB/GLTF 超过 400MB，请导出为 binary PLY 后再上传");
    }
    return loadGltf(file);
  }
  if (ext === "splat" || ext === "ksplat") {
    if (ext === "ksplat") {
      throw new Error("KSPLAT 请导出为 PLY 或 SPLAT");
    }
    if (file.size > 400 * 1024 * 1024) {
      throw new Error("SPLAT 过大，请导出采样后的 PLY");
    }
    const { positions, colors } = parseSplat(await file.arrayBuffer());
    const geometry = geometryFromArrays(positions, colors);
    return { space: spaceFromGeometry(file.name, ext, geometry), visual: { mode: "points", geometry } };
  }
  const sampled = await samplePlyFile(file, onProgress);
  onProgress?.(0.92, "构建预览点云…");
  const colors = sampled.colors.some(Boolean) ? sampled.colors : colorsFromHeight(sampled.positions);
  const geometry = geometryFromArrays(sampled.positions, colors);
  const space = spaceFromGeometry(file.name, ext || "ply", geometry);
  space.description = `${file.name} · ${formatBytes(file.size)} · 从 ${sampled.total} 点采样 ${sampled.kept} 点`;
  return { space, visual: { mode: "points", geometry } };
}
