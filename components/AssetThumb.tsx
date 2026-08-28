"use client";

import { useEffect, useRef, useState } from "react";
import type { LibraryAsset } from "@/lib/library-types";
import { samplePlyFile } from "@/lib/ply-stream";
import { useLibrary } from "./LibraryProvider";

function extOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function isImageSrc(url?: string) {
  if (!url) {
    return false;
  }
  return (
    url.startsWith("data:image") ||
    url.startsWith("blob:") ||
    /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)
  );
}

function drawPoints(
  canvas: HTMLCanvasElement,
  positions: Float32Array,
  colors: Float32Array,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, w, h);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const n = Math.floor(positions.length / 3);
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, positions[i * 3]);
    maxX = Math.max(maxX, positions[i * 3]);
    minY = Math.min(minY, positions[i * 3 + 1]);
    maxY = Math.max(maxY, positions[i * 3 + 1]);
    minZ = Math.min(minZ, positions[i * 3 + 2]);
    maxZ = Math.max(maxZ, positions[i * 3 + 2]);
  }
  const span = Math.max(maxX - minX, maxZ - minZ, 0.001);
  for (let i = 0; i < n; i++) {
    const x = ((positions[i * 3] - (minX + maxX) / 2) / span + 0.5) * w;
    const y = (0.5 - (positions[i * 3 + 2] - (minZ + maxZ) / 2) / span) * h;
    const shade = (positions[i * 3 + 1] - minY) / Math.max(maxY - minY, 0.001);
    ctx.fillStyle = `rgb(${Math.round(colors[i * 3] * 255)},${Math.round(colors[i * 3 + 1] * 255)},${Math.round(colors[i * 3 + 2] * 255)})`;
    if (!colors.some(Boolean)) {
      const t = Math.round(80 + shade * 140);
      ctx.fillStyle = `rgb(${t},${t - 10},${t - 20})`;
    }
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

export function AssetThumb({
  asset,
  compact,
}: {
  asset: LibraryAsset;
  compact?: boolean;
}) {
  const { getBlob } = useLibrary();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const ext = extOf(asset.name);
  const imagePreview =
    Boolean(asset.previewUrl) &&
    (asset.kind === "image" || isImageSrc(asset.previewUrl));

  useEffect(() => {
    if (asset.kind === "image" || asset.kind === "video" || isImageSrc(asset.previewUrl)) {
      return;
    }
    if (!["glb", "gltf", "ply"].includes(ext) || failed) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const blob = await getBlob(asset.id);
      if (!blob || cancelled) {
        return;
      }
      const file = new File([blob], asset.name, { type: blob.type });
      if (ext === "ply") {
        try {
          const sampled = await samplePlyFile(file, undefined, 4000);
          if (!cancelled && canvasRef.current) {
            drawPoints(canvasRef.current, sampled.positions, sampled.colors);
          }
        } catch {
          if (!cancelled) {
            setFailed(true);
          }
        }
        return;
      }
      try {
        const THREE = await import("three");
        const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
        const canvas = canvasRef.current;
        if (!canvas || cancelled) {
          return;
        }
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setSize(canvas.width, canvas.height, false);
        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 0.8));
        const light = new THREE.DirectionalLight(0xfff2e0, 1.1);
        light.position.set(2, 4, 3);
        scene.add(light);
        const camera = new THREE.PerspectiveCamera(32, canvas.width / canvas.height, 0.01, 50);
        const gltf = await new GLTFLoader().parseAsync(await file.arrayBuffer(), "");
        scene.add(gltf.scene);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const span = Math.max(size.x, size.y, size.z, 0.01);
        camera.position.set(center.x + span, center.y + span * 0.7, center.z + span);
        camera.lookAt(center);
        renderer.render(scene, camera);
        renderer.dispose();
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id, asset.name, asset.kind, asset.previewUrl, ext, failed, getBlob]);

  if (asset.kind === "video" && asset.previewUrl) {
    return <video src={asset.previewUrl} muted playsInline />;
  }
  if (asset.previewUrl && imagePreview) {
    return <img src={asset.previewUrl} alt="" />;
  }
  if (["glb", "gltf", "ply"].includes(ext) && !failed) {
    return (
      <canvas
        ref={canvasRef}
        className={compact ? "asset-thumb-canvas compact" : "asset-thumb-canvas"}
        width={compact ? 160 : 320}
        height={compact ? 90 : 180}
      />
    );
  }
  return <div className="lib-ph">{compact ? ext || asset.kind : asset.kind}</div>;
}
