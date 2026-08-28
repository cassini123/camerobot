"use client";

import { useRef, useState } from "react";
import {
  EXPLORE_FEED,
  MODEL_FORMATS,
  downloadUrl,
  type ExploreItem,
} from "@/lib/library-explore";

function HoverVideo({
  item,
  onOpen,
}: {
  item: ExploreItem;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  return (
    <article
      className={`explore-tile span-${item.span}`}
      onClick={onOpen}
      onMouseEnter={() => {
        const video = ref.current;
        if (!video) {
          return;
        }
        void video.play().catch(() => undefined);
      }}
      onMouseLeave={() => {
        const video = ref.current;
        if (!video) {
          return;
        }
        video.pause();
        video.currentTime = 0;
      }}
    >
      <video ref={ref} src={item.src} muted loop playsInline preload="metadata" />
      <b>{item.title}</b>
      <small>{item.kicker}</small>
    </article>
  );
}

export function ExploreMasonry({ items = EXPLORE_FEED }: { items?: ExploreItem[] }) {
  const [open, setOpen] = useState<ExploreItem | null>(null);

  return (
    <div className="explore-masonry-wrap">
      <div className="explore-flow" aria-hidden="true" />
      <div className="explore-masonry">
        {items.map((item) => (
          <HoverVideo key={item.id} item={item} onOpen={() => setOpen(item)} />
        ))}
      </div>
      {open ? (
        <div
          className="explore-detail"
          role="dialog"
          aria-modal="true"
          aria-label={open.title}
          onClick={() => setOpen(null)}
        >
          <div className="explore-detail-card" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="panel-x" onClick={() => setOpen(null)}>
              ×
            </button>
            <video src={open.src} controls autoPlay loop playsInline />
            <aside>
              <small>{open.kicker}</small>
              <h2>{open.title}</h2>
              <p>{open.body}</p>
              <p className="explore-dl-label">下载</p>
              <div className="explore-dl">
                {MODEL_FORMATS.map((format) => (
                  <a key={format} href={downloadUrl(open.id, format)} download>
                    {format}
                  </a>
                ))}
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </div>
  );
}
