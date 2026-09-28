"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { embedClip, getClipSession } from "@/lib/clip-embed";
import {
  CAPTURE_GO,
  extractFeatures,
  judgeComposition,
  nextDecision,
  rgbaToRgb,
  scoreMatch,
  type RgbPixels,
} from "@/lib/flyvision-match";
import {
  formatShotLabels,
  labelShot,
  labelSimilarity,
  type ShotLabelSet,
} from "@/lib/shot-labels";
import {
  compareSpatial,
  cropLabel,
  estimateSpatial,
  formatDistance,
  headingLabel,
  SpatialSmoother,
  type SpatialDelta,
  type SpatialFix,
  type SpatialOptions,
} from "@/lib/spatial";
import { detectYolo, getYoloSession, primarySubject, type YoloDet } from "@/lib/yolo";

const LABEL_ZH: Record<string, string> = {
  person: "人",
  bicycle: "自行车",
  car: "车",
  motorcycle: "摩托",
  bus: "公交",
  truck: "卡车",
  dog: "狗",
  cat: "猫",
  chair: "椅",
  couch: "沙发",
  backpack: "包",
};

type RichDet = YoloDet & { spatial: SpatialFix | null };

function zh(label: string): string {
  return LABEL_ZH[label] ?? label;
}

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
  return rgbaToRgb(
    ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    canvas.width,
    canvas.height,
  );
}

function enrich(dets: YoloDet[], options: SpatialOptions): RichDet[] {
  return dets.map((det) => ({
    ...det,
    spatial: estimateSpatial(det.label, det.box, options),
  }));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new DOMException("打开摄像头超时", "NotFoundError"));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function camErrorText(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "浏览器拦住了摄像头，点允许后再开";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "没有找到电脑摄像头";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "摄像头被别的程序占用";
  }
  if (name === "OverconstrainedError") {
    return "这台电脑的摄像头打不开预设分辨率，换一个试试";
  }
  return err instanceof Error ? err.message : "没有摄像头";
}

