"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlyvisionCropEditor } from "@/components/FlyvisionCropEditor";
import { getClipSession } from "@/lib/clip-embed";
import { imageAspect } from "@/lib/flyvision-crop";
import { extractVideoFrames, recordFrameVideo } from "@/lib/flyvision-frames";
import {
  appendMonitorLine,
  formatMonitorTime,
  shouldThrottle,
  type MonitorLevel,
  type MonitorLine,
} from "@/lib/flyvision-monitor";
import {
  STABLE_PASS_FRAMES,
  VIDEO_FPS,
  VIDEO_MAX_FRAMES,
  droneCommand,
  matchFailText,
  pairObjects,
  sceneObjects,
  shotName,
  type DroneCommand,
  type SceneObject,
  type SequenceMatch,
} from "@/lib/flyvision-sequence";
import {
  camStillUrl,
  DEFAULT_ESP_CAM_CAPTURE_URL,
  ESP32CAM_HFOV_DEG,
  LOCAL_CAM_CAPTURE_URL,
  estimateSpatial,
  hfovForSource,
  httpsBlocksHttpStream,
  SpatialSmoother,
  WEBCAM_HFOV_DEG,
  type LiveSource,
  type SpatialFix,
  type SpatialOptions,
} from "@/lib/spatial";
import {
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

type RefShot = {
  name: string;
  url: string;
  objects: SceneObject[];
  dets: RichDet[];
  aspect: number;
};

type PendingStill = {
  url: string;
  replaceIndex?: number;
};

type SavedTake = {
  name: string;
  url: string;
  refName: string;
  blob: Blob;
};

type UploadKind = "image" | "video";
type LiveView = "video" | "frame";

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
  throw lastErr instanceof Error ? lastErr : new Error("连不上开发板");
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
  return err instanceof Error ? err.message : "没有摄像头";
}

