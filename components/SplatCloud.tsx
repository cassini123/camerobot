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

function worldBox(node: Object3D): Box3 {
  node.updateMatrixWorld?.(true);
  const box = new Box3().setFromObject(node);
  if (!box.isEmpty()) {
    return box;
  }
  node.traverse((child) => {
    const geom = (child as Object3D & { geometry?: { computeBoundingBox?: () => void; boundingBox?: Box3 | null } })
      .geometry;
    if (!geom) {
      return;
    }
    geom.computeBoundingBox?.();
    if (geom.boundingBox && !geom.boundingBox.isEmpty()) {
      box.union(geom.boundingBox.clone().applyMatrix4(child.matrixWorld));
    }
  });
  return box;
}

function tryAutoFit(mesh: Disposable & Object3D): boolean {
  const box = worldBox(mesh);
  if (box.isEmpty()) {
    return false;
  }
  const size = box.getSize(new Vector3());
  const span = Math.max(size.x, size.y, size.z, 0.001);
  applyFit(mesh, {
    cx: (box.min.x + box.max.x) / 2,
    minY: box.min.y,
    cz: (box.min.z + box.max.z) / 2,
    scale: 16 / span,
  });
  disableRaycast(mesh);
  return true;
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
    let mesh: (Disposable & Object3D) | null = null;
    let fitTimer = 0;
    let fitting = false;
    let finished = false;

    function finishReady() {
      if (cancelled || finished) {
        return;
      }
      finished = true;
      invalidate();
      onReadyRef.current?.();
    }

    function scheduleAutoFit() {
      if (!mesh || cancelled || finished || fitting) {
        return;
      }
      if (!splat.autoFit) {
        finishReady();
        return;
      }
      fitting = true;
      let tries = 0;
      const run = () => {
        if (cancelled || !mesh || finished) {
          return;
        }
        if (tryAutoFit(mesh) || tries++ >= 90) {
          finishReady();
          return;
        }
        fitTimer = window.setTimeout(run, 50);
      };
      run();
    }

    (async () => {
      const { SparkRenderer, SplatMesh } = await import("@sparkjsdev/spark");
      if (cancelled) {
        return;
      }
      spark = new SparkRenderer({
        renderer: gl,
        onDirty: () => invalidate(),
      }) as unknown as Object3D;
      const options: {
        url?: string;
        fileBytes?: ArrayBuffer;
        fileName: string;
        lod: boolean;
        paged: boolean;
        raycastable: boolean;
        onLoad: () => void;
      } = {
        fileName: splat.fileName,
        lod: true,
        paged: splat.paged ?? Boolean(splat.url),
        raycastable: false,
        onLoad: () => scheduleAutoFit(),
      };
      if (splat.url) {
        options.url = splat.url;
      }
      if (splat.fileBytes) {
        options.fileBytes = splat.fileBytes;
      }
      mesh = new SplatMesh(options) as unknown as Disposable & Object3D;
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
      scene.add(mesh);
      disableRaycast(spark);
      disableRaycast(mesh);
      invalidate();
      const initialized = mesh.initialized;
      if (initialized) {
        await initialized;
        scheduleAutoFit();
      } else if (!splat.autoFit) {
        finishReady();
      }
    })().catch((error: unknown) => {
      console.error("Spark splat load failed", error);
      if (!cancelled) {
        setFailed(true);
        onErrorRef.current?.();
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(fitTimer);
      mesh?.removeFromParent?.();
      spark?.removeFromParent?.();
      mesh?.dispose?.();
      (spark as Disposable | null)?.dispose?.();
    };
  }, [splat, gl, scene, invalidate]);

  if (failed) {
    return null;
  }
  return null;
}
