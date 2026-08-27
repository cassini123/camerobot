"use client";

import { DraggablePanel } from "./DraggablePanel";
import type { ToolId } from "@/lib/tools";
import { STUDIO_TOOLS } from "@/lib/tools";
import type { Shot } from "@/lib/types";

export function ToolDock({
  ids,
  currentShot,
  selectedLabel,
  previewing,
  onFollow,
  onOrbit,
  onDolly,
  onLens,
  onHeight,
  onSpeed,
  onPreview,
  onGenerate,
  onExport,
  onReference,
  onLanguage,
}: {
  ids: ToolId[];
  currentShot?: Shot;
  selectedLabel: string;
  previewing: boolean;
  onFollow: () => void;
  onOrbit: () => void;
  onDolly: (dir: "in" | "out") => void;
  onLens: (value: number) => void;
  onHeight: (value: number) => void;
  onSpeed: (value: number) => void;
  onPreview: () => void;
  onGenerate: () => void;
  onExport: () => void;
  onReference: () => void;
  onLanguage: () => void;
}) {
  if (ids.length === 0) {
    return null;
  }
  return (
    <aside className="tool-dock" aria-label="智能工具">
      {ids.map((id) => {
        const tool = STUDIO_TOOLS.find((item) => item.id === id);
        if (!tool) {
          return null;
        }
        return (
          <DraggablePanel key={id}>
          <section className="tool-card">
            <div className="tool-card-h">
              <span className="tool-icon" aria-hidden>
                {tool.icon}
              </span>
              <div>
                <b>{tool.label}</b>
                <small>{tool.hint}</small>
              </div>
            </div>
            <div className="tool-bar">
              {id === "move" ? (
                <span className="tool-note">{selectedLabel}</span>
              ) : null}
              {id === "follow" ? (
                <button className="btn primary" onClick={onFollow}>
                  应用跟拍
                </button>
              ) : null}
              {id === "orbit" ? (
                <button className="btn primary" onClick={onOrbit}>
                  应用环绕
                </button>
              ) : null}
              {id === "dolly" ? (
                <>
                  <button className="btn" onClick={() => onDolly("in")}>
                    推
                  </button>
                  <button className="btn" onClick={() => onDolly("out")}>
                    拉
                  </button>
                </>
              ) : null}
              {id === "lens" ? (
                <label className="tool-slider">
                  {currentShot?.camera.lens ?? 35}mm
                  <input
                    type="range"
                    min={12}
                    max={85}
                    value={currentShot?.camera.lens ?? 35}
                    onChange={(e) => onLens(Number(e.target.value))}
                  />
                </label>
              ) : null}
              {id === "height" ? (
                <label className="tool-slider">
                  {(currentShot?.camera.height ?? 1.6).toFixed(2)}m
                  <input
                    type="range"
                    min={0.5}
                    max={2.8}
                    step={0.05}
                    value={currentShot?.camera.height ?? 1.6}
                    onChange={(e) => onHeight(Number(e.target.value))}
                  />
                </label>
              ) : null}
              {id === "speed" ? (
                <label className="tool-slider">
                  {(currentShot?.movement.speed ?? 1).toFixed(2)}×
                  <input
                    type="range"
                    min={0.3}
                    max={1.5}
                    step={0.05}
                    value={currentShot?.movement.speed ?? 1}
                    onChange={(e) => onSpeed(Number(e.target.value))}
                  />
                </label>
              ) : null}
              {id === "preview" ? (
                <button className="btn primary" onClick={onPreview}>
                  {previewing ? "Stop" : "Preview"}
                </button>
              ) : null}
              {id === "generate" ? (
                <button className="btn primary" onClick={onGenerate}>
                  Generate
                </button>
              ) : null}
              {id === "export" ? (
                <button className="btn" onClick={onExport}>
                  打开导出
                </button>
              ) : null}
              {id === "reference" ? (
                <button className="btn" onClick={onReference}>
                  分析参考
                </button>
              ) : null}
              {id === "language" ? (
                <button className="btn" onClick={onLanguage}>
                  打开说明
                </button>
              ) : null}
            </div>
          </section>
          </DraggablePanel>
        );
      })}
    </aside>
  );
}
