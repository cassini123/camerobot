import type { FitTransform } from "./point-cluster";
import type { BufferGeometry } from "three";

/** Spark 全量解码上限；更大的高斯 PLY 仍走抽样点云。 */
export const SPARK_MAX_BYTES = 800 * 1024 * 1024;

export type SceneSplat = {
  fileBytes: ArrayBuffer;
  fileName: string;
  zUp: boolean;
  fit: FitTransform;
  autoFit?: boolean;
};

export type SceneVisual = {
  mode: "points" | "spark";
  geometry: BufferGeometry | null;
  splat?: SceneSplat;
} | null;