export function FlyvisionWorkbench() {
  const [modelState, setModelState] = useState<"loading" | "ready" | "error">("loading");
  const [clipState, setClipState] = useState<"loading" | "ready" | "error">("loading");
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [leftDets, setLeftDets] = useState<RichDet[]>([]);
  const [rightDets, setRightDets] = useState<RichDet[]>([]);
  const [leftLabels, setLeftLabels] = useState<ShotLabelSet | null>(null);
  const [rightLabels, setRightLabels] = useState<ShotLabelSet | null>(null);
  const [hfovDeg, setHfovDeg] = useState(70);
  const [personHeightM, setPersonHeightM] = useState(1.7);
  const [rejectPartial, setRejectPartial] = useState(true);
  const [camError, setCamError] = useState<string | null>(null);
  const [camLive, setCamLive] = useState(false);
  const [camBusy, setCamBusy] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [detectError, setDetectError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{
    similarity: number;
    decision: string;
    compositionOk: boolean;
    spatial: SpatialDelta | null;
    leftLabel: string;
    rightLabel: string;
    clip: number | null;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stableRef = useRef(0);
  const leftPixelsRef = useRef<RgbPixels | null>(null);
  const leftAspectRef = useRef(16 / 9);
  const leftEmbedRef = useRef<number[] | null>(null);
  const liveSmoothRef = useRef(new SpatialSmoother(5));
  const spatialOpts = useMemo(
    () => ({ hfovDeg, personHeightM, rejectPartial }),
    [hfovDeg, personHeightM, rejectPartial],
  );
  const spatialOptsRef = useRef(spatialOpts);
  spatialOptsRef.current = spatialOpts;
  const clipStateRef = useRef(clipState);
  clipStateRef.current = clipState;

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
          setDetectError(err.message || "YOLOv8 未加载");
        }
      });
    void getClipSession()
      .then(() => {
        if (!cancelled) {
          setClipState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setClipState("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runLeftDetect = useCallback(async (url: string) => {
    const image = await loadHtmlImage(url);
    const pixels = imagePixels(image);
    leftPixelsRef.current = pixels;
    leftAspectRef.current = image.naturalWidth / image.naturalHeight;
    const dets = enrich(await detectYolo(image, image.naturalWidth, image.naturalHeight), {
      aspect: leftAspectRef.current,
      ...spatialOptsRef.current,
    });
    setLeftDets(dets);
    const primary = primarySubject(dets);
    setLeftLabels(
      primary ? labelShot(primary.box, primary.label, Math.max(0, dets.length - 1)) : null,
    );
    if (clipStateRef.current === "ready") {
      leftEmbedRef.current = await embedClip(pixels);
    } else {
      leftEmbedRef.current = null;
    }
    if (!dets.length) {
      setDetectError("参考图里没有识别到主体");
    } else {
      setDetectError(null);
    }
  }, []);

  useEffect(() => {
    if (modelState !== "ready" || !uploadUrl) {
      return;
    }
    void runLeftDetect(uploadUrl).catch((err: Error) => {
      setLeftDets([]);
      setDetectError(err.message);
    });
  }, [modelState, uploadUrl, runLeftDetect, clipState]);

  useEffect(() => {
    setLeftDets((dets) =>
      dets.map((det) => ({
        ...det,
        spatial: estimateSpatial(det.label, det.box, {
          aspect: leftAspectRef.current,
          ...spatialOpts,
        }),
      })),
    );
  }, [spatialOpts]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    liveSmoothRef.current.reset();
    setCamLive(false);
    setRightDets([]);
    setRightLabels(null);
    setCamBusy(false);
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError("这个浏览器不能开摄像头，换 Chrome 或 Safari");
        return;
      }
      setCamBusy(true);
      setCamError(null);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const video = videoRef.current;
      const tried: MediaStreamConstraints[] = deviceId
        ? [
            {
              audio: false,
              video: {
                deviceId: { exact: deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
            },
            { audio: false, video: { deviceId: { exact: deviceId } } },
          ]
        : [
            { audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 } } },
            { audio: false, video: true },
          ];
      let stream: MediaStream | null = null;
      let lastErr: unknown = null;
      for (const constraints of tried) {
        try {
          stream = await withTimeout(navigator.mediaDevices.getUserMedia(constraints), 8000);
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!stream) {
        setCamBusy(false);
        setCamLive(false);
        setCamError(camErrorText(lastErr));
        return;
      }
      streamRef.current = stream;
      if (video) {
        video.srcObject = stream;
        try {
          await video.play();
        } catch {
          // Autoplay can wait for the video element to layout; the next tick still runs.
        }
      }
      const picked = stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId ?? "";
      if (picked) {
        setCameraId(picked);
      }
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        setCameras(all.filter((item) => item.kind === "videoinput"));
      } catch {
        setCameras([]);
      }
      setCamLive(true);
      setCamBusy(false);
    },
    [],
  );

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!camLive || modelState !== "ready") {
      return undefined;
    }
    const video = videoRef.current;
    let timer = 0;
    let stopped = false;
    const tick = async () => {
      if (stopped || !video?.videoWidth) {
        timer = window.setTimeout(() => void tick(), 360);
        return;
      }
      try {
        const aspect = video.videoWidth / video.videoHeight;
        const dets = enrich(await detectYolo(video, video.videoWidth, video.videoHeight), {
          aspect,
          ...spatialOptsRef.current,
        });
        const primary = primarySubject(dets);
        const smoothed = liveSmoothRef.current.push(
          primary && "spatial" in primary ? (primary as RichDet).spatial : null,
        );
        const next = dets.map((det) =>
          primary && det === primary ? { ...det, spatial: smoothed } : det,
        );
        if (!stopped) {
          setRightDets(next);
          setRightLabels(
            primary ? labelShot(primary.box, primary.label, Math.max(0, dets.length - 1)) : null,
          );
        }
      } catch (err) {
        if (!stopped) {
          setDetectError(err instanceof Error ? err.message : "实拍识别失败");
        }
      }
      timer = window.setTimeout(() => void tick(), 360);
    };
    void tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      liveSmoothRef.current.reset();
    };
  }, [camLive, modelState]);

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
    const live = rgbaToRgb(
      ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
    );
    const current = extractFeatures(live, right.box);
    const reference = extractFeatures(leftPixels, left.box);
    const labels =
      leftLabels && rightLabels ? labelSimilarity(rightLabels, leftLabels) : undefined;
    const composition = judgeComposition(
      right.box,
      [left.box.x + left.box.w / 2, left.box.y + left.box.h / 2],
      0.12,
    );
    let cancelled = false;
    const publish = (clipCosine?: number) => {
      if (cancelled) {
        return;
      }
      const match = scoreMatch(current, reference, 0.72, {
        clipCosine,
        labelSimilarity: labels,
      });
      const step = nextDecision(match.sceneMatch, composition.compositionOk, stableRef.current, 4);
      stableRef.current = step.nextCount;
      const leftFix = "spatial" in left ? (left as RichDet).spatial : null;
      const rightFix = "spatial" in right ? (right as RichDet).spatial : null;
      setVerdict({
        similarity: match.similarity,
        decision: step.decision,
        compositionOk: composition.compositionOk,
        spatial: leftFix && rightFix ? compareSpatial(leftFix, rightFix) : null,
        leftLabel: zh(left.label),
        rightLabel: zh(right.label),
        clip: match.clipSimilarity,
      });
    };
    if (clipStateRef.current === "ready" && leftEmbedRef.current) {
      void embedClip(live)
        .then((liveEmbed) => {
          const clip = scoreMatch(
            { ...current, embedding: liveEmbed },
            { ...reference, embedding: leftEmbedRef.current ?? undefined },
            0,
          ).clipSimilarity;
          publish(clip ?? undefined);
        })
        .catch(() => publish());
    } else {
      publish();
    }
    return () => {
      cancelled = true;
    };
  }, [leftDets, rightDets, leftLabels, rightLabels]);

  function onUpload(file: File | undefined) {
    if (!file) {
      return;
    }
    if (uploadUrl) {
      URL.revokeObjectURL(uploadUrl);
    }
    setUploadUrl(URL.createObjectURL(file));
    setLeftDets([]);
    stableRef.current = 0;
  }

  const leftPrimary = primarySubject(leftDets) as RichDet | null;
  const rightPrimary = primarySubject(rightDets) as RichDet | null;
  const go = verdict?.decision === CAPTURE_GO;

  return (
    <div className="apple-app">
      <header className="apple-top">
        <strong>
          <Link href="/yunjing">Flyvision</Link>
        </strong>
        <nav>
          <Link href="/flyvision/plan">计划</Link>
          <Link href="/yunjing">云径</Link>
        </nav>
        <span
          className={`apple-dot${modelState === "ready" ? " ready" : ""}${
            modelState === "error" ? " bad" : ""
          }`}
        >
          <i />
          {modelState === "loading"
            ? "YOLOv8n 加载中"
            : modelState === "ready"
              ? clipState === "ready"
                ? "YOLO · CLIP · 空间"
                : "YOLOv8n · 空间估计"
              : "模型失败"}
        </span>
      </header>

      <div className="apple-split">
        <section className="apple-pane">
          <h2>参考</h2>
          <div
            className="apple-well"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              onUpload(event.dataTransfer.files[0]);
            }}
          >
            {uploadUrl ? (
              <div className="apple-media">
                <img src={uploadUrl} alt="" />
                <Boxes dets={leftDets} primary={leftPrimary} />
              </div>
            ) : (
              <button className="apple-drop" type="button" onClick={() => fileRef.current?.click()}>
                <span>上传图片</span>
                <em>识别主体，并估计距离</em>
              </button>
            )}
          </div>
          <Pills
            dets={leftDets}
            empty="还没有参考图"
            onUpload={() => fileRef.current?.click()}
            canUpload
            labels={leftLabels}
          />
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
        </section>

        <section className="apple-pane">
          <h2>实拍</h2>
          <div className="apple-well">
            <div className={`apple-media${camLive ? "" : " is-idle"}`}>
              <video ref={videoRef} muted playsInline />
              <Boxes dets={rightDets} primary={rightPrimary} />
            </div>
            {camLive ? null : (
              <button
                className="apple-drop"
                type="button"
                disabled={modelState !== "ready" || camBusy}
                onClick={() => void startCamera(cameraId || undefined)}
              >
                <span>{camBusy ? "正在打开…" : "电脑摄像头"}</span>
                <em>
                  {modelState === "loading"
                    ? "等 YOLOv8n 加载完"
                    : camError ?? "先看 YOLOv8 识别，再对参考图"}
                </em>
              </button>
            )}
            {camLive && camError ? <p className="apple-cam-err">{camError}</p> : null}
          </div>
          <div className="apple-pills">
            {camLive ? (
              <>
                <button type="button" onClick={stopCamera}>
                  关闭
                </button>
                {cameras.length > 1 ? (
                  <select
                    className="apple-cam-select"
                    value={cameraId}
                    onChange={(event) => {
                      const next = event.target.value;
                      setCameraId(next);
                      void startCamera(next);
                    }}
                  >
                    {cameras.map((item, index) => (
                      <option key={item.deviceId || String(index)} value={item.deviceId}>
                        {item.label || `摄像头 ${index + 1}`}
                      </option>
                    ))}
                  </select>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                disabled={modelState !== "ready" || camBusy}
                onClick={() => void startCamera(cameraId || undefined)}
              >
                {camBusy ? "打开中" : "开启摄像头"}
              </button>
            )}
            {rightLabels ? <span className="apple-pill">{formatShotLabels(rightLabels)}</span> : null}
            {rightDets.length ? (
              rightDets.map((det, index) => (
                <span className="apple-pill" key={`${det.label}-${index}`}>
                  {zh(det.label)}
                  <em>
                    {det.spatial
                      ? `${formatDistance(det.spatial)}${
                          cropLabel(det.spatial.crop) ? ` · ${cropLabel(det.spatial.crop)}` : ""
                        }`
                      : `${(det.score * 100).toFixed(0)}%`}
                  </em>
                </span>
              ))
            ) : (
              <p className="apple-muted">
                {camLive ? "画面里还没有主体" : camError ?? "打开电脑摄像头看 YOLOv8"}
              </p>
            )}
          </div>
        </section>
      </div>

      <footer className="apple-meter">
        <div className={`apple-status${go ? " go" : ""}`}>
          {verdict?.spatial?.summary ??
            (go ? "可以拍" : camLive ? "继续对齐" : "打开电脑摄像头看 YOLOv8")}
        </div>
        <dl>
          <div>
            <dt>参考主体</dt>
            <dd>{spatialLine(leftPrimary) ?? "—"}</dd>
          </div>
          <div>
            <dt>实拍主体</dt>
            <dd>{spatialLine(rightPrimary) ?? "—"}</dd>
          </div>
          <div>
            <dt>相似度</dt>
            <dd>
              {verdict
                ? `${verdict.similarity.toFixed(2)}${
                    verdict.clip !== null ? ` · CLIP ${verdict.clip.toFixed(2)}` : ""
                  }`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>构图</dt>
            <dd>{verdict ? (verdict.compositionOk ? "对齐" : "未对齐") : "—"}</dd>
          </div>
        </dl>
        <div className="apple-cal">
          <label>
            <span>视场 {hfovDeg}°</span>
            <input
              type="range"
              min={50}
              max={90}
              step={1}
              value={hfovDeg}
              aria-label="水平视场"
              onChange={(event) => setHfovDeg(Number(event.target.value))}
            />
          </label>
          <label>
            <span>身高 {personHeightM.toFixed(2)} m</span>
            <input
              type="range"
              min={150}
              max={190}
              step={1}
              value={Math.round(personHeightM * 100)}
              aria-label="主体身高"
              onChange={(event) => setPersonHeightM(Number(event.target.value) / 100)}
            />
          </label>
          <label className="apple-check">
            <input
              type="checkbox"
              checked={rejectPartial}
              onChange={(event) => setRejectPartial(event.target.checked)}
            />
            截断框不计距离
          </label>
        </div>
        {detectError ? <p className="apple-error">{detectError}</p> : null}
      </footer>
    </div>
  );
}

function spatialLine(det: RichDet | null): string | null {
  if (!det) {
    return null;
  }
  const name = zh(det.label);
  if (!det.spatial) {
    return name;
  }
  const crop = cropLabel(det.spatial.crop);
  return `${name}  ${formatDistance(det.spatial)}${crop ? `  ${crop}` : ""}  ${headingLabel(det.spatial.heading)}`;
}

function Boxes({
  dets,
  primary,
}: {
  dets: RichDet[];
  primary: RichDet | null;
}) {
  return (
    <>
      {dets.map((det, index) => (
        <span
          key={`${det.label}-${index}`}
          className={`apple-box${primary === det ? " is-on" : ""}`}
          style={{
            left: `${det.box.x * 100}%`,
            top: `${det.box.y * 100}%`,
            width: `${det.box.w * 100}%`,
            height: `${det.box.h * 100}%`,
          }}
        >
          <b>
            {zh(det.label)}
            {det.spatial ? `  ${formatDistance(det.spatial)}` : ""}
          </b>
        </span>
      ))}
    </>
  );
}

function Pills({
  dets,
  empty,
  onUpload,
  canUpload,
  labels,
}: {
  dets: RichDet[];
  empty: string;
  onUpload?: () => void;
  canUpload?: boolean;
  labels?: ShotLabelSet | null;
}) {
  return (
    <div className="apple-pills">
      {canUpload ? (
        <button type="button" onClick={onUpload}>
          {dets.length ? "换图" : "上传"}
        </button>
      ) : null}
      {labels ? <span className="apple-pill">{formatShotLabels(labels)}</span> : null}
      {dets.length ? (
        dets.map((det, index) => (
          <span className="apple-pill" key={`${det.label}-${index}`}>
            {zh(det.label)}
            <em>
              {det.spatial
                ? `${formatDistance(det.spatial)}${cropLabel(det.spatial.crop) ? ` · ${cropLabel(det.spatial.crop)}` : ""}`
                : `${(det.score * 100).toFixed(0)}%`}
            </em>
          </span>
        ))
      ) : (
        <p className="apple-muted">{empty}</p>
      )}
    </div>
  );
}
