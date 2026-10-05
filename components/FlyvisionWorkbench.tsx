"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { embedClip, getClipSession } from "@/lib/clip-embed";
import {
  CAPTURE_GO,
  extractFeatures,
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
  cropLabel,
  camStillUrl,
  DEFAULT_ESP_CAM_CAPTURE_URL,
  ESP32CAM_HFOV_DEG,
  LOCAL_CAM_CAPTURE_URL,
  estimateSpatial,
  formatMetersHint,
  headingLabel,
  hfovForSource,
  httpsBlocksHttpStream,
  judgeGeometry,
  SpatialSmoother,
  WEBCAM_HFOV_DEG,
  type GeometryGate,
  type LiveSource,
  type SpatialFix,
  type SpatialOptions,
} from "@/lib/spatial";
import {
  boxIou,
  detectYolo,
  getYoloSession,
  primarySubject,
  SubjectTracker,
  type YoloDet,
} from "@/lib/yolo";

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

async function pullCamStill(url: string): Promise<string> {
  const still = camStillUrl(url);
  const sep = still.includes("?") ? "&" : "?";
  const paths = still.startsWith("/")
    ? [`${still}${sep}t=${Date.now()}`, `${DEFAULT_ESP_CAM_CAPTURE_URL}?t=${Date.now()}`]
    : [`${still}${sep}t=${Date.now()}`];
  let lastErr: unknown = null;
  for (const path of paths) {
    try {
      const res = await fetch(path, { cache: "no-store", mode: path.startsWith("/") ? "same-origin" : "cors" });
      if (!res.ok) {
        lastErr = new Error(`CAM HTTP ${res.status}`);
        continue;
      }
      const blob = await res.blob();
      if (blob.size < 400) {
        lastErr = new Error("CAM 没出 JPEG");
        continue;
      }
      return URL.createObjectURL(blob);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("连不上 CAM");
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
  const [webcamHfovDeg, setWebcamHfovDeg] = useState(WEBCAM_HFOV_DEG);
  const [camHfovDeg, setCamHfovDeg] = useState(ESP32CAM_HFOV_DEG);
  const [personHeightM, setPersonHeightM] = useState(1.7);
  const [rejectPartial, setRejectPartial] = useState(true);
  const [camError, setCamError] = useState<string | null>(null);
  const [liveKind, setLiveKind] = useState<LiveSource>("idle");
  const [camBusy, setCamBusy] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [camUrl, setCamUrl] = useState(LOCAL_CAM_CAPTURE_URL);
  const [pageHttps, setPageHttps] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<{
    similarity: number;
    decision: string;
    compositionOk: boolean;
    geometry: GeometryGate | null;
    metersHint: string | null;
    leftLabel: string;
    rightLabel: string;
    clip: number | null;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mjpegRef = useRef<HTMLImageElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stableRef = useRef(0);
  const leftPixelsRef = useRef<RgbPixels | null>(null);
  const leftAspectRef = useRef(16 / 9);
  const leftEmbedRef = useRef<number[] | null>(null);
  const liveSmoothRef = useRef(new SpatialSmoother(5));
  const trackerRef = useRef(new SubjectTracker());
  const liveKindRef = useRef(liveKind);
  const camPollRef = useRef(false);
  const camBlobRef = useRef<string | null>(null);
  liveKindRef.current = liveKind;
  const live = liveKind !== "idle";
  const mixedCam = pageHttps && httpsBlocksHttpStream("https:", camUrl);
  const hfovDeg = hfovForSource(liveKind, webcamHfovDeg, camHfovDeg);
  const leftSpatialOpts = useMemo(
    () => ({ hfovDeg: webcamHfovDeg, personHeightM, rejectPartial }),
    [webcamHfovDeg, personHeightM, rejectPartial],
  );
  const liveSpatialOpts = useMemo(
    () => ({ hfovDeg, personHeightM, rejectPartial }),
    [hfovDeg, personHeightM, rejectPartial],
  );
  const leftSpatialOptsRef = useRef(leftSpatialOpts);
  leftSpatialOptsRef.current = leftSpatialOpts;
  const liveSpatialOptsRef = useRef(liveSpatialOpts);
  liveSpatialOptsRef.current = liveSpatialOpts;
  const clipStateRef = useRef(clipState);
  clipStateRef.current = clipState;

  useEffect(() => {
    setPageHttps(window.location.protocol === "https:");
  }, []);

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
          const detail = err.message || "YOLOv8 未加载";
          setDetectError(
            /backend|wasm|Importing a module script/i.test(detail)
              ? "YOLO 本地 wasm 没起来。停掉终端里的 npm run dev，再开一次"
              : detail,
          );
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
      ...leftSpatialOptsRef.current,
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
          ...leftSpatialOpts,
        }),
      })),
    );
  }, [leftSpatialOpts]);

  const stopLive = useCallback(() => {
    camPollRef.current = false;
    if (camBlobRef.current) {
      URL.revokeObjectURL(camBlobRef.current);
      camBlobRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    const mjpeg = mjpegRef.current;
    if (mjpeg) {
      mjpeg.removeAttribute("src");
    }
    liveSmoothRef.current.reset();
    trackerRef.current.reset();
    setLiveKind("idle");
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
      camPollRef.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      const mjpeg = mjpegRef.current;
      if (mjpeg) {
        mjpeg.removeAttribute("src");
      }
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
        setLiveKind("idle");
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
      trackerRef.current.reset();
      liveSmoothRef.current.reset();
      setLiveKind("webcam");
      setCamBusy(false);
    },
    [],
  );

  const startEspCam = useCallback(() => {
    const url = camStillUrl(camUrl);
    setCamUrl(url);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    const mjpeg = mjpegRef.current;
    if (!mjpeg) {
      setCamError("画面还没准备好，再连一次");
      return;
    }
    camPollRef.current = true;
    setCamBusy(true);
    setCamError(null);
    trackerRef.current.reset();
    liveSmoothRef.current.reset();
    if (url.startsWith("/")) {
      mjpeg.removeAttribute("crossorigin");
    } else {
      mjpeg.crossOrigin = "anonymous";
    }
    const loop = async () => {
      while (camPollRef.current) {
        try {
          const obj = await pullCamStill(url);
          const img = mjpegRef.current;
          if (!img || !camPollRef.current) {
            URL.revokeObjectURL(obj);
            break;
          }
          const prev = camBlobRef.current;
          camBlobRef.current = obj;
          img.onload = () => {
            if (prev) {
              URL.revokeObjectURL(prev);
            }
            setCamBusy(false);
            setLiveKind("esp-cam");
            setCamError(null);
          };
          img.src = obj;
        } catch (err) {
          if (!camPollRef.current) {
            break;
          }
          if (liveKindRef.current !== "esp-cam") {
            setCamBusy(false);
            setLiveKind("idle");
            setCamError(
              pageHttps && !url.startsWith("/")
                ? "https 页面拦 http CAM。笔记本连上 flyvision-cam 后，用本地 http://localhost:3000/flyvision"
                : err instanceof Error
                  ? err.message
                  : "连不上 CAM。确认已加入 flyvision-cam，并用本地 localhost 打开工作台",
            );
            camPollRef.current = false;
            break;
          }
        }
        await new Promise((resolve) => window.setTimeout(resolve, 480));
      }
    };
    void loop();
  }, [camUrl, pageHttps]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (liveKind === "idle" || modelState !== "ready") {
      return undefined;
    }
    let timer = 0;
    let stopped = false;
    const tick = async () => {
      const frame = liveFrame(liveKindRef.current, videoRef.current, mjpegRef.current);
      if (stopped || !frame) {
        timer = window.setTimeout(() => void tick(), 360);
        return;
      }
      try {
        const aspect = frame.width / frame.height;
        const raw = await detectYolo(frame.source, frame.width, frame.height);
        const tracked = trackerRef.current.push(raw);
        const rest = tracked
          ? raw.filter((det) => boxIou(det.box, tracked.box) < 0.45)
          : raw;
        const dets = enrich(tracked ? [tracked, ...rest] : rest, {
          aspect,
          ...liveSpatialOptsRef.current,
        });
        const primary = tracked ? dets[0] : primarySubject(dets);
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
      trackerRef.current.reset();
    };
  }, [liveKind, modelState]);

  useEffect(() => {
    const left = primarySubject(leftDets);
    const right = primarySubject(rightDets);
    const leftPixels = leftPixelsRef.current;
    const frame = liveFrame(liveKind, videoRef.current, mjpegRef.current);
    if (!left || !right || !leftPixels || !frame) {
      setVerdict(null);
      stableRef.current = 0;
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.drawImage(frame.source, 0, 0);
    const livePixels = rgbaToRgb(
      ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
    );
    const current = extractFeatures(livePixels, right.box);
    const reference = extractFeatures(leftPixels, left.box);
    const labels =
      leftLabels && rightLabels ? labelSimilarity(rightLabels, leftLabels) : undefined;
    const geometry = judgeGeometry(left.box, right.box);
    let cancelled = false;
    const publish = (clipCosine?: number) => {
      if (cancelled) {
        return;
      }
      const match = scoreMatch(current, reference, 0.72, {
        clipCosine,
        labelSimilarity: labels,
      });
      const step = nextDecision(match.sceneMatch, geometry.geometryOk, stableRef.current, 4);
      stableRef.current = step.nextCount;
      const rightFix = "spatial" in right ? (right as RichDet).spatial : null;
      setVerdict({
        similarity: match.similarity,
        decision: step.decision,
        compositionOk: geometry.offsetOk,
        geometry,
        metersHint: rightFix ? formatMetersHint(rightFix) : null,
        leftLabel: zh(left.label),
        rightLabel: zh(right.label),
        clip: match.clipSimilarity,
      });
    };
    if (clipStateRef.current === "ready" && leftEmbedRef.current) {
      void embedClip(livePixels)
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
  }, [leftDets, rightDets, leftLabels, rightLabels, liveKind]);

  function snapLiveAsReference() {
    const frame = liveFrame(liveKind, videoRef.current, mjpegRef.current);
    if (!frame) {
      setDetectError("还没有实拍画面，先连接 CAM");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    ctx.drawImage(frame.source, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        return;
      }
      if (uploadUrl) {
        URL.revokeObjectURL(uploadUrl);
      }
      setUploadUrl(URL.createObjectURL(blob));
      setLeftDets([]);
      stableRef.current = 0;
      setDetectError(null);
    }, "image/jpeg", 0.92);
  }

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
  const statusText = go
    ? "可以拍"
    : verdict?.geometry?.summary ??
      (live ? "继续对齐" : "打开电脑摄像头，或贴 ESP32-CAM 推流地址");

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
                ? "YOLO · CLIP · 伺服"
                : "YOLOv8n · 占位伺服"
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
                <em>识别主体，对照构图和占位</em>
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
            <div className={`apple-media${live ? "" : " is-idle"}`}>
              <video ref={videoRef} muted playsInline hidden={liveKind !== "webcam"} />
              <img ref={mjpegRef} alt="" hidden={liveKind !== "esp-cam"} />
              <Boxes dets={rightDets} primary={rightPrimary} />
              {verdict?.geometry ? (
                <div className={`apple-cue${go ? " go" : ""}`}>{verdict.geometry.summary}</div>
              ) : live && modelState === "ready" && !rightDets.length ? (
                <div className="apple-cue is-wait">YOLO 在看…把人放进画面</div>
              ) : null}
            </div>
            {live ? null : (
              <div className="apple-idle">
                <button
                  className="apple-drop"
                  type="button"
                  disabled={camBusy}
                  onClick={() => void startCamera(cameraId || undefined)}
                >
                  <span>{camBusy ? "正在打开…" : "电脑摄像头"}</span>
                  <em>
                    {modelState === "loading"
                      ? "YOLO 还在本地加载，可先开摄像头"
                      : camError ?? "先看 YOLOv8 识别，再对参考图"}
                  </em>
                </button>
                <form
                  className="apple-cam-url"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startEspCam();
                  }}
                >
                  <span>ESP32-CAM</span>
                  <em>连上 flyvision-cam 后点连接。本地工作台走 /capture，YOLO 在这一页画框比对。</em>
                  <div className="apple-cam-url-row">
                    <input
                      type="url"
                      value={camUrl}
                      spellCheck={false}
                      aria-label="ESP32-CAM MJPEG 地址"
                      placeholder={LOCAL_CAM_CAPTURE_URL}
                      onChange={(event) => setCamUrl(event.target.value)}
                    />
                    <button type="submit" disabled={camBusy}>
                      {camBusy ? "连接中" : "连接"}
                    </button>
                  </div>
                  {mixedCam ? (
                    <em>
                      当前是 https，浏览器会拦 CAM 的 http 流。笔记本连上板子后用本地
                      localhost 打开工作台。
                    </em>
                  ) : null}
                </form>
              </div>
            )}
            {live && camError ? <p className="apple-cam-err">{camError}</p> : null}
          </div>
          <div className="apple-pills">
            {live ? (
              <>
                <button type="button" onClick={stopLive}>
                  关闭
                </button>
                {liveKind === "webcam" && cameras.length > 1 ? (
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
                {liveKind === "esp-cam" ? (
                  <span className="apple-pill">
                    CAM
                    <em>{camUrl}</em>
                  </span>
                ) : null}
                <button type="button" disabled={!live} onClick={snapLiveAsReference}>
                  把这帧当参考
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={camBusy}
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
                  <em>{pillCue(det)}</em>
                </span>
              ))
            ) : (
              <p className="apple-muted">
                {live
                  ? "画面里还没有主体"
                  : camError ?? "电脑摄像头，或 ESP32-CAM 推流"}
              </p>
            )}
          </div>
        </section>
      </div>

      <footer className="apple-meter">
        <div className={`apple-status${go ? " go" : ""}`}>{statusText}</div>
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
            <dt>占位 / 朝向</dt>
            <dd>
              {verdict?.geometry
                ? `${verdict.geometry.summary}${verdict.geometry.geometryOk ? " · 在带内" : ""}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt>针孔粗估</dt>
            <dd>{verdict?.metersHint ?? "—"}</dd>
          </div>
        </dl>
        <div className="apple-cal">
          <label>
            <span>电脑视场 {webcamHfovDeg}°</span>
            <input
              type="range"
              min={50}
              max={90}
              step={1}
              value={webcamHfovDeg}
              aria-label="电脑摄像头水平视场"
              onChange={(event) => setWebcamHfovDeg(Number(event.target.value))}
            />
          </label>
          <label>
            <span>CAM 视场 {camHfovDeg}°（OV2640）</span>
            <input
              type="range"
              min={50}
              max={90}
              step={1}
              value={camHfovDeg}
              aria-label="ESP32-CAM 水平视场"
              onChange={(event) => setCamHfovDeg(Number(event.target.value))}
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
            截断框不计针孔粗估
          </label>
        </div>
        <p className="apple-muted apple-hint">
          可以拍 = CLIP 像参考 + 框占画面比例在带内 + 偏左偏右偏上偏下在带内。针孔米数只是旁注，不是
          RTK，也不开快门。
        </p>
        {detectError ? <p className="apple-error">{detectError}</p> : null}
      </footer>
    </div>
  );
}

function liveFrame(
  kind: LiveSource,
  video: HTMLVideoElement | null,
  mjpeg: HTMLImageElement | null,
): { source: CanvasImageSource; width: number; height: number } | null {
  if (kind === "webcam") {
    if (!video?.videoWidth) {
      return null;
    }
    return { source: video, width: video.videoWidth, height: video.videoHeight };
  }
  if (kind === "esp-cam") {
    if (!mjpeg?.naturalWidth) {
      return null;
    }
    return { source: mjpeg, width: mjpeg.naturalWidth, height: mjpeg.naturalHeight };
  }
  return null;
}

function pillCue(det: RichDet): string {
  const crop = det.spatial ? cropLabel(det.spatial.crop) : "";
  const heading = det.spatial ? headingLabel(det.spatial.heading) : "";
  const bits = [crop, heading].filter(Boolean);
  return bits.length ? bits.join(" · ") : `${(det.score * 100).toFixed(0)}%`;
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
  return `${name}${crop ? `  ${crop}` : ""}  ${headingLabel(det.spatial.heading)}`;
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
            {det.spatial ? `  ${headingLabel(det.spatial.heading)}` : ""}
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
            <em>{pillCue(det)}</em>
          </span>
        ))
      ) : (
        <p className="apple-muted">{empty}</p>
      )}
    </div>
  );
}
