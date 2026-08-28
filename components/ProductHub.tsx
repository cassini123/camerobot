"use client";

import Link from "next/link";
import { IntroSplash } from "./IntroSplash";
import { GlobeCorner } from "./GlobeCorner";
import { useLibrary } from "./LibraryProvider";
import { useCallback, useEffect, useState } from "react";

export function ProductHub() {
  const { openGenerate } = useLibrary();
  const [introDone, setIntroDone] = useState(false);
  const [aholoReady, setAholoReady] = useState(false);
  const finishIntro = useCallback(() => setIntroDone(true), []);

  useEffect(() => {
    void fetch("/api/generate")
      .then((res) => res.json())
      .then((json: { configured?: boolean }) => setAholoReady(Boolean(json.configured)))
      .catch(() => setAholoReady(false));
  }, []);

  return (
    <div className="product-hub">
      <header className="product-top">
        <Link className="brand" href="/yunjing">
          <b>YUNJING</b>
        </Link>
        <Link className="product-mark" href="/yunjing/predesign">
          start design
        </Link>
      </header>

      <GlobeCorner />

      <Link className="hub-card hub-predesign" href="/yunjing/predesign">
        <small>START DESIGN</small>
        <strong>Story · Visual · Front</strong>
      </Link>

      <Link className="hub-card hub-start" href="/yunjing/virtupath">
        <span className="hub-plus">+</span>
        <b>Start Create</b>
        <em>进入 VirtuPath</em>
      </Link>

      <button
        type="button"
        className="hub-card hub-world"
        onClick={() =>
          openGenerate(
            "world",
            "一座暖金木结构厅堂，中轴对称，可走入拍摄",
          )
        }
      >
        <small>{aholoReady ? "AHOLO WORLD" : "WORLD"}</small>
        <strong>create your world model</strong>
        <em>{aholoReady ? "已接入 Aholo 生成 3DGS" : "配置 AHOLO_API_KEY 后生成"}</em>
      </button>

      <Link className="hub-card hub-library" href="/yunjing/library">
        <small>ASSETS</small>
        <strong>Library</strong>
      </Link>

      {introDone ? null : <IntroSplash onDone={finishIntro} />}
    </div>
  );
}
