"use client";

import Link from "next/link";
import { IntroSplash } from "./IntroSplash";
import { useLibrary } from "./LibraryProvider";
import { useCallback, useState } from "react";

export function ProductHub() {
  const { openGenerate } = useLibrary();
  const [introDone, setIntroDone] = useState(false);
  const finishIntro = useCallback(() => setIntroDone(true), []);

  return (
    <div className="product-hub">
      <header className="product-top">
        <Link className="brand" href="/yunjing">
          <b>YUNJING</b>
        </Link>
        <span className="product-mark">Product</span>
      </header>

      <Link className="hub-card hub-predesign" href="/yunjing/predesign">
        <small>PREDESIGN</small>
        <strong>Story · Visual · Front</strong>
      </Link>

      <Link className="hub-card hub-start" href="/yunjing/virtupath">
        <span className="hub-plus">+</span>
        <b>Start Create</b>
        <em>进入 VirtuPath 工作台</em>
      </Link>

      <button
        type="button"
        className="hub-card hub-world"
        onClick={() => openGenerate("world", "create your world model")}
      >
        <small>WORLD</small>
        <strong>create your world model</strong>
      </button>

      <Link className="hub-card hub-library" href="/yunjing/library">
        <small>ASSETS</small>
        <strong>Library</strong>
      </Link>

      {introDone ? null : <IntroSplash onDone={finishIntro} />}
    </div>
  );
}