export function FlyvisionWorkbench() {
  const [modelState, setModelState] = useState<"loading" | "ready" | "error">("loading");
  const [uploadKind, setUploadKind] = useState<UploadKind>("image");
  const [extracting, setExtracting] = useState("");
  const [shots, setShots] = useState<RefShot[]>([]);
  const [shotIndex, setShotIndex] = useState(0);
  const [sourceKind, setSourceKind] = useState<UploadKind>("image");
  const [webcamHfovDeg, setWebcamHfovDeg] = useState(WEBCAM_HFOV_DEG);
  const [camHfovDeg, setCamHfovDeg] = useState(ESP32CAM_HFOV_DEG);
  const [personHeightM, setPersonHeightM] = useState(1.7);
  const [camError, setCamError] = useState<string | null>(null);
  const [liveKind, setLiveKind] = useState<LiveSource>("idle");
  const [liveView, setLiveView] = useState<LiveView>("video");
  const [frameStillUrl, setFrameStillUrl] = useState<string | null>(null);
  const [frameDets, setFrameDets] = useState<RichDet[]>([]);
  const [logs, setLogs] = useState<MonitorLine[]>([]);
  const [camBusy, setCamBusy] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [camUrl, setCamUrl] = useState(LOCAL_CAM_CAPTURE_URL);
  const [pageHttps, setPageHttps] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [rightDets, setRightDets] = useState<RichDet[]>([]);
  const [match, setMatch] = useState<SequenceMatch | null>(null);
  const [command, setCommand] = useState<DroneCommand | null>(null);
  const [passed, setPassed] = useState(false);
  const [saved, setSaved] = useState<SavedTake[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(true);
  const [pendingStills, setPendingStills] = useState<PendingStill[]>([]);
  const [editing, setEditing] = useState<PendingStill | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mjpegRef = useRef<HTMLImageElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackerRef = useRef(new SubjectTracker());
  const liveSmoothRef = useRef(new SpatialSmoother(5));
  const liveKindRef = useRef(liveKind);
  const camPollRef = useRef(false);
  const camBlobRef = useRef<string | null>(null);
  const frameStillRef = useRef<string | null>(null);
  const passCountRef = useRef(0);
  const savingRef = useRef(false);
  const logIdRef = useRef(0);
  const logThrottleRef = useRef<Record<string, number>>({});
  const logEndRef = useRef<HTMLDivElement | null>(null);
  liveKindRef.current = liveKind;
  const live = liveKind !== "idle";
  const mixedCam = pageHttps && httpsBlocksHttpStream("https:", camUrl);
  const hfovDeg = hfovForSource(liveKind, webcamHfovDeg, camHfovDeg);
  const liveSpatialOpts = useMemo(
    () => ({ hfovDeg, personHeightM, rejectPartial: true }),
    [hfovDeg, personHeightM],
  );
  const liveSpatialOptsRef = useRef(liveSpatialOpts);
  liveSpatialOptsRef.current = liveSpatialOpts;
  const current = shots[shotIndex] ?? null;
  const cropAspect = shots[0]?.aspect ?? 4 / 3;
  const leftPrimary = current ? (primarySubject(current.dets) as RichDet | null) : null;
  const rightPrimary = primarySubject(rightDets) as RichDet | null;
  const framePrimary = primarySubject(frameDets) as RichDet | null;
  const rightObjects = useMemo(() => sceneObjects(rightDets), [rightDets]);

  const pushLog = useCallback((level: MonitorLevel, msg: string, throttleMs = 0) => {
    const now = Date.now();
    const key = `${level}:${msg}`;
    if (throttleMs > 0 && shouldThrottle(logThrottleRef.current[key], now, throttleMs)) {
      return;
    }
    if (throttleMs > 0) {
      logThrottleRef.current[key] = now;
    }
    const line: MonitorLine = { id: ++logIdRef.current, t: now, level, msg };
    setLogs((list) => appendMonitorLine(list, line));
    if (level === "ERR") {
      setDetectError(msg);
    }
  }, []);

  useEffect(() => {
    setPageHttps(window.location.protocol === "https:");
    pushLog("INFO", "监视器已开。失败会留在这里，不会只闪一下");
  }, [pushLog]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [logs]);

  useEffect(() => {
    let cancelled = false;
    void getYoloSession()
      .then(() => {
        if (!cancelled) {
          setModelState("ready");
          pushLog("OK", "本机 YOLO 就绪");
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setModelState("error");
          pushLog("ERR", err.message || "本机 YOLO 没起来");
        }
      });
    void getClipSession().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pushLog]);

  const analyzeUrl = useCallback(async (url: string, name: string): Promise<RefShot> => {
    const image = await loadHtmlImage(url);
    const dets = enrich(
      await detectYolo(image, image.naturalWidth, image.naturalHeight),
      { aspect: image.naturalWidth / image.naturalHeight, hfovDeg: webcamHfovDeg, personHeightM },
    );
    return {
      name,
      url,
      dets,
      objects: sceneObjects(dets),
      aspect: imageAspect(image.naturalWidth, image.naturalHeight),
    };
  }, [personHeightM, webcamHfovDeg]);

  const addImageFiles = useCallback((files: File[]) => {
    const queued = files
      .filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name))
      .map((file) => ({ url: URL.createObjectURL(file) }));
    if (!queued.length) {
      pushLog("ERR", "没有可用的图片");
      return;
    }
    setSourceKind("image");
    setPendingStills(queued.slice(1));
    setEditing(queued[0]);
    setDetectError(null);
  }, [pushLog]);

  const finishEditing = useCallback(
    async (sourceUrl: string, replaceIndex?: number) => {
      setExtracting("识别参考图…");
      try {
        if (replaceIndex != null && shots[replaceIndex]) {
          const prev = shots[replaceIndex];
          const next = await analyzeUrl(sourceUrl, prev.name);
          if (prev.url !== sourceUrl) {
            URL.revokeObjectURL(prev.url);
          }
          setShots((list) => list.map((shot, index) => (index === replaceIndex ? next : shot)));
          setShotIndex(replaceIndex);
        } else {
          const shot = await analyzeUrl(sourceUrl, shotName("a", shots.length));
          setShots((list) => [...list, shot]);
          setShotIndex(shots.length);
        }
        setDetectError(null);
        pushLog("OK", replaceIndex != null ? `重裁 ${shots[replaceIndex]?.name ?? "参考图"} 已识别` : `${shotName("a", shots.length)} 已识别`);
      } catch (err) {
        pushLog("ERR", err instanceof Error ? err.message : "参考图失败");
        if (sourceUrl.startsWith("blob:")) {
          URL.revokeObjectURL(sourceUrl);
        }
      } finally {
        setExtracting("");
      }
    },
    [analyzeUrl, shots, pushLog],
  );

  const advanceQueue = useCallback(() => {
    setPendingStills((queue) => {
      const [next, ...rest] = queue;
      setEditing(next ?? null);
      return rest;
    });
  }, []);

  async function confirmCrop(blob: Blob) {
    if (!editing) {
      return;
    }
    const cropped = URL.createObjectURL(blob);
    if (editing.replaceIndex == null) {
      URL.revokeObjectURL(editing.url);
    }
    const replaceIndex = editing.replaceIndex;
    setEditing(null);
    await finishEditing(cropped, replaceIndex);
    advanceQueue();
  }

  async function skipCrop() {
    if (!editing) {
      return;
    }
    const { url, replaceIndex } = editing;
    setEditing(null);
    if (replaceIndex == null) {
      await finishEditing(url);
    }
    advanceQueue();
  }

  function cancelCrop() {
    if (!editing) {
      return;
    }
    if (editing.replaceIndex == null) {
      URL.revokeObjectURL(editing.url);
      pendingStills.forEach((item) => URL.revokeObjectURL(item.url));
    }
    setPendingStills([]);
    setEditing(null);
  }

  const addVideoFile = useCallback(
    async (file: File) => {
      setSourceKind("video");
      setExtracting(`视频抽帧 ${VIDEO_FPS} fps…`);
      try {
        const frames = await extractVideoFrames(file, VIDEO_FPS, VIDEO_MAX_FRAMES);
        const created: RefShot[] = [];
        for (const [index, blob] of frames.entries()) {
          setExtracting(`YOLO ${index + 1}/${frames.length}`);
          const url = URL.createObjectURL(blob);
          created.push(await analyzeUrl(url, shotName("a", index)));
        }
        shots.forEach((shot) => URL.revokeObjectURL(shot.url));
        setShots(created);
        setShotIndex(0);
        setSaved((prev) => {
          prev.forEach((item) => URL.revokeObjectURL(item.url));
          return [];
        });
        if (frames.length >= VIDEO_MAX_FRAMES) {
          pushLog("INFO", `视频按 ${VIDEO_FPS} fps 取了前 ${frames.length} 帧`);
        } else {
          pushLog("OK", `视频抽出 ${frames.length} 帧`);
        }
        setDetectError(null);
      } catch (err) {
        pushLog("ERR", err instanceof Error ? err.message : "视频抽帧失败");
      } finally {
        setExtracting("");
      }
    },
    [analyzeUrl, shots, pushLog],
  );

  const stopLive = useCallback(() => {
    pushLog("INFO", "关闭摄像头");
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
    setMatch(null);
    setCommand(null);
    setPassed(false);
    setCamBusy(false);
  }, [pushLog]);

  const startCamera = useCallback(async (deviceId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const text = "这个浏览器不能开摄像头，换 Chrome 或 Safari";
      setCamError(text);
      pushLog("ERR", text);
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
          { audio: false, video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } } },
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
      const text = camErrorText(lastErr);
      setCamError(text);
      pushLog("ERR", text);
      return;
    }
    streamRef.current = stream;
    if (video) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // layout can complete on the next tick
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
    passCountRef.current = 0;
    setLiveView("video");
    setLiveKind("webcam");
    setCamBusy(false);
    pushLog("OK", "电脑摄像头已开");
  }, [pushLog]);

  const startEspCam = useCallback(() => {
    const url = camStillUrl(camUrl || LOCAL_CAM_CAPTURE_URL);
    setCamUrl(url);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    const mjpeg = mjpegRef.current;
    if (!mjpeg) {
      const text = "画面还没准备好，再点一次开发板";
      setCamError(text);
      pushLog("ERR", text);
      return;
    }
    camPollRef.current = true;
    setCamBusy(true);
    setCamError(null);
    trackerRef.current.reset();
    liveSmoothRef.current.reset();
    passCountRef.current = 0;
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
            setCamError(null);
            if (liveKindRef.current !== "esp-cam") {
              liveKindRef.current = "esp-cam";
              setLiveView("video");
              setLiveKind("esp-cam");
              pushLog("OK", "开发板已接入");
            }
          };
          img.src = obj;
        } catch (err) {
          if (!camPollRef.current) {
            break;
          }
          if (liveKindRef.current !== "esp-cam") {
            setCamBusy(false);
            setLiveKind("idle");
            const text =
              pageHttps && !url.startsWith("/")
                ? "https 拦开发板。用 http://localhost:3000/flyvision，并加入 flyvision-cam"
                : err instanceof Error
                  ? err.message
                  : "连不上开发板。加入 flyvision-cam，再用本机 localhost";
            setCamError(text);
            pushLog("ERR", text);
            camPollRef.current = false;
            break;
          }
          pushLog("ERR", err instanceof Error ? err.message : "开发板掉帧", 2000);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 480));
      }
    };
    void loop();
  }, [camUrl, pageHttps, pushLog]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (frameStillRef.current) {
        URL.revokeObjectURL(frameStillRef.current);
        frameStillRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (liveKind === "idle" || modelState !== "ready") {
      return undefined;
    }
    let timer = 0;
    let stopped = false;
    let blank = 0;
    const tick = async () => {
      const frame = liveFrame(liveKindRef.current, videoRef.current, mjpegRef.current);
      if (stopped) {
        return;
      }
      if (!frame) {
        blank += 1;
        if (blank === 10) {
          pushLog(
            "ERR",
            liveKindRef.current === "webcam" ? "电脑摄像头没有画面，出不了帧" : "开发板没有 JPEG，出不了帧",
          );
        }
        timer = window.setTimeout(() => void tick(), 360);
        return;
      }
      blank = 0;
      try {
        const raw = await detectYolo(frame.source, frame.width, frame.height);
        const tracked = trackerRef.current.push(raw);
        const rest = tracked ? raw.filter((det) => det !== tracked) : raw;
        const dets = enrich(tracked ? [tracked, ...rest] : rest, {
          aspect: frame.width / frame.height,
          ...liveSpatialOptsRef.current,
        });
        if (stopped) {
          return;
        }
        setRightDets(dets);
        if (dets.length === 0) {
          pushLog("ERR", "这一帧 YOLO 没有检出 ≥1% 物体", 2000);
        }
        const still = await snapshotLiveFrame(frame);
        if (stopped) {
          if (still) {
            URL.revokeObjectURL(still);
          }
          return;
        }
        if (!still) {
          pushLog("ERR", "抓帧失败，这一帧没法冻结", 2000);
        } else {
          if (frameStillRef.current) {
            URL.revokeObjectURL(frameStillRef.current);
          }
          frameStillRef.current = still;
          setFrameStillUrl(still);
          setFrameDets(dets);
        }
      } catch (err) {
        if (!stopped) {
          pushLog("ERR", err instanceof Error ? err.message : "实拍识别失败");
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
  }, [liveKind, modelState, pushLog]);

  useEffect(() => {
    if (!current || !live) {
      setMatch(null);
      setCommand(null);
      setPassed(false);
      passCountRef.current = 0;
      return;
    }
    const next = pairObjects(current.objects, rightObjects);
    setMatch(next);
    const frame = liveFrame(liveKind, videoRef.current, mjpegRef.current);
    const cmd = droneCommand(current.objects, rightObjects, {
      distanceM: rightPrimary?.spatial?.distanceM,
      hfovDeg,
      aspect: frame ? frame.width / frame.height : 4 / 3,
    });
    setCommand(next.ok ? null : cmd);
    if (next.ok) {
      passCountRef.current += 1;
      const stable = passCountRef.current >= STABLE_PASS_FRAMES;
      setPassed(stable);
      if (passCountRef.current === STABLE_PASS_FRAMES) {
        pushLog("OK", `${current.name} 对齐通过`);
      }
    } else {
      passCountRef.current = 0;
      setPassed(false);
      const fail = matchFailText(next);
      pushLog("ERR", `${current.name} 比对失败${fail ? ` ${fail}` : ""}`, 1600);
    }
  }, [current, rightObjects, live, liveKind, hfovDeg, rightPrimary, pushLog]);

  useEffect(() => {
    if (!passed || !current || savingRef.current) {
      return;
    }
    if (saved.some((item) => item.refName === current.name)) {
      return;
    }
    const frame = liveFrame(liveKind, videoRef.current, mjpegRef.current);
    if (!frame) {
      return;
    }
    savingRef.current = true;
    const canvas = document.createElement("canvas");
    canvas.width = frame.width;
    canvas.height = frame.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      savingRef.current = false;
      return;
    }
    ctx.drawImage(frame.source, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        savingRef.current = false;
        return;
      }
      const take: SavedTake = {
        name: shotName("b", saved.length),
        url: URL.createObjectURL(blob),
        refName: current.name,
        blob,
      };
      setSaved((prev) => [...prev, take]);
      setGalleryOpen(true);
      if (shotIndex + 1 < shots.length) {
        setShotIndex(shotIndex + 1);
        passCountRef.current = 0;
        setPassed(false);
      }
      savingRef.current = false;
    }, "image/jpeg", 0.92);
  }, [passed, current, liveKind, saved, shotIndex, shots.length]);

  async function onPick(files: FileList | File[] | null) {
    if (!files?.length) {
      return;
    }
    const list = Array.from(files);
    if (uploadKind === "video") {
      const video = list.find((file) => file.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(file.name));
      if (!video) {
        pushLog("ERR", "选一个视频");
        return;
      }
      await addVideoFile(video);
      return;
    }
    await addImageFiles(list.filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(file.name)));
  }

  async function exportPack() {
    if (!saved.length) {
      pushLog("ERR", "还没有保存的 b 帧");
      return;
    }
    if (sourceKind === "video") {
      setExtracting("打包视频…");
      try {
        const video = await recordFrameVideo(saved.map((item) => item.blob), VIDEO_FPS);
        downloadBlob(video, "flyvision-b.webm");
        pushLog("OK", "已打包视频 flyvision-b.webm");
      } catch (err) {
        pushLog("ERR", err instanceof Error ? err.message : "导出视频失败");
      } finally {
        setExtracting("");
      }
      return;
    }
    saved.forEach((item) => downloadBlob(item.blob, `${item.name}.jpg`));
    pushLog("OK", `已打包 ${saved.length} 张 b 帧`);
  }

  const done = shots.length > 0 && saved.length >= shots.length;
  const statusText = !shots.length
    ? "左边上传图片或视频，右边选电脑或开发板"
    : !live
      ? `对齐 ${current?.name ?? "a1"}：点开发板或电脑摄像头`
      : passed
        ? `${current?.name} 通过，已存 ${shotName("b", Math.max(0, saved.length - 1))}`
        : command?.cues.join(" · ") || "继续对齐";

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
        <span className={`apple-dot${modelState === "ready" ? " ready" : ""}${modelState === "error" ? " bad" : ""}`}>
          <i />
          {modelState === "loading" ? "YOLOv8n 加载中" : modelState === "ready" ? "本机 YOLO" : "模型失败"}
        </span>
      </header>

      <div className="apple-split">
        <section className="apple-pane">
          <h2>参考 a1…an</h2>
          <div className="apple-tabs">
            <button type="button" className={uploadKind === "image" ? "is-on" : ""} onClick={() => setUploadKind("image")}>
              图片
            </button>
            <button type="button" className={uploadKind === "video" ? "is-on" : ""} onClick={() => setUploadKind("video")}>
              视频 · {VIDEO_FPS} fps
            </button>
          </div>
          <div
            className="apple-well"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void onPick(event.dataTransfer.files);
            }}
          >
            {editing ? (
              <FlyvisionCropEditor
                src={editing.url}
                title={editing.replaceIndex != null ? `重裁 ${shots[editing.replaceIndex]?.name ?? ""}` : `裁切 a${shots.length + 1}`}
                defaultAspect={cropAspect}
                onConfirm={(blob) => void confirmCrop(blob)}
                onSkip={() => void skipCrop()}
                onCancel={cancelCrop}
              />
            ) : current ? (
              <div className="apple-media">
                <img src={current.url} alt={current.name} />
                <Boxes dets={current.dets} primary={leftPrimary} />
                <div className="apple-shot-tag">{current.name}</div>
              </div>
            ) : (
              <button className="apple-drop" type="button" onClick={() => fileRef.current?.click()} disabled={Boolean(extracting)}>
                <span>{extracting || (uploadKind === "video" ? "上传视频" : "上传图片")}</span>
                <em>
                  {uploadKind === "video"
                    ? `自动拆成 ${VIDEO_FPS} 帧/秒，最多 ${VIDEO_MAX_FRAMES} 帧`
                    : "比例不同先裁切，确认后再比对"}
                </em>
              </button>
            )}
          </div>
          <div className="apple-seq">
            <button type="button" onClick={() => fileRef.current?.click()}>
              {shots.length ? (uploadKind === "video" ? "换视频" : "加图片") : "上传"}
            </button>
            {current && !editing ? (
              <button
                type="button"
                onClick={() => setEditing({ url: current.url, replaceIndex: shotIndex })}
              >
                裁切
              </button>
            ) : null}
            {shots.map((shot, index) => (
              <button
                key={shot.name}
                type="button"
                className={`apple-seq-item${index === shotIndex ? " is-on" : ""}${saved.some((item) => item.refName === shot.name) ? " is-done" : ""}`}
                onClick={() => setShotIndex(index)}
              >
                {shot.name}
              </button>
            ))}
            <p className="apple-muted">
              {current
                ? `${current.name} · ${current.objects.length} 个物体 ≥1%`
                : "还没有参考序列"}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={uploadKind === "video" ? "video/*" : "image/*"}
            multiple={uploadKind === "image"}
            hidden
            onChange={(event) => {
              void onPick(event.target.files);
              event.target.value = "";
            }}
          />
        </section>

        <section className="apple-pane">
          <h2>实拍 b1…bn</h2>
          <div className="apple-tabs">
            <button type="button" className={liveView === "video" ? "is-on" : ""} onClick={() => setLiveView("video")}>
              视频
            </button>
            <button
              type="button"
              className={liveView === "frame" ? "is-on" : ""}
              onClick={() => {
                setLiveView("frame");
                if (frameStillUrl) {
                  return;
                }
                if (modelState === "error") {
                  pushLog("ERR", "本机 YOLO 没起来，出不了帧");
                  return;
                }
                if (modelState === "loading") {
                  pushLog("ERR", "YOLO 还在加载，还没有帧");
                  return;
                }
                if (!live) {
                  pushLog("ERR", "没有接入摄像头，没有帧");
                  return;
                }
                pushLog("ERR", "摄像头已开，但还没抓到 YOLO 帧");
              }}
            >
              帧 · YOLO
            </button>
          </div>
          <div className="apple-well">
            <div className={`apple-media${live && liveView === "video" ? "" : " is-idle"}`}>
              <video ref={videoRef} muted playsInline hidden={liveKind !== "webcam"} />
              <img ref={mjpegRef} alt="" hidden={liveKind !== "esp-cam"} />
              {live && liveView === "video" && passed ? <div className="apple-ok">✓ {current?.name} 对齐</div> : null}
              {live && liveView === "video" && !passed && command ? <div className="apple-cue">{command.cues.join(" · ")}</div> : null}
            </div>
            {liveView === "frame" ? (
              frameStillUrl ? (
                <div className="apple-media">
                  <img src={frameStillUrl} alt="YOLO 帧" />
                  <Boxes dets={frameDets} primary={framePrimary} />
                  <div className="apple-shot-tag">帧 · YOLO</div>
                  {passed ? <div className="apple-ok">✓ {current?.name} 对齐</div> : null}
                  {!passed && live && command ? <div className="apple-cue">{command.cues.join(" · ")}</div> : null}
                </div>
              ) : (
                <div className="apple-frame-empty">
                  <span>还没有 YOLO 帧</span>
                  <em>
                    {modelState === "error"
                      ? "本机 YOLO 没起来，失败已写进下面的监视器"
                      : modelState === "loading"
                        ? "YOLO 还在加载"
                        : live
                          ? "摄像头已开，正在抓第一帧。失败会报错"
                          : "先切回视频，接入电脑或开发板"}
                  </em>
                </div>
              )
            ) : live ? null : (
              <div className="apple-idle apple-idle-grid">
                <button className="apple-drop" type="button" disabled={camBusy} onClick={() => void startCamera(cameraId || undefined)}>
                  <span>{camBusy ? "正在打开…" : "电脑摄像头"}</span>
                  <em>笔记本自带摄像头，先看构图</em>
                </button>
                <button className="apple-drop" type="button" disabled={camBusy} onClick={() => startEspCam()}>
                  <span>{camBusy ? "连接开发板…" : "开发板摄像头"}</span>
                  <em>加入 flyvision-cam 后点这里。走 /capture 静帧</em>
                </button>
                <form
                  className="apple-cam-url"
                  onSubmit={(event) => {
                    event.preventDefault();
                    startEspCam();
                  }}
                >
                  <span>开发板地址</span>
                  <em>默认同源 /flyvision/cam/capture。不要开 Vercel。</em>
                  <div className="apple-cam-url-row">
                    <input
                      type="text"
                      value={camUrl}
                      spellCheck={false}
                      aria-label="开发板 capture 地址"
                      onChange={(event) => setCamUrl(event.target.value)}
                    />
                    <button type="submit" disabled={camBusy}>
                      接入开发板
                    </button>
                  </div>
                  {mixedCam ? <em>当前是 https，会拦开发板。用 localhost。</em> : null}
                </form>
              </div>
            )}
            {live && camError ? <p className="apple-cam-err">{camError}</p> : null}
          </div>
          <div className="apple-pills">
            {live ? (
              <>
                <button type="button" onClick={stopLive}>关闭</button>
                {liveKind === "webcam" && cameras.length > 1 ? (
                  <select className="apple-cam-select" value={cameraId} onChange={(event) => void startCamera(event.target.value)}>
                    {cameras.map((item, index) => (
                      <option key={item.deviceId || String(index)} value={item.deviceId}>
                        {item.label || `摄像头 ${index + 1}`}
                      </option>
                    ))}
                  </select>
                ) : null}
                <span className="apple-pill">{liveKind === "esp-cam" ? "开发板" : "电脑"}</span>
              </>
            ) : (
              <p className="apple-muted">{camError ?? "两个入口：电脑，或开发板"}</p>
            )}
            {rightObjects.map((item, index) => (
              <span className="apple-pill" key={`${item.label}-${index}`}>
                {zh(item.label)}
                <em>
                  {item.xyxy.x1.toFixed(2)},{item.xyxy.y1.toFixed(2)}–{item.xyxy.x2.toFixed(2)},{item.xyxy.y2.toFixed(2)}
                </em>
              </span>
            ))}
          </div>
        </section>
      </div>

      <footer className="apple-meter">
        <div className={`apple-status${passed || done ? " go" : ""}`}>{statusText}</div>
        <dl>
          <div>
            <dt>当前</dt>
            <dd>{current ? `${current.name} → ${shotName("b", shotIndex)}` : "—"}</dd>
          </div>
          <div>
            <dt>角点相对误差</dt>
            <dd>{match ? `${(match.maxAbsRel * 100).toFixed(1)}% / 10%` : "—"}</dd>
          </div>
          <div>
            <dt>角点方差</dt>
            <dd>{match && Number.isFinite(match.variance) ? match.variance.toFixed(4) : "—"}</dd>
          </div>
          <div>
            <dt>无人机指令</dt>
            <dd>{passed ? "保持" : command?.text ?? "—"}</dd>
          </div>
        </dl>
        <div className="apple-cal">
          <label>
            <span>电脑视场 {webcamHfovDeg}°</span>
            <input type="range" min={50} max={90} value={webcamHfovDeg} onChange={(event) => setWebcamHfovDeg(Number(event.target.value))} />
          </label>
          <label>
            <span>开发板视场 {camHfovDeg}°</span>
            <input type="range" min={50} max={90} value={camHfovDeg} onChange={(event) => setCamHfovDeg(Number(event.target.value))} />
          </label>
          <label>
            <span>身高 {personHeightM.toFixed(2)} m</span>
            <input type="range" min={150} max={190} value={Math.round(personHeightM * 100)} onChange={(event) => setPersonHeightM(Number(event.target.value) / 100)} />
          </label>
          <button type="button" className="apple-pack" disabled={!saved.length || Boolean(extracting)} onClick={() => void exportPack()}>
            {extracting || (sourceKind === "video" ? "打包成视频" : "打包成图片")}
          </button>
        </div>
        <p className="apple-muted apple-hint">
          通过条件：每个 ≥1% 物体的 x1/y1/x2/y2 相对参考框误差 ≤10%，且角点相对误差方差 ≤0.0025（约标准差 5%，说明不是一个物体对、另一个拧着）。连过 3 帧才打勾。米/度是视觉伺服，不是 RTK。
        </p>
        <section className="apple-monitor" aria-label="串口监视器">
          <div className="apple-monitor-bar">
            <strong>串口监视器</strong>
            <span title={detectError ?? ""}>{logs.filter((line) => line.level === "ERR").length} ERR</span>
            <button
              type="button"
              onClick={() => {
                setLogs([]);
                setDetectError(null);
                logThrottleRef.current = {};
              }}
            >
              清空
            </button>
          </div>
          <div className="apple-monitor-log" role="log">
            {logs.length ? (
              logs.map((line) => (
                <div key={line.id} className={`apple-monitor-line is-${line.level}`}>
                  <time>[{formatMonitorTime(line.t)}]</time>
                  <b>{line.level}</b>
                  <span>{line.msg}</span>
                </div>
              ))
            ) : (
              <div className="apple-monitor-line is-INFO">还没有日志</div>
            )}
            <div ref={logEndRef} />
          </div>
        </section>
        <aside className={`apple-gallery${galleryOpen ? " is-open" : ""}`}>
          <button type="button" onClick={() => setGalleryOpen((open) => !open)}>
            已存 {saved.length}/{shots.length || 0}
          </button>
          {galleryOpen ? (
            <div className="apple-gallery-row">
              {saved.length ? (
                saved.map((item) => (
                  <figure key={item.name}>
                    <img src={item.url} alt={item.name} />
                    <figcaption>
                      {item.name}
                      <em>{item.refName}</em>
                    </figcaption>
                  </figure>
                ))
              ) : (
                <p className="apple-muted">对齐成功的帧会出现在这里</p>
              )}
            </div>
          ) : null}
        </aside>
      </footer>
    </div>
  );
}

function snapshotLiveFrame(
  frame: { source: CanvasImageSource; width: number; height: number },
): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(frame.source, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob || blob.size < 200) {
          resolve(null);
          return;
        }
        resolve(URL.createObjectURL(blob));
      }, "image/jpeg", 0.88);
    } catch {
      resolve(null);
    }
  });
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

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function Boxes({ dets, primary }: { dets: RichDet[]; primary: RichDet | null }) {
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
          <b>{zh(det.label)}</b>
        </span>
      ))}
    </>
  );
}
