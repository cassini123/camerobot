"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EXPLORE_FEED } from "@/lib/library-explore";
import type { AssetKind, AssetSource } from "@/lib/library-types";
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
          className={section === "explore" ? "btn primary gemini-glow" : "btn"}
          onClick={() => setSection("explore")}
        >
          Explore
        </button>
        <button
          type="button"
          className={section === "mine" ? "btn primary gemini-glow" : "btn"}
          onClick={() => setSection("mine")}
        >
          My Library
        </button>
      </div>

      {section === "explore" ? (
        <div className="explore-feed">
          {EXPLORE_FEED.length === 0 ? (
            <p className="lib-empty">
              Explore 信息流稍后接入视频。现在可以切到 My Library 看上传与生成。
            </p>
          ) : (
            EXPLORE_FEED.map((item) => (
              <article
                key={item.id}
                className={picked === item.id ? "explore-card gemini-glow" : "explore-card"}
                onClick={() => setPicked(item.id)}
              >
                {item.kind === "video" && item.src ? (
                  <video src={item.src} poster={item.poster} muted loop playsInline />
                ) : item.src ? (
                  <img src={item.src} alt="" />
                ) : (
                  <div className="lib-ph">{item.kicker ?? item.kind}</div>
                )}
                <b>{item.title}</b>
                {item.kicker ? <small>{item.kicker}</small> : null}
              </article>
            ))
          )}
        </div>
      ) : (
        <>
          <div className="lib-toolbar lib-toolbar-sub">
            <button
              type="button"
              className={mineSource === "upload" ? "btn primary gemini-glow" : "btn"}
              onClick={() => setMineSource("upload")}
            >
              上传
            </button>
            <button
              type="button"
              className={mineSource === "generated" ? "btn primary gemini-glow" : "btn"}
              onClick={() => setMineSource("generated")}
            >
              生成
            </button>
            {KINDS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={kind === item.id ? "btn primary gemini-glow" : "btn"}
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
                  accept="image/*,video/*,.ply,.spz,.splat,.glb,.gltf"
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
                  : "还没有生成结果。VirtuPath 或 WORLD 生成的模型会进这一栏。"}
              </p>
            ) : (
              mine.map((item) => (
                <article
                  key={item.id}
                  className={picked === item.id ? "lib-card gemini-glow" : "lib-card"}
                  onClick={() => setPicked(item.id)}
                >
                  {item.kind === "image" && item.previewUrl ? (
                    <img src={item.previewUrl} alt="" />
                  ) : item.kind === "video" && item.previewUrl ? (
                    <video src={item.previewUrl} muted />
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
                      下载模型
                    </a>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
