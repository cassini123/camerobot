"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import boktu from "@/flyvision/data/shots/boktu.json";
import {
  CAPTURE_GO,
  CONTINUE_FOLLOW,
  DEFAULT_COMPOSITION_DELTA,
  DEFAULT_MATCH_THRESHOLD,
  extractFeatures,
  judgeComposition,
  nextDecision,
  rgbaToRgb,
  scoreMatch,
  type BBox,
  type FrameFeatures,
  type RgbPixels,
} from "@/lib/flyvision-match";

type ShotJson = (typeof boktu)["shots"][number];

const SHOT_IMAGES: Record<string, string> = {
  shot_01: "/flyvision/shot_01.bmp",
  shot_02: "/flyvision/shot_02.bmp",
  shot_03: "/flyvision/shot_03.bmp",
};

const DEMO_BOX: Record<string, BBox> = {
  shot_01: { x: 0.28, y: 0.18, w: 0.5, h: 0.6 },
  shot_02: { x: 0.22, y: 0.32, w: 0.16, h: 0.46 },
  shot_03: { x: 0.3, y: 0.3, w: 0.16, h: 0.46 },
};

type Source = "still" | "upload" | "webcam" | "cam";

function shotImage(shot: ShotJson): string {
  return SHOT_IMAGES[shot.shot_id] ?? "/flyvision/shot_01.bmp";
}

