import type { FitTransform } from "./point-cluster";
import type { BufferGeometry } from "three";

/** @deprecated use SPARK_BUFFER_MAX_BYTES — kept so existing imports keep working. */
export { SPARK_BUFFER_MAX_BYTES as SPARK_MAX_BYTES } from "./splat-formats";

export type SplatQuality = "full" | "preview";

export type SceneSplat = {
  fileBytes?: ArrayBuffer;
  file?: File;
  url?: string;
  paged?: boolean;
  quality?: SplatQuality;
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
