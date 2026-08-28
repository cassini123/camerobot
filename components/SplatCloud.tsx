"use client";

import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Box3, Vector3, type Object3D } from "three";
import type { SceneSplat } from "@/lib/scene-visual";

type Disposable = {
  removeFromParent?: () => void;
  dispose?: () => void;
  rotation: { x: number };
  quaternion: { set: (x: number, y: number, z: number, w: number) => void };
  scale: { setScalar: (s: number) => void };
  position: { set: (x: number, y: number, z: number) => void };
  updateMatrixWorld?: (force?: boolean) => void;
  raycast?: () => void;
  initialized?: Promise<unknown>;
};

function applyFit(mesh: Disposable, fit: SceneSplat["fit"]) {
  const { cx, minY, cz, scale } = fit;
  mesh.scale.setScalar(scale);
  mesh.position.set(-cx * scale, -minY * scale, -cz * scale);
}

function disableRaycast(node: Object3D) {
  node.raycast = () => {};
  node.traverse((child) => {
    child.raycast = () => {};
  });
}

export function SplatCloud({
  splat,
  onReady,
  onError,
}: {
  splat: SceneSplat;
  onReady?: () => void;
  onError?: () => void;
}) {
  const { gl, scene, invalidate } = useThree();
  const [failed, setFailed] = useState(false);
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  onReadyRef.current = onReady;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    let spark: Object3D | null = null;
    let mesh: Disposable | null = null;
    let objectUrl: string | null = null;

    (async () => {
      const { SparkRenderer, SplatMesh } = await import("@sparkjsdev/spark");
      if (cancelled) {
        return;
      }
      spark = new SparkRenderer({
        renderer: gl,
        onDirty: () => invalidate(),
      }) as unknown as Object3D;
      const full = splat.quality !== "preview";
      const options: Record<string, unknown> = {
        fileName: splat.fileName,
        lod: full,
        nonLod: full,
        paged: splat.paged === true,
        raycastable: false,
        onLoad: (loaded: unknown) => {
          if (!splat.autoFit) {
            return;
          }
          const node = loaded as Disposable & Object3D;
          node.updateMatrixWorld?.(true);
          const box = new Box3().setFromObject(node);
          if (box.isEmpty()) {
            return;
          }
          const size = box.getSize(new Vector3());
          const span = Math.max(size.x, size.y, size.z, 0.001);
          applyFit(node, {
            cx: (box.min.x + box.max.x) / 2,
            minY: box.min.y,
            cz: (box.min.z + box.max.z) / 2,
            scale: 16 / span,
          });
          disableRaycast(node);
        },
      };
      if (splat.url) {
        options.url = splat.url;
      } else if (splat.file) {
        objectUrl = URL.createObjectURL(splat.file);
        options.url = objectUrl;
      } else if (splat.fileBytes) {
        options.fileBytes = splat.fileBytes;
      }
      mesh = new SplatMesh(options) as unknown as Disposable;
      mesh.raycast = () => {};
      if (splat.zUp) {
        mesh.rotation.x = -Math.PI / 2;
      } else {
        mesh.quaternion.set(1, 0, 0, 0);
      }
      if (!splat.autoFit) {
        applyFit(mesh, splat.fit);
      }
      scene.add(spark);
      scene.add(mesh as unknown as Object3D);
      disableRaycast(spark);
      disableRaycast(mesh as unknown as Object3D);
      invalidate();
      await mesh.initialized;
      if (cancelled) {
        return;
      }
      onReadyRef.current?.();
    })().catch((error: unknown) => {
      console.error("Spark splat load failed", error);
      if (!cancelled) {
        setFailed(true);
        onErrorRef.current?.();
      }
    });

    return () => {
      cancelled = true;
      mesh?.removeFromParent?.();
      spark?.removeFromParent?.();
      mesh?.dispose?.();
      (spark as Disposable | null)?.dispose?.();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [splat, gl, scene, invalidate]);

  if (failed) {
    return null;
  }
  return null;
}