async function pixelsFromUrl(url: string): Promise<RgbPixels> {
  const image = await loadHtmlImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas");
  }
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return rgbaToRgb(data.data, canvas.width, canvas.height);
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${url}`));
    image.src = url;
  });
}

export function FlyvisionWorkbench() {
  const shots = boktu.shots;
  const [activeId, setActiveId] = useState("shot_03");
  const [liveUrl, setLiveUrl] = useState(SHOT_IMAGES.shot_03);
  const [box, setBox] = useState<BBox | null>(DEMO_BOX.shot_03);
  const [source, setSource] = useState<Source>("still");
  const [camUrl, setCamUrl] = useState("http://192.168.4.1/capture");
  const [camOn, setCamOn] = useState(false);
  const [refCache, setRefCache] = useState<Record<string, FrameFeatures>>({});
  const [verdict, setVerdict] = useState<{
    similarity: number;
    dx: number;
    dy: number;
    compositionOk: boolean;
    sceneMatch: boolean;
    stable: boolean;
    decision: string;
    hist: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [captures, setCaptures] = useState<{ id: number; src: string }[]>([]);
  const stableRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const camBlobRef = useRef<string | null>(null);
  const captureId = useRef(0);
  const liveUrlRef = useRef(liveUrl);
  liveUrlRef.current = liveUrl;

  const active = useMemo(
    () => shots.find((shot) => shot.shot_id === activeId) ?? shots[0],
    [activeId, shots],
  );
  const target = useMemo(
    (): [number, number] => [active.composition.horizontal, active.composition.vertical],
    [active.composition.horizontal, active.composition.vertical],
  );
  const stillMode = source === "still" || source === "upload";

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      shots.map(async (shot) => {
        const pixels = await pixelsFromUrl(shotImage(shot));
        return [
          shot.shot_id,
          extractFeatures(pixels, DEMO_BOX[shot.shot_id] ?? null),
        ] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) {
          setRefCache(Object.fromEntries(entries));
        }
      })
      .catch((err: Error) => setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [shots]);

  const scoreFrame = useCallback(
    async (pixels: RgbPixels, needed: number) => {
      const reference = refCache[active.shot_id];
      if (!reference) {
        return;
      }
      const current = extractFeatures(pixels, box);
      const match = scoreMatch(current, reference, DEFAULT_MATCH_THRESHOLD);
      const composition = judgeComposition(box, target, DEFAULT_COMPOSITION_DELTA);
      const step = nextDecision(
        match.sceneMatch,
        composition.compositionOk,
        stableRef.current,
        needed,
      );
      stableRef.current = step.nextCount;
      setVerdict({
        similarity: match.similarity,
        dx: composition.dx,
        dy: composition.dy,
        compositionOk: composition.compositionOk,
        sceneMatch: match.sceneMatch,
        stable: step.stable,
        decision: step.decision,
        hist: match.histogramSimilarity,
      });
      if (step.decision === CAPTURE_GO) {
        captureId.current += 1;
        const src = liveUrlRef.current;
        setCaptures((list) => [{ id: captureId.current, src }, ...list].slice(0, 6));
      }
    },
    [active.shot_id, box, refCache, target],
  );

  const scoreCurrentStill = useCallback(async () => {
    try {
      setError(null);
      const pixels = await pixelsFromUrl(liveUrl);
      stableRef.current = 0;
      await scoreFrame(pixels, 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取画面");
    }
  }, [liveUrl, scoreFrame]);

  useEffect(() => {
    if (stillMode && refCache[active.shot_id] && liveUrl) {
      void scoreCurrentStill();
    }
  }, [active.shot_id, liveUrl, box, refCache, stillMode, scoreCurrentStill]);

  useEffect(() => {
    if (source !== "webcam") {
      return undefined;
    }
    let stream: MediaStream | null = null;
    let raf = 0;
    const video = videoRef.current;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        if (!video) {
          return;
        }
        video.srcObject = stream;
        await video.play();
        const tick = (now: number) => {
          if (now - last > 240) {
            last = now;
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext("2d");
            if (ctx && canvas.width && canvas.height && video.videoWidth) {
              ctx.drawImage(video, 0, 0);
              const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
              void scoreFrame(rgbaToRgb(data.data, canvas.width, canvas.height), 8);
            }
          }
          raf = requestAnimationFrame(tick);
        };
        let last = 0;
        raf = requestAnimationFrame(tick);
      } catch (err) {
        setError(err instanceof Error ? err.message : "无法打开摄像头");
        setSource("still");
      }
    })();
    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [source, scoreFrame]);

  useEffect(() => {
    if (!camOn || source !== "cam") {
      return undefined;
    }
    let stopped = false;
    const poll = async () => {
      while (!stopped) {
        try {
          const res = await fetch(camUrl, { cache: "no-store" });
          if (!res.ok) {
            throw new Error(`CAM HTTP ${res.status}`);
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          if (camBlobRef.current) {
            URL.revokeObjectURL(camBlobRef.current);
          }
          camBlobRef.current = url;
          const pixels = await pixelsFromUrl(url);
          setLiveUrl(url);
          await scoreFrame(pixels, 8);
          setError(null);
        } catch (err) {
          setError(
            err instanceof Error
              ? `${err.message}（电脑需连 flyvision-cam，固件需允许 CORS）`
              : "CAM 拉取失败",
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 280));
      }
    };
    void poll();
    return () => {
      stopped = true;
    };
  }, [camOn, camUrl, source, scoreFrame]);

  function useShotAsLive(shot: ShotJson) {
    setSource("still");
    setCamOn(false);
    setLiveUrl(shotImage(shot));
    setBox(DEMO_BOX[shot.shot_id] ?? null);
    stableRef.current = 0;
  }

  function onFrameClick(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const w = 0.16;
    const h = 0.46;
    setBox({
      x: Math.max(0, Math.min(1 - w, x - w / 2)),
      y: Math.max(0, Math.min(1 - h, y - h / 2)),
    });
    stableRef.current = 0;
  }

  const go = verdict?.decision === CAPTURE_GO;

  return (
    <div className="workbench fv-page">
      <header className="hdr">
        <div className="brand">
          <Link href="/yunjing">
            <b>YUNJING</b>
          </Link>
          <span>FLYVISION</span>
        </div>
        <div className="hdr-actions">
          <Link className="btn" href="/yunjing/cinepath">
            CinePath
          </Link>
        </div>
      </header>

      <div className="fv-grid">
        <aside className="fv-col">
          <p className="fv-kicker">Shot Database · 博克图 Scene 02</p>
          {shots.map((shot) => (
            <button
              key={shot.shot_id}
              type="button"
              className={`fv-shot${shot.shot_id === activeId ? " is-on" : ""}`}
              onClick={() => {
                setActiveId(shot.shot_id);
                stableRef.current = 0;
              }}
            >
              <img src={shotImage(shot)} alt="" />
              <span>
                <b>
                  {shot.shot_id.replace("shot_", "Shot ")} · {shot.title}
                </b>
                <em>
                  {shot.target.type} · 构图 {shot.composition.horizontal.toFixed(2)},{" "}
                  {shot.composition.vertical.toFixed(2)}
                </em>
              </span>
            </button>
          ))}
          <button className="btn primary" type="button" onClick={() => useShotAsLive(active)}>
            用当前 Shot 参考图当画面
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => useShotAsLive(shots.find((item) => item.shot_id === "shot_01") ?? shots[0])}
          >
            错配：用 Shot 01 去对 {active.shot_id.replace("shot_", "Shot ")}
          </button>
        </aside>

        <section className="fv-stage">
          <div className="fv-frame" onClick={onFrameClick}>
            {source === "webcam" ? (
              <video ref={videoRef} className="fv-live" muted playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="fv-live" src={liveUrl} alt="live frame" />
            )}
            <span
              className="fv-cross"
              style={{ left: `${target[0] * 100}%`, top: `${target[1] * 100}%` }}
            />
            {box ? (
              <span
                className={`fv-box${verdict?.compositionOk ? " is-ok" : ""}`}
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.w * 100}%`,
                  height: `${box.h * 100}%`,
                }}
              />
            ) : null}
          </div>
          <p className="fv-hint">点击画面放置人物框。金色十字是 Shot 目标构图。</p>
          <div className="fv-tools">
            <button className="btn" type="button" onClick={() => fileRef.current?.click()}>
              上传画面
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) {
                  return;
                }
                setSource("upload");
                setCamOn(false);
                setLiveUrl(URL.createObjectURL(file));
                stableRef.current = 0;
              }}
            />
            <button
              className="btn"
              type="button"
              onClick={() => {
                setSource("webcam");
                setCamOn(false);
                stableRef.current = 0;
              }}
            >
              打开电脑摄像头
            </button>
            <label className="fv-cam">
              CAM
              <input value={camUrl} onChange={(event) => setCamUrl(event.target.value)} />
            </label>
            <button
              className="btn"
              type="button"
              onClick={() => {
                setSource("cam");
                setCamOn((value) => !value);
                stableRef.current = 0;
              }}
            >
              {camOn ? "停止 CAM" : "拉取 ESP32-CAM"}
            </button>
          </div>
          {error ? <p className="fv-error">{error}</p> : null}
        </section>

        <aside className="fv-col fv-stats">
          <p className="fv-kicker">Live matcher</p>
          <div className={`fv-go${go ? " is-go" : ""}`}>
            {verdict?.decision ?? CONTINUE_FOLLOW}
          </div>
          <dl>
            <div>
              <dt>active shot</dt>
              <dd>{active.shot_id}</dd>
            </div>
            <div>
              <dt>similarity</dt>
              <dd>{verdict ? verdict.similarity.toFixed(3) : "—"}</dd>
            </div>
            <div>
              <dt>histogram</dt>
              <dd>{verdict ? verdict.hist.toFixed(3) : "—"}</dd>
            </div>
            <div>
              <dt>Δx / Δy</dt>
              <dd>
                {verdict
                  ? `${verdict.dx >= 0 ? "+" : ""}${verdict.dx.toFixed(3)} / ${verdict.dy >= 0 ? "+" : ""}${verdict.dy.toFixed(3)}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>COMPOSITION_OK</dt>
              <dd>{verdict ? String(verdict.compositionOk) : "—"}</dd>
            </div>
            <div>
              <dt>scene match</dt>
              <dd>{verdict ? String(verdict.sceneMatch) : "—"}</dd>
            </div>
          </dl>
          <p className="fv-note">
            ESP32-CAM 只出图。这里是电脑上的 Shot Matching：像不像预设镜头，构图够不够，够了就
            GO。不改飞控。
          </p>
          {captures.length ? (
            <div className="fv-caps">
              <p className="fv-kicker">GO captures</p>
              {captures.map((item) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={item.id} src={item.src} alt="" />
              ))}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
