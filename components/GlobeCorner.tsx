"use client";

import Link from "next/link";

export function GlobeCorner({
  className,
  onPick,
}: {
  className?: string;
  onPick?: () => void;
}) {
  return (
    <Link
      className={`globe-corner${className ? ` ${className}` : ""}`}
      href="/yunjing/game-world"
      aria-label="Game world"
      onClick={onPick}
    >
      <span className="globe-disk" aria-hidden>
        <span className="globe-ocean" />
        <span className="globe-land" />
        <span className="globe-flow" />
        <span className="globe-ring" />
        <span className="globe-sketch" />
      </span>
      <b className="globe-brand">YUNJING</b>
      <em>Game world</em>
    </Link>
  );
}
