"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import type { Object3D } from "three";

type SparkBits = {
  removeFromParent?: () => void;
  dispose?: () => void;
  rotation: { x: number };
  quaternion: { set: (x: number, y: number, z: number, w: number) => void };
};

export function SplatCloud({
  url,
  zUp,
  onStatus,
}: {
  url: string;
  zUp: boolean;
  onStatus?: (status: string) => void;
}) {
  const { gl, scene } = useThree();

  useEffect(() => {
    let cancelled = false;
    let spark: Object3D | null = null;
    let splat: SparkBits | null = null;

    onStatus?.("loading 3DGS…");

    (async () => {
      const { SparkRenderer, SplatMesh } = await import("@sparkjsdev/spark");
      if (cancelled) {
        return;
      }
      spark = new SparkRenderer({
        renderer: gl,
        enableLod: true,
      }) as unknown as Object3D;
      splat = new SplatMesh({ url, lod: true }) as unknown as SparkBits;
      if (zUp) {
        splat.rotation.x = -Math.PI / 2;
      } else {
        splat.quaternion.set(1, 0, 0, 0);
      }
      scene.add(spark);
      scene.add(splat as unknown as Object3D);
      onStatus?.("3DGS ready");
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      onStatus?.(`3DGS error: ${message}`);
    });

    return () => {
      cancelled = true;
      splat?.removeFromParent?.();
      spark?.removeFromParent?.();
      splat?.dispose?.();
      (spark as SparkBits | null)?.dispose?.();
    };
  }, [url, zUp, gl, scene, onStatus]);

  return null;
}
