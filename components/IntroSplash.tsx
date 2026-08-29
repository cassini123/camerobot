"use client";

import { useEffect, useRef, useState } from "react";

const HOLD_MS = 3000;
const FADE_MS = 900;

type MediaKind = "mp4" | "webm" | "png" | "jpg" | "fallback";

async function probe(url: string) {
  try {
    const res = await fetch(url, { method: "HEAD" });
    const type = res.headers.get("content-type") || "";
    return res.ok && !type.includes("text/html");
  } catch {
    return false;
  }
}

export function IntroSplash({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<MediaKind>("fallback");
  const [fading, setFading] = useState(false);
  const done = useRef(false);
  const fadeTimer = useRef<number>(0);
  const doneTimer = useRef<number>(0);

  function finish() {
    if (done.current) {
      return;
    }
    done.current = true;
    onDone();
  }

  function beginFade() {
    setFading(true);
    window.clearTimeout(doneTimer.current);
    doneTimer.current = window.setTimeout(finish, FADE_MS);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (await probe("/intro.mp4")) {
        if (!cancelled) setKind("mp4");
        return;
      }
      if (await probe("/intro.webm")) {
        if (!cancelled) setKind("webm");
        return;
      }
      if (await probe("/intro.png")) {
        if (!cancelled) setKind("png");
        return;
      }
      if (await probe("/intro.jpg")) {
        if (!cancelled) setKind("jpg");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    fadeTimer.current = window.setTimeout(beginFade, HOLD_MS);
    return () => {
      window.clearTimeout(fadeTimer.current);
      window.clearTimeout(doneTimer.current);
    };
  }, []);

  return (
    <div
      className={fading ? "intro out" : "intro"}
      onClick={(event) => {
        event.stopPropagation();
        beginFade();
      }}
      role="presentation"
    >
      {kind === "mp4" ? (
        <video className="intro-media" src="/intro.mp4" autoPlay muted playsInline />
      ) : null}
      {kind === "webm" ? (
        <video className="intro-media" src="/intro.webm" autoPlay muted playsInline />
      ) : null}
      {kind === "png" || kind === "jpg" ? (
        <img className="intro-media" src={kind === "png" ? "/intro.png" : "/intro.jpg"} alt="" />
      ) : null}
      {kind === "fallback" ? (
        <div className="intro-fallback">
          <span>YUNJING</span>
        </div>
      ) : null}
    </div>
  );
}
