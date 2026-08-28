"use client";

import { useEffect, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Vector3, type Object3D, type Scene } from "three";
import type { SceneSplat } from "@/lib/scene-visual";

export const SPARK_USER_DATA = "sparkRenderer";

export function forEachSparkRenderer(
  scene: Scene,
  fn: (spark: { update: (args: { scene: Scene; camera: unknown }) => void }) => void,
) {
  scene.traverse((node) => {
    if (node.userData?.[SPARK_USER_DATA]) {
      fn(node as unknown as { update: (args: { scene: Scene; camera: unknown }) => void });
    }
  });
}

function fileTypeOf(name: string): "ply" | "spz" | "splat" | "ksplat" | undefined {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "ply" || ext === "spz" || ext === "splat" || ext === "ksplat") {
    return ext;
  }
  return undefined;
}

export function SplatCloud({
  splat,
  onReady,
  onError,
}: {
  splat: SceneSplat;
  onReady?: () => void;
  onError?: (message: string) => void;
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
    let mesh: Object3D | null = null;

    (async () => {
      const { SparkRenderer, SplatMesh, SplatFileType } = await import("@sparkjsdev/spark");
      if (cancelled) {
        return;
      }
      spark = new SparkRenderer({
        renderer: gl,
        onDirty: () => invalidate(),
      }) as unknown as Object3D;
      spark.userData[SPARK_USER_DATA] = true;
      scene.add(spark);

      const ext = fileTypeOf(splat.fileName) ?? (splat.url ? fileTypeOf(splat.url) : undefined);
      const fileType =
        ext === "spz"
          ? SplatFileType.SPZ
          : ext === "ply"
            ? SplatFileType.PLY
            : ext === "ksplat"
              ? SplatFileType.KSPLAT
              : ext === "splat"
                ? SplatFileType.SPLAT
                : undefined;
      const paged = Boolean(splat.paged);
      const splatMesh = new SplatMesh({
        url: splat.url,
        fileBytes: splat.fileBytes,
        fileName: splat.fileName,
        fileType,
        lod: paged,
        paged,
        raycastable: false,
        onLoad: () => invalidate(),
      });
      mesh = splatMesh as unknown as Object3D;
      if (splat.zUp) {
        splatMesh.rotation.x = -Math.PI / 2;
      }
      scene.add(mesh);
      await splatMesh.initialized;
      if (cancelled) {
        return;
      }
      if (splat.autoFit) {
        const box = splatMesh.getBoundingBox(true);
        if (!box.isEmpty()) {
          const size = box.getSize(new Vector3());
          const span = Math.max(size.x, size.y, size.z, 0.001);
          const scale = 16 / span;
          splatMesh.scale.setScalar(scale);
          splatMesh.position.set(
            -((box.min.x + box.max.x) / 2) * scale,
            -box.min.y * scale,
            -((box.min.z + box.max.z) / 2) * scale,
          );
          splatMesh.updateMatrixWorld(true);
        }
      }
      invalidate();
      onReadyRef.current?.();
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Spark splat load failed";
      console.error("Spark splat load failed", error);
      if (!cancelled) {
        setFailed(true);
        onErrorRef.current?.(message);
      }
    });

    return () => {
      cancelled = true;
      mesh?.removeFromParent();
      spark?.removeFromParent();
      (mesh as { dispose?: () => void } | null)?.dispose?.();
      (spark as { dispose?: () => void } | null)?.dispose?.();
    };
  }, [splat, gl, scene, invalidate]);

  if (failed) {
    return null;
  }
  return null;
}
