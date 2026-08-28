"use client";

import { useMemo, useState } from "react";
import type { Shot } from "@/lib/types";
import { normalizeMovement } from "@/lib/path-engine";
import {
  MOVEMENT_GROUPS,
  SHOT_PRESETS,
  SHOT_PRIMARY,
  movementOf,
  searchShotBoard,
  type ShotPrimary,
  type CatalogPreset,
} from "@/lib/shot-catalog";

export function ShotBoard({
  shots,
  currentShotId,
  onSelectShot,
  onPreset,
}: {
  shots: Shot[];
  currentShotId: string | null;
  onSelectShot: (id: string) => void;
  onPreset: (preset: CatalogPreset) => void;
}) {
  const [query, setQuery] = useState("");
  const [primary, setPrimary] = useState<ShotPrimary>("movement");
  const filtered = useMemo(
    () => searchShotBoard(query, shots, SHOT_PRESETS),
    [query, shots],
  );

  return (
    <aside className="col shot-col">
      <div className="col-h">SHOTS</div>
      <input
        className="shot-search"
        placeholder="搜索镜头 / 运动 / 效果"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="shot-tabs">
        {SHOT_PRIMARY.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={primary === tab.id ? "on" : ""}
            onClick={() => setPrimary(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="shot-board">
        {primary === "movement"
          ? MOVEMENT_GROUPS.map((group) => {
              const items = filtered.shots.filter(
                (shot) => normalizeMovement(movementOf(shot)) === group.type,
              );
              if (query && items.length === 0) {
                return null;
              }
              return (
                <div key={group.type} className="shot-group">
                  <div className="shot-group-h">
                    <b>{group.label}</b>
                    <small>{group.hint}</small>
                  </div>
                  {items.length === 0 ? (
                    <div className="shot muted">暂无此运动的镜头</div>
                  ) : (
                    items.map((shot) => (
                      <div
                        key={shot.shot_id}
                        className={shot.shot_id === currentShotId ? "shot active" : "shot"}
                        onClick={() => onSelectShot(shot.shot_id)}
                      >
                        {shot.title} · {shot.camera.lens}mm
                        <small>
                          {shot.camera.height}m · {shot.movement.duration}s
                        </small>
                        <div className="match">
                          MATCH {Math.round(shot.match.overall * 100)}%
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })
          : filtered.presets
              .filter((item) => item.primary === primary)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="shot preset"
                  onClick={() => onPreset(item)}
                >
                  {item.label}
                  <small>{item.hint}</small>
                </button>
              ))}
      </div>
    </aside>
  );
}
