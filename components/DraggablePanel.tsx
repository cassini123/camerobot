"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

const IGNORE =
  "button, input, textarea, select, a, label, .quick, .prompt, .tool-close, .panel-x, .scene-plus";

export function DraggablePanel({
  className,
  children,
  centered,
  ignore = IGNORE,
}: {
  className?: string;
  children: ReactNode;
  centered?: boolean;
  ignore?: string;
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const origin = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
    pointerId: number;
  } | null>(null);
  const draggingRef = useRef(false);
  const didDrag = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (ignore && target.closest(ignore)) {
      return;
    }
    didDrag.current = false;
    draggingRef.current = false;
    origin.current = {
      x: event.clientX,
      y: event.clientY,
      ox: pos.x,
      oy: pos.y,
      pointerId: event.pointerId,
    };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!origin.current) {
      return;
    }
    const dx = event.clientX - origin.current.x;
    const dy = event.clientY - origin.current.y;
    if (!draggingRef.current) {
      if (Math.hypot(dx, dy) < 8) {
        return;
      }
      didDrag.current = true;
      draggingRef.current = true;
      setDragging(true);
      panelRef.current?.setPointerCapture(origin.current.pointerId);
    }
    setPos({
      x: origin.current.ox + dx,
      y: origin.current.oy + dy,
    });
  }

  function onPointerUp() {
    origin.current = null;
    draggingRef.current = false;
    setDragging(false);
  }

  const transform = centered
    ? `translate(calc(-50% + ${pos.x}px), ${pos.y}px)`
    : `translate(${pos.x}px, ${pos.y}px)`;

  return (
    <div
      ref={panelRef}
      className={`${className ?? ""} draggable-panel${dragging ? " dragging" : ""}`}
      style={{ transform, zIndex: dragging ? 20 : undefined }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={(event) => {
        if (didDrag.current) {
          event.preventDefault();
          event.stopPropagation();
          didDrag.current = false;
        }
      }}
    >
      {children}
    </div>
  );
}
