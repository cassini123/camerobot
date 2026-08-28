"use client";

import Link from "next/link";
import { IntroSplash } from "./IntroSplash";
import { GlobeCorner } from "./GlobeCorner";
import { AssetThumb } from "./AssetThumb";
import { useLibrary } from "./LibraryProvider";
import { useCallback, useEffect, useState } from "react";

const INTRO_KEY = "yunjing-intro-played";

export function ProductHub() {
  const { openGenerate, assets } = useLibrary();
  const [introDone, setIntroDone] = useState(true);
  const [hubPick, setHubPick] = useState<"start" | "everec" | "world" | "library" | "globe">(
    "start",
  );
  const [aholoReady, setAholoReady] = useState(false);
  const models = assets.filter((item) => item.kind === "scene" || item.kind === "object");
  const finishIntro = useCallback(() => {
    try {
      sessionStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* private mode */
    }
    setIntroDone(true);
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(INTRO_KEY) !== "1") {
        setIntroDone(false);
      }
    } catch {
      setIntroDone(false);
    }
  }, []);

  useEffect(() => {
    void fetch("/api/generate")
      .then((res) => res.json())
      .then((json: { configured?: boolean }) => setAholoReady(Boolean(json.configured)))
      .catch(() => setAholoReady(false));
  }, []);

  return (
    <div className="product-hub">
      <header className="product-top">
        <span />
        <a className="product-mark" href="https://everec.coze.site">
          everec
        </a>
      </header>

      <GlobeCorner
        className={hubPick === "globe" ? "gemini-glow" : ""}
        onPick={() => setHubPick("globe")}
      />

      <a
        className={`hub-card hub-predesign${hubPick === "everec" ? " gemini-glow" : ""}`}
        href="https://everec.coze.site"
        onClick={() => setHubPick("everec")}
      >
        <small>everec</small>
        <strong>start design</strong>
      </a>

      <Link
        className={`hub-card hub-start${hubPick === "start" ? " gemini-glow" : ""}`}
        href="/yunjing/cinpath"
        onClick={() => setHubPick("start")}
      >
        <span className="hub-plus">+</span>
        <b>Start Creating</b>
        <em>进入 CinPath</em>
      </Link>

      <button
        type="button"
        className={`hub-card hub-world${hubPick === "world" ? " gemini-glow" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (!file?.type.startsWith("image/")) {
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            setHubPick("world");
            openGenerate("world", "根据这张参考图生成可走入拍摄的场景", {
              name: file.name,
              dataUrl: String(reader.result),
            });
          };
          reader.readAsDataURL(file);
        }}
        onClick={() => {
          setHubPick("world");
          openGenerate(
            "world",
            "一座暖金木结构厅堂，中轴对称，可走入拍摄",
          );
        }}
      >
        <small>{aholoReady ? "AHOLO WORLD" : "WORLD"}</small>
        <strong>creating your world model</strong>
        <em>{aholoReady ? "已接入 Aholo 生成 3DGS · 可拖入参考图" : "配置 AHOLO_API_KEY 后生成"}</em>
      </button>

      <Link
        className={`hub-card hub-library${hubPick === "library" ? " gemini-glow" : ""}`}
        href="/yunjing/library"
        onClick={() => setHubPick("library")}
      >
        <small>LIBRARY</small>
        <strong>Explore &amp; Assets</strong>
        {models.length ? (
          <div className="hub-lib-thumbs">
            {models.slice(0, 4).map((item) => (
              <AssetThumb key={item.id} asset={item} compact />
            ))}
          </div>
        ) : (
          <em>生成或上传的模型会在这里出预览</em>
        )}
      </Link>

      {introDone ? null : <IntroSplash onDone={finishIntro} />}
    </div>
  );
}
