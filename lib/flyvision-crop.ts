/** Aspect-locked crop window inside a source still. */

export type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CropPreset = {
  id: string;
  label: string;
  aspect: number | null;
};

export const CROP_PRESETS: CropPreset[] = [
  { id: "free", label: "原图", aspect: null },
  { id: "cam", label: "4:3 开发板", aspect: 4 / 3 },
  { id: "wide", label: "16:9", aspect: 16 / 9 },
  { id: "tall", label: "3:4", aspect: 3 / 4 },
  { id: "square", label: "1:1", aspect: 1 },
];

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function imageAspect(width: number, height: number): number {
  return width / Math.max(1, height);
}

/** Largest rectangle of `aspect` inside the image, then zoom in and pan. */
export function fittedCrop(
  imageW: number,
  imageH: number,
  aspect: number | null,
  panX = 0.5,
  panY = 0.5,
  zoom = 1,
): CropRect {
  const width = Math.max(1, imageW);
  const height = Math.max(1, imageH);
  if (!aspect || aspect <= 0) {
    return { x: 0, y: 0, w: width, h: height };
  }
  const srcAspect = width / height;
  let maxW: number;
  let maxH: number;
  if (srcAspect > aspect) {
    maxH = height;
    maxW = height * aspect;
  } else {
    maxW = width;
    maxH = width / aspect;
  }
  const scale = Math.max(1, zoom);
  const w = Math.max(2, Math.min(width, maxW / scale));
  const h = Math.max(2, Math.min(height, maxH / scale));
  const x = (width - w) * clamp01(panX);
  const y = (height - h) * clamp01(panY);
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
  };
}

export function cropToCanvas(
  source: CanvasImageSource,
  rect: CropRect,
  maxEdge = 1600,
): HTMLCanvasElement {
  const scale = Math.min(1, maxEdge / Math.max(rect.w, rect.h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(rect.w * scale));
  canvas.height = Math.max(2, Math.round(rect.h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas");
  }
  ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("裁切失败"));
        return;
      }
      resolve(blob);
    }, "image/jpeg", quality);
  });
}

export function containBox(
  imageW: number,
  imageH: number,
  viewW: number,
  viewH: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(viewW / Math.max(1, imageW), viewH / Math.max(1, imageH));
  const w = imageW * scale;
  const h = imageH * scale;
  return { x: (viewW - w) / 2, y: (viewH - h) / 2, w, h };
}
