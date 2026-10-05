/** Browser-only 24 fps stills from an uploaded video. */

import { VIDEO_FPS, VIDEO_MAX_FRAMES } from "./flyvision-sequence";

export async function extractVideoFrames(
  file: File,
  fps = VIDEO_FPS,
  maxFrames = VIDEO_MAX_FRAMES,
): Promise<Blob[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    await waitMeta(video);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration <= 0) {
      throw new Error("视频读不出时长");
    }
    const step = 1 / Math.max(1, fps);
    const count = Math.min(maxFrames, Math.max(1, Math.floor(duration * fps)));
    const canvas = document.createElement("canvas");
    const frames: Blob[] = [];
    for (let i = 0; i < count; i += 1) {
      await seek(video, Math.min(duration - 0.001, i * step));
      const width = video.videoWidth || 320;
      const height = video.videoHeight || 240;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("canvas");
      }
      ctx.drawImage(video, 0, 0, width, height);
      frames.push(await canvasBlob(canvas));
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function recordFrameVideo(frames: Blob[], fps = VIDEO_FPS): Promise<Blob> {
  if (!frames.length) {
    throw new Error("还没有保存的帧");
  }
  const images = await Promise.all(frames.map(blobImage));
  const width = images[0].naturalWidth || 640;
  const height = images[0].naturalHeight || 480;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("canvas");
  }
  const stream = canvas.captureStream(fps);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
    ? "video/webm;codecs=vp9"
    : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) {
      chunks.push(event.data);
    }
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    recorder.onerror = () => reject(new Error("导出视频失败"));
  });
  recorder.start();
  const interval = 1000 / fps;
  for (const image of images) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    await sleep(interval);
  }
  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  return done;
}

function waitMeta(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("视频打不开"));
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    video.onseeked = () => resolve();
    video.onerror = () => reject(new Error("视频定位失败"));
    video.currentTime = time;
  });
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("抽帧失败"));
        return;
      }
      resolve(blob);
    }, "image/jpeg", 0.88);
  });
}

function blobImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(image.src);
      resolve(image);
    };
    image.onerror = () => reject(new Error("保存帧读不出"));
    image.src = URL.createObjectURL(blob);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
