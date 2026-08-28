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
  const origin = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    const target = event.target as HTMLElement;
    if (ignore && target.closest(ignore)) {
      return;
    }
    origin.current = {
      x: event.clientX,
      y: event.clientY,
      ox: pos.x,
      oy: pos.y,
    };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!origin.current) {
      return;
    }
    setPos({
      x: origin.current.ox + event.clientX - origin.current.x,
      y: origin.current.oy + event.clientY - origin.current.y,
    });
  }

  function onPointerUp() {
    origin.current = null;
    setDragging(false);
  }

  const transform = centered
    ? `translate(calc(-50% + ${pos.x}px), ${pos.y}px)`
    : `translate(${pos.x}px, ${pos.y}px)`;

  return (
    <div
      className={`${className ?? ""} draggable-panel${dragging ? " dragging" : ""}`}
      style={{ transform, zIndex: dragging ? 20 : undefined }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
    </div>
  );
}
