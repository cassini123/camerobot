"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { AssetKind } from "@/lib/library-types";
import { useLibrary } from "./LibraryProvider";

const FILTERS: { id: "all" | AssetKind; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "object", label: "物体模型" },
  { id: "scene", label: "场景模型" },
];

export function LibraryPage() {
  const { assets, addFromFile } = useLibrary();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const shown = useMemo(
    () => (filter === "all" ? assets : assets.filter((item) => item.kind === filter)),
    [assets, filter],
  );

  return (
    <div className="subpage">
      <header className="product-top">
        <Link className="brand" href="/yunjing">
          <b>YUNJING</b>
        </Link>
        <span className="product-mark">Library</span>
      </header>
      <div className="lib-toolbar">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={filter === item.id ? "btn primary" : "btn"}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
        <label className="btn">
          + 上传
          <input
            type="file"
            hidden
            accept="image/*,video/*,.ply,.spz,.splat,.glb,.gltf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) {
                void addFromFile(file);
              }
            }}
          />
        </label>
      </div>
      <div className="lib-grid">
        {shown.length === 0 ? (
          <p className="lib-empty">还没有素材。上传或在 VirtuPath 里生成后会自动出现。</p>
        ) : (
          shown.map((item) => (
            <article key={item.id} className="lib-card">
              {item.kind === "video" && item.previewUrl ? (
                <video src={item.previewUrl} muted />
              ) : item.previewUrl ? (
                <img src={item.previewUrl} alt="" />
              ) : (
                <div className="lib-ph">{item.kind}</div>
              )}
              <b>{item.name}</b>
              <small>
                {item.kind} · {item.source} · {item.sizeLabel}
              </small>
              {item.prompt ? <p>{item.prompt}</p> : null}
              {item.remoteUrl ? (
                <a href={item.remoteUrl} target="_blank" rel="noreferrer">
                  {item.kind === "scene" ? "下载 SPZ" : "下载模型"}
                </a>
              ) : null}
              {item.plyUrl ? (
                <a href={item.plyUrl} target="_blank" rel="noreferrer">
                  下载 PLY
                </a>
              ) : null}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
