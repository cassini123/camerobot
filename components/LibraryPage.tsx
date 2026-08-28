"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cinpathHrefForAsset, type AssetKind, type AssetSource } from "@/lib/library-types";
import { AssetThumb } from "./AssetThumb";
import { ExploreMasonry } from "./ExploreMasonry";
import { useLibrary } from "./LibraryProvider";

const KINDS: { id: "all" | AssetKind; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "object", label: "物体模型" },
  { id: "scene", label: "场景模型" },
];

type Section = "explore" | "mine";
type MineSource = "upload" | "generated";

export function LibraryPage() {
  const { assets, addFromFile, openGenerate } = useLibrary();
  const [section, setSection] = useState<Section>("explore");
  const [mineSource, setMineSource] = useState<MineSource>("upload");
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("all");
  const [picked, setPicked] = useState<string | null>(null);

  const mine = useMemo(() => {
    const source: AssetSource = mineSource;
    return assets.filter((item) => {
      if (item.source !== source) {
        return false;
      }
      return kind === "all" || item.kind === kind;
    });
  }, [assets, mineSource, kind]);

  return (
    <div className="subpage lib-page">
      <header className="product-top">
        <Link className="brand" href="/yunjing">
          <b>YUNJING</b>
        </Link>
        <span className="product-mark">Library</span>
      </header>

      <div className="lib-toolbar">
        <button
          type="button"
          className={section === "explore" ? "btn gemini-glow" : "btn"}
          onClick={() => setSection("explore")}
        >
          Explore
        </button>
        <button
          type="button"
          className={section === "mine" ? "btn gemini-glow" : "btn"}
          onClick={() => setSection("mine")}
        >
          My Library
        </button>
      </div>

      {section === "explore" ? (
        <ExploreMasonry />
      ) : (
        <>
          <div className="lib-toolbar lib-toolbar-sub">
            <button
              type="button"
              className={mineSource === "upload" ? "btn gemini-glow" : "btn"}
              onClick={() => setMineSource("upload")}
            >
              上传
            </button>
            <button
              type="button"
              className={mineSource === "generated" ? "btn gemini-glow" : "btn"}
              onClick={() => setMineSource("generated")}
            >
              我的场景
            </button>
            {KINDS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={kind === item.id ? "btn gemini-glow" : "btn"}
                onClick={() => setKind(item.id)}
              >
                {item.label}
              </button>
            ))}
            {mineSource === "upload" ? (
              <label className="btn">
                + 上传
                <input
                  type="file"
                  hidden
                  accept="image/*,video/*,.ply,.plz,.spz,.sog,.splat,.glb,.gltf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) {
                      void addFromFile(file, { source: "upload" });
                    }
                  }}
                />
              </label>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => openGenerate("world")}
              >
                + 生成
              </button>
            )}
          </div>
          <div className="lib-grid">
            {mine.length === 0 ? (
              <p className="lib-empty">
                {mineSource === "upload"
                  ? "还没有上传素材。图片 / 视频 / 物体 / 场景会分开放在这里。"
                  : "还没有生成结果。CinPath 或 WORLD 生成的模型会进这一栏。"}
              </p>
            ) : (
              mine.map((item) => {
                const cinpath = cinpathHrefForAsset(item);
                return (
                  <article
                    key={item.id}
                    className={picked === item.id ? "lib-card gemini-glow" : "lib-card"}
                    onClick={() => setPicked(item.id)}
                  >
                    {cinpath ? (
                      <Link
                        href={cinpath}
                        className="lib-thumb"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {item.kind === "video" && item.previewUrl ? (
                          <video src={item.previewUrl} muted />
                        ) : (
                          <AssetThumb asset={item} />
                        )}
                      </Link>
                    ) : item.kind === "video" && item.previewUrl ? (
                      <video src={item.previewUrl} muted />
                    ) : (
                      <AssetThumb asset={item} />
                    )}
                    <b>{item.name}</b>
                    <small>
                      {item.kind} · {item.source} · {item.sizeLabel}
                    </small>
                    {item.prompt ? <p>{item.prompt}</p> : null}
                    <div className="lib-actions" onClick={(event) => event.stopPropagation()}>
                      {cinpath ? (
                        <Link className="btn primary" href={cinpath}>
                          在 CinPath 使用
                        </Link>
                      ) : null}
                      {item.remoteUrl ? (
                        <a href={item.remoteUrl} target="_blank" rel="noreferrer">
                          {item.kind === "scene" ? "下载 SPZ" : "下载"}
                        </a>
                      ) : null}
                      {item.plyUrl ? (
                        <a href={item.plyUrl} target="_blank" rel="noreferrer">
                          下载 PLY
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
