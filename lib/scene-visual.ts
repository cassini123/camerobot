import type { FitTransform } from "./point-cluster";
import type { BufferGeometry } from "three";

/** Spark 走 ArrayBuffer 的上限；更大的高斯 PLY 用 url + paged。 */
export const SPARK_MAX_BYTES = 800 * 1024 * 1024;

export type SceneSplat = {
  fileBytes?: ArrayBuffer;
  url?: string;
  paged?: boolean;
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
