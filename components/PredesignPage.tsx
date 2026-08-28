"use client";

import Link from "next/link";
import storyData from "@/data/story_boktu.json";
import type { Story } from "@/lib/types";

const story = storyData as Story;

export function PredesignPage() {
  return (
    <div className="subpage">
      <header className="product-top">
        <Link className="brand" href="/yunjing">
          <b>YUNJING</b>
        </Link>
        <span className="product-mark">Predesign</span>
      </header>
      <div className="predesign-grid">
        <section className="hub-card static">
          <small>STORY</small>
          <h2>{story.title}</h2>
          {story.scenes.map((scene) => (
            <p key={scene.scene_id}>
              <b>{scene.title}</b> {scene.description}
            </p>
          ))}
        </section>
        <section className="hub-card static">
          <small>VISUAL</small>
          <h2>Visual DNA</h2>
          <p>35mm · 低机位 · 暖金厅堂光 · 中轴对称。参考图在 CinPath 里分析后写入 shot pattern。</p>
        </section>
        <section className="hub-card static">
          <small>FRONT</small>
          <h2>Front</h2>
          <p>人物从厅堂深处走向建筑正面。运镜以跟拍 / 环绕衔接建立镜头与人物镜头。</p>
        </section>
      </div>
    </div>
  );
}
