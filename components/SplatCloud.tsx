"use client";

import { useEffect } from "react";
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
};

function applyFit(mesh: Disposable, fit: SceneSplat["fit"]) {
  const { cx, minY, cz, scale } = fit;
  mesh.scale.setScalar(scale);
  mesh.position.set(-cx * scale, -minY * scale, -cz * scale);
}

export function SplatCloud({ splat }: { splat: SceneSplat }) {
  const { gl, scene, invalidate } = useThree();

  useEffect(() => {
    let cancelled = false;
    let spark: Object3D | null = null;
    let mesh: Disposable | null = null;

    (async () => {
      const { SparkRenderer, SplatMesh } = await import("@sparkjsdev/spark");
      if (cancelled) {
        return;
      }
      spark = new SparkRenderer({
        renderer: gl,
        onDirty: () => invalidate(),
      }) as unknown as Object3D;
      mesh = new SplatMesh({
        fileBytes: splat.fileBytes,
        fileName: splat.fileName,
        lod: true,
        onLoad: (loaded) => {
          if (!splat.autoFit) {
            return;
          }
          const node = loaded as unknown as Disposable & Object3D;
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
        },
      }) as unknown as Disposable;
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
      invalidate();
    })().catch((error: unknown) => {
      console.error("Spark splat load failed", error);
    });

    return () => {
      cancelled = true;
      mesh?.removeFromParent?.();
      spark?.removeFromParent?.();
      mesh?.dispose?.();
      (spark as Disposable | null)?.dispose?.();
    };
  }, [splat, gl, scene, invalidate]);

  return null;
}
