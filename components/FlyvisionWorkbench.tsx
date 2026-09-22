"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CAPTURE_GO,
  CONTINUE_FOLLOW,
  extractFeatures,
  judgeComposition,
  nextDecision,
  rgbaToRgb,
  scoreMatch,
  type RgbPixels,
} from "@/lib/flyvision-match";
import { detectYolo, getYoloSession, primarySubject, type YoloDet } from "@/lib/yolo";

type PaneDets = YoloDet[];

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取图片"));
    image.src = url;
  });
}

function imagePixels(image: HTMLImageElement): RgbPixels {
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

export function FlyvisionWorkbench() {
  const [modelState, setModelState] = useState<"loading" | "ready" | "error">("loading");
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [leftDets, setLeftDets] = useState<PaneDets>([]);
  const [rightDets, setRightDets] = useState<PaneDets>([]);
  const [camError, setCamError] = useState<string | null>(null);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{
    similarity: number;
    dx: number;
    dy: number;
    compositionOk: boolean;
    sceneMatch: boolean;
    decision: string;
    leftLabel: string;
    rightLabel: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const leftImgRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stableRef = useRef(0);
  const leftPixelsRef = useRef<RgbPixels | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getYoloSession()
      .then(() => {
        if (!cancelled) {
          setModelState("ready");
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setModelState("error");
          setDetectError(err.message || "YOLOv8 模型加载失败");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runLeftDetect = useCallback(async (url: string) => {
    try {
      setDetectError(null);
      const image = await loadHtmlImage(url);
      leftPixelsRef.current = imagePixels(image);
      const dets = await detectYolo(image, image.naturalWidth, image.naturalHeight);
      setLeftDets(dets);
      if (!dets.length) {
        setDetectError("左边图片没有识别到主体");
      }
    } catch (err) {
      setLeftDets([]);
      setDetectError(err instanceof Error ? err.message : "主体识别失败");
    }
  }, []);

  useEffect(() => {
    if (modelState !== "ready" || !uploadUrl) {
      return;
    }
    void runLeftDetect(uploadUrl);
  }, [modelState, uploadUrl, runLeftDetect]);

  useEffect(() => {
    if (modelState !== "ready") {
      return undefined;
    }
    const video = videoRef.current;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (!video) {
          return;
        }
        video.srcObject = stream;
        await video.play();
        setCamError(null);
        const tick = async () => {
          if (stopped) {
            return;
          }
          if (video.videoWidth && video.videoHeight) {
            try {
              const dets = await detectYolo(video, video.videoWidth, video.videoHeight);
              if (!stopped) {
                setRightDets(dets);
              }
            } catch (err) {
              if (!stopped) {
                setDetectError(err instanceof Error ? err.message : "摄像头识别失败");
              }
            }
          }
          timer = window.setTimeout(() => {
            void tick();
          }, 320);
        };
        void tick();
      } catch (err) {
        setCamError(err instanceof Error ? err.message : "无法打开摄像头");
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [modelState]);

  useEffect(() => {
    const left = primarySubject(leftDets);
    const right = primarySubject(rightDets);
    const leftPixels = leftPixelsRef.current;
    const video = videoRef.current;
    if (!left || !right || !leftPixels || !video?.videoWidth) {
      setVerdict(null);
      stableRef.current = 0;
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.drawImage(video, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const live = rgbaToRgb(data.data, canvas.width, canvas.height);
    const leftFeat = extractFeatures(leftPixels, left.box);
    const rightFeat = extractFeatures(live, right.box);
    const match = scoreMatch(rightFeat, leftFeat, 0.72);
    const target: [number, number] = [left.box.x + left.box.w / 2, left.box.y + left.box.h / 2];
    const composition = judgeComposition(right.box, target, 0.12);
    const step = nextDecision(match.sceneMatch, composition.compositionOk, stableRef.current, 4);
    stableRef.current = step.nextCount;
    setVerdict({
      similarity: match.similarity,
      dx: composition.dx,
      dy: composition.dy,
      compositionOk: composition.compositionOk,
      sceneMatch: match.sceneMatch,
      decision: step.decision,
      leftLabel: `${left.label} ${(left.score * 100).toFixed(0)}%`,
      rightLabel: `${right.label} ${(right.score * 100).toFixed(0)}%`,
    });
  }, [leftDets, rightDets]);

  function onUpload(file: File | undefined) {
    if (!file) {
      return;
    }
    if (uploadUrl) {
      URL.revokeObjectURL(uploadUrl);
    }
    const url = URL.createObjectURL(file);
    setUploadUrl(url);
    setLeftDets([]);
    stableRef.current = 0;
  }

  const leftPrimary = primarySubject(leftDets);
  const rightPrimary = primarySubject(rightDets);
  const go = verdict?.decision === CAPTURE_GO;

  return (
    <div className="workbench fv-page">
      <header className="hdr">
        <div className="brand">
          <Link href="/yunjing">
            <b>YUNJING</b>
          </Link>
          <span>FLYVISION · YOLOv8n</span>
        </div>
        <div className="hdr-actions">
          <span className="fv-model">
            {modelState === "loading"
              ? "加载 YOLOv8n…"
              : modelState === "ready"
                ? "YOLOv8n 已就绪"
                : "模型失败"}
          </span>
        </div>
      </header>

      <div className="fv-split">
        <section className="fv-pane">
          <p className="fv-kicker">左边 · 上传图 · 主体识别</p>
          <div
            className="fv-frame"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              onUpload(event.dataTransfer.files[0]);
            }}
          >
            {uploadUrl ? (
              <div className="fv-media">
                <img ref={leftImgRef} className="fv-live" src={uploadUrl} alt="uploaded reference" />
                <DetBoxes dets={leftDets} primary={leftPrimary} />
              </div>
            ) : (
              <button
                className="fv-empty"
                type="button"
                onClick={() => fileRef.current?.click()}
              >
                上传参考图
                <em>YOLO 会框出人 / 车 / 建筑等主体</em>
              </button>
            )}
          </div>
          <div className="fv-tools">
            <button className="btn primary" type="button" onClick={() => fileRef.current?.click()}>
              {uploadUrl ? "换一张图" : "上传图"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                onUpload(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </div>
          <DetList dets={leftDets} empty="还没有识别结果" />
        </section>

        <section className="fv-pane">
          <p className="fv-kicker">右边 · 摄像头</p>
          <div className="fv-frame">
            <div className="fv-media">
              <video ref={videoRef} className="fv-live" muted playsInline autoPlay />
              <DetBoxes dets={rightDets} primary={rightPrimary} />
            </div>
            {camError ? <p className="fv-cam-error">{camError}</p> : null}
          </div>
          <p className="fv-hint">摄像头画面实时跑同一套 YOLOv8n，主体框跟左边对比。</p>
          <DetList dets={rightDets} empty={camError ? camError : "等待摄像头画面"} />
        </section>
      </div>

      <footer className="fv-bar">
        <div className={`fv-go${go ? " is-go" : ""}`}>
          {verdict?.decision ?? CONTINUE_FOLLOW}
        </div>
        <dl>
          <div>
            <dt>左主体</dt>
            <dd>{verdict?.leftLabel ?? leftPrimary?.label ?? "—"}</dd>
          </div>
          <div>
            <dt>右主体</dt>
            <dd>{verdict?.rightLabel ?? rightPrimary?.label ?? "—"}</dd>
          </div>
          <div>
            <dt>similarity</dt>
            <dd>{verdict ? verdict.similarity.toFixed(3) : "—"}</dd>
          </div>
          <div>
            <dt>Δx / Δy</dt>
            <dd>
              {verdict
                ? `${verdict.dx >= 0 ? "+" : ""}${verdict.dx.toFixed(3)} / ${
                    verdict.dy >= 0 ? "+" : ""
                  }${verdict.dy.toFixed(3)}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>COMPOSITION_OK</dt>
            <dd>{verdict ? String(verdict.compositionOk) : "—"}</dd>
          </div>
        </dl>
        {detectError ? <p className="fv-error">{detectError}</p> : null}
      </footer>
    </div>
  );
}

function DetBoxes({
  dets,
  primary,
}: {
  dets: YoloDet[];
  primary: YoloDet | null;
}) {
  return (
    <>
      {dets.map((det, index) => {
        const isPrimary = primary === det;
        return (
          <span
            key={`${det.label}-${index}`}
            className={`fv-box${isPrimary ? " is-ok" : ""}`}
            style={{
              left: `${det.box.x * 100}%`,
              top: `${det.box.y * 100}%`,
              width: `${det.box.w * 100}%`,
              height: `${det.box.h * 100}%`,
            }}
          >
            <i>
              {det.label} {(det.score * 100).toFixed(0)}%
            </i>
          </span>
        );
      })}
    </>
  );
}

function DetList({ dets, empty }: { dets: YoloDet[]; empty: string }) {
  if (!dets.length) {
    return <p className="fv-hint">{empty}</p>;
  }
  return (
    <ul className="fv-dets">
      {dets.map((det, index) => (
        <li key={`${det.label}-${index}`}>
          <b>{det.label}</b>
          <span>{(det.score * 100).toFixed(0)}%</span>
        </li>
      ))}
    </ul>
  );
}
