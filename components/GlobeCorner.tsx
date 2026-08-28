"use client";

import Link from "next/link";

export function GlobeCorner() {
  return (
    <Link className="globe-corner" href="/yunjing/game-world" aria-label="Game world">
      <span className="globe-disk" aria-hidden>
        <span className="globe-ocean" />
        <span className="globe-land" />
        <span className="globe-flow" />
        <span className="globe-ring" />
        <span className="globe-sketch" />
      </span>
      <em>Game world</em>
    </Link>
  );
}
