"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import {
  CROP_PRESETS,
  canvasToJpeg,
  containBox,
  cropToCanvas,
  fittedCrop,
  type CropPreset,
} from "@/lib/flyvision-crop";

type Props = {
  src: string;
  title: string;
  defaultAspect: number | null;
  confirmLabel?: string;
  onConfirm: (blob: Blob) => void;
  onSkip: () => void;
  onCancel?: () => void;
};

export function FlyvisionCropEditor({
  src,
  title,
  defaultAspect,
  confirmLabel = "确认裁切",
  onConfirm,
  onSkip,
  onCancel,
}: Props) {
  const viewRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [presetId, setPresetId] = useState(() => matchPreset(defaultAspect));
  const [panX, setPanX] = useState(0.5);
  const [panY, setPanY] = useState(0.5);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0, vw: 0, vh: 0 });
  const preset = CROP_PRESETS.find((item) => item.id === presetId) ?? CROP_PRESETS[0];
  const aspect = preset.aspect;
  const crop =
    size.w && size.h ? fittedCrop(size.w, size.h, aspect, panX, panY, zoom) : null;
  const shown = size.vw && size.w ? containBox(size.w, size.h, size.vw, size.vh) : null;

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return undefined;
    }
    const measure = () => {
      const image = imageRef.current;
      setSize({
        w: image?.naturalWidth ?? 0,
        h: image?.naturalHeight ?? 0,
        vw: view.clientWidth,
        vh: view.clientHeight,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(view);
    return () => observer.disconnect();
  }, [src]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, panX, panY };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const image = imageRef.current;
    if (!drag || !image || !shown) {
      return;
    }
    const dx = (event.clientX - drag.x) / Math.max(8, shown.w);
    const dy = (event.clientY - drag.y) / Math.max(8, shown.h);
    setPanX(clamp(drag.panX - dx));
    setPanY(clamp(drag.panY - dy));
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  async function confirm() {
    const image = imageRef.current;
    if (!image || !crop) {
      return;
    }
    setBusy(true);
    try {
      const canvas = cropToCanvas(image, crop);
      onConfirm(await canvasToJpeg(canvas));
    } catch {
      onSkip();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="apple-crop">
      <div
        ref={viewRef}
        className="apple-crop-view"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img ref={imageRef} src={src} alt="" onLoad={() => {
          const view = viewRef.current;
          const image = imageRef.current;
          if (view && image) {
            setSize({
              w: image.naturalWidth,
              h: image.naturalHeight,
              vw: view.clientWidth,
              vh: view.clientHeight,
            });
          }
        }} />
        {shown && crop ? (
          <span
            className="apple-crop-box"
            style={{
              left: `${shown.x + (crop.x / size.w) * shown.w}px`,
              top: `${shown.y + (crop.y / size.h) * shown.h}px`,
              width: `${(crop.w / size.w) * shown.w}px`,
              height: `${(crop.h / size.h) * shown.h}px`,
            }}
          />
        ) : null}
      </div>
      <div className="apple-crop-bar">
        <strong>{title}</strong>
        <div className="apple-tabs">
          {CROP_PRESETS.map((item: CropPreset) => (
            <button
              key={item.id}
              type="button"
              className={presetId === item.id ? "is-on" : ""}
              onClick={() => {
                setPresetId(item.id);
                setZoom(1);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label>
          <span>放大 {zoom.toFixed(1)}×</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            disabled={preset.id === "free"}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <em>拖动画框，选好比例后确认，再拿去比对。</em>
        <div className="apple-crop-actions">
          {onCancel ? (
            <button type="button" onClick={onCancel}>取消</button>
          ) : null}
          <button type="button" onClick={onSkip} disabled={busy}>
            用原图
          </button>
          <button type="button" className="is-on" onClick={() => void confirm()} disabled={busy}>
            {busy ? "裁切中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function matchPreset(aspect: number | null): string {
  if (!aspect) {
    return "cam";
  }
  const hit = CROP_PRESETS.find(
    (item) => item.aspect && Math.abs(item.aspect - aspect) < 0.04,
  );
  return hit?.id ?? "cam";
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
