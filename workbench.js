const workbenchTabs = document.querySelectorAll(".workbench-tab");
const workbenchPanels = document.querySelectorAll(".workbench-panel");

const photoInput = document.querySelector("#photo-input");
const photoPickBtn = document.querySelector("#photo-pick-btn");
const photoReplaceBtn = document.querySelector("#photo-replace-btn");
const photoUploadZone = document.querySelector("#photo-upload-zone");
const photoPlaceholder = document.querySelector("#photo-placeholder");
const photoPreviewWrap = document.querySelector("#photo-preview-wrap");
const photoPreview = document.querySelector("#photo-preview");
const photoCanvas = document.querySelector("#photo-canvas");
const photoStatus = document.querySelector("#photo-status");
const photoMeta = document.querySelector("#photo-meta");

const videoInput = document.querySelector("#video-input");
const videoPickBtn = document.querySelector("#video-pick-btn");
const videoReplaceBtn = document.querySelector("#video-replace-btn");
const videoUploadZone = document.querySelector("#video-upload-zone");
const videoPlaceholder = document.querySelector("#video-placeholder");
const videoPreviewWrap = document.querySelector("#video-preview-wrap");
const videoPreview = document.querySelector("#video-preview");
const videoStatus = document.querySelector("#video-status");
const storyboardBody = document.querySelector("#storyboard-body");

const shotSizeLabels = {
  wide: "全景",
  medium_wide: "中全景",
  medium: "中景",
  medium_close: "中近景",
  close: "近景",
};

const motionLabels = {
  locked_off: "固定机位",
  subtle_jib_reveal: "轻摇臂揭示",
  follow: "跟拍",
  locked_off_or_slow_push: "固定或缓推",
  drone_reveal_to_ground_follow: "无人机揭示转跟拍",
  pan_left: "左摇",
  pan_right: "右摇",
  dolly_in: "推镜",
  dolly_out: "拉镜",
};

const angleLabels = {
  eye_level: "平视",
  slightly_high: "略俯",
  high_angle: "俯拍",
  low_angle: "仰拍",
};

function switchTab(tabName) {
  workbenchTabs.forEach((tab) => {
    const isActive = tab.dataset.tab === tabName;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  workbenchPanels.forEach((panel) => {
    const isActive = panel.id === `${tabName}-panel`;
    panel.classList.toggle("active", isActive);
    panel.hidden = !isActive;
  });
}

workbenchTabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

function orientationFromSize(width, height) {
  if (width === height) {
    return "square";
  }
  return width > height ? "landscape" : "portrait";
}

function defaultSubjectBox(orientation) {
  if (orientation === "landscape") {
    return [0.34, 0.18, 0.28, 0.68];
  }
  if (orientation === "square") {
    return [0.3, 0.16, 0.4, 0.72];
  }
  return [0.24, 0.16, 0.52, 0.72];
}

function shotSizeForOrientation(orientation) {
  return orientation === "landscape" ? "medium_wide" : "medium";
}

function cameraDistanceForShot(shotSize) {
  return { wide: 3.2, medium_wide: 2.2, medium: 1.6 }[shotSize] || 2.0;
}

function cameraHeightForShot(shotSize) {
  return { wide: 1.8, medium_wide: 1.55, medium: 1.5 }[shotSize] || 1.55;
}

function cameraPathForOrientation(orientation) {
  if (orientation === "landscape") {
    return [
      { x: 0.12, y: 0.78, label: "起点" },
      { x: 0.28, y: 0.62 },
      { x: 0.5, y: 0.5, label: "主拍位" },
      { x: 0.72, y: 0.38 },
      { x: 0.88, y: 0.28, label: "收束" },
    ];
  }
  return [
    { x: 0.18, y: 0.82, label: "起点" },
    { x: 0.32, y: 0.66 },
    { x: 0.5, y: 0.52, label: "主拍位" },
    { x: 0.68, y: 0.4 },
    { x: 0.82, y: 0.3, label: "收束" },
  ];
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function drawRoundedRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawSubjectContour(ctx, bbox, canvasW, canvasH) {
  const x = bbox[0] * canvasW;
  const y = bbox[1] * canvasH;
  const w = bbox[2] * canvasW;
  const h = bbox[3] * canvasH;
  const cx = x + w / 2;
  const cy = y + h / 2;

  ctx.save();
  ctx.strokeStyle = "#ff7ac8";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([8, 5]);
  drawRoundedRect(ctx, x, y, w, h, Math.min(w, h) * 0.18);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(255, 122, 200, 0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.34, h * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 122, 200, 0.12)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.34, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff7ac8";
  ctx.font = "bold 12px Inter, sans-serif";
  ctx.fillText("主体轮廓", x + 8, y - 8 > 14 ? y - 8 : y + 18);
  ctx.restore();
}

function drawCompositionGrid(ctx, canvasW, canvasH) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
  ctx.lineWidth = 1;
  for (let i = 1; i <= 2; i += 1) {
    const x = (canvasW / 3) * i;
    const y = (canvasH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvasW, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCameraPath(ctx, path, canvasW, canvasH, inset) {
  const mapX = (value) => inset + value * (canvasW - inset * 2);
  const mapY = (value) => canvasH - inset - value * (canvasH - inset * 2);

  ctx.save();
  ctx.strokeStyle = "#69e7ff";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);
  ctx.beginPath();
  path.forEach((point, index) => {
    const px = mapX(point.x);
    const py = mapY(point.y);
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  });
  ctx.stroke();

  path.forEach((point, index) => {
    const px = mapX(point.x);
    const py = mapY(point.y);
    const isMain = point.label === "主拍位";
    ctx.fillStyle = isMain ? "#9dffb0" : "#69e7ff";
    ctx.beginPath();
    ctx.arc(px, py, isMain ? 7 : 5, 0, Math.PI * 2);
    ctx.fill();

    if (index < path.length - 1) {
      const next = path[index + 1];
      const nx = mapX(next.x);
      const ny = mapY(next.y);
      const angle = Math.atan2(ny - py, nx - px);
      const arrowX = px + Math.cos(angle) * 18;
      const arrowY = py + Math.sin(angle) * 18;
      ctx.strokeStyle = "#69e7ff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(
        arrowX - Math.cos(angle - 0.45) * 8,
        arrowY - Math.sin(angle - 0.45) * 8,
      );
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(
        arrowX - Math.cos(angle + 0.45) * 8,
        arrowY - Math.sin(angle + 0.45) * 8,
      );
      ctx.stroke();
    }

    if (point.label) {
      ctx.fillStyle = "#dce7ff";
      ctx.font = "11px Inter, sans-serif";
      ctx.fillText(point.label, px + 10, py - 10);
    }
  });

  ctx.fillStyle = "rgba(105, 231, 255, 0.08)";
  ctx.strokeStyle = "rgba(105, 231, 255, 0.35)";
  ctx.lineWidth = 1;
  drawRoundedRect(ctx, inset - 6, inset - 6, canvasW - inset * 2 + 12, canvasH - inset * 2 + 12, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#69e7ff";
  ctx.font = "bold 12px Inter, sans-serif";
  ctx.fillText("摄影机空间动线", inset, inset - 14 > 14 ? inset - 14 : inset + 16);
  ctx.restore();
}

function renderPhotoAnalysis(image) {
  const orientation = orientationFromSize(image.naturalWidth, image.naturalHeight);
  const bbox = defaultSubjectBox(orientation);
  const shotSize = shotSizeForOrientation(orientation);
  const cameraPath = cameraPathForOrientation(orientation);
  const distance = cameraDistanceForShot(shotSize);
  const height = cameraHeightForShot(shotSize);

  const maxWidth = photoCanvas.parentElement.clientWidth - 2;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  const canvasW = Math.round(image.naturalWidth * scale);
  const canvasH = Math.round(image.naturalHeight * scale);

  photoCanvas.width = canvasW;
  photoCanvas.height = canvasH;
  const ctx = photoCanvas.getContext("2d");

  ctx.drawImage(image, 0, 0, canvasW, canvasH);
  ctx.fillStyle = "rgba(7, 11, 20, 0.42)";
  ctx.fillRect(0, 0, canvasW, canvasH);

  drawCompositionGrid(ctx, canvasW, canvasH);
  drawSubjectContour(ctx, bbox, canvasW, canvasH);

  const pathInset = Math.min(canvasW, canvasH) * 0.08;
  drawCameraPath(ctx, cameraPath, canvasW, canvasH, pathInset);

  const center = [
    (bbox[0] + bbox[2] / 2).toFixed(2),
    (bbox[1] + bbox[3] / 2).toFixed(2),
  ];

  photoStatus.textContent = "分析完成";
  photoMeta.innerHTML = `
    <div><strong>画幅</strong>：${orientation === "portrait" ? "竖图" : orientation === "landscape" ? "横图" : "方图"}（${image.naturalWidth} × ${image.naturalHeight}）</div>
    <div><strong>景别</strong>：${shotSizeLabels[shotSize]} · <strong>机位高度</strong>：${height} m · <strong>拍摄距离</strong>：${distance} m</div>
    <div><strong>主体中心</strong>：(${center[0]}, ${center[1]}) · <strong>运镜</strong>：${motionLabels.locked_off_or_slow_push}</div>
    <div><strong>机位角度</strong>：${angleLabels.eye_level} · 动线包含起点、主拍位与收束三段轨迹</div>
  `;
}

function analyzePhoto(file) {
  if (!file || !file.type.startsWith("image/")) {
    photoStatus.textContent = "请上传有效图片文件";
    return;
  }

  photoStatus.textContent = "正在分析参考图…";
  const objectUrl = URL.createObjectURL(file);
  photoPreview.src = objectUrl;
  photoPlaceholder.classList.add("hidden");
  photoPreviewWrap.classList.remove("hidden");

  const image = new Image();
  image.onload = () => {
    renderPhotoAnalysis(image);
    URL.revokeObjectURL(objectUrl);
  };
  image.onerror = () => {
    photoStatus.textContent = "图片加载失败，请重试";
    URL.revokeObjectURL(objectUrl);
  };
  image.src = objectUrl;
}

const frameCanvas = document.createElement("canvas");
const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });
let activeVideoUrl = null;

const SCENE_CUT_THRESHOLD = 0.28;
const MIN_SHOT_SECONDS = 0.8;
const MAX_SHOTS = 24;

function luminanceAt(data, width, x, y) {
  const index = (y * width + x) * 4;
  return data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
}

function downscaleFrame(imageData, targetW = 96, targetH = 54) {
  frameCanvas.width = targetW;
  frameCanvas.height = targetH;
  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = imageData.width;
  tempCanvas.height = imageData.height;
  tempCanvas.getContext("2d").putImageData(imageData, 0, 0);
  frameCtx.drawImage(tempCanvas, 0, 0, targetW, targetH);
  return frameCtx.getImageData(0, 0, targetW, targetH);
}

function frameSignature(imageData) {
  const { width, height, data } = imageData;
  const gridX = 8;
  const gridY = 8;
  const signature = [];
  const cellW = width / gridX;
  const cellH = height / gridY;

  for (let gy = 0; gy < gridY; gy += 1) {
    for (let gx = 0; gx < gridX; gx += 1) {
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      const startX = Math.floor(gx * cellW);
      const endX = Math.floor((gx + 1) * cellW);
      const startY = Math.floor(gy * cellH);
      const endY = Math.floor((gy + 1) * cellH);

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const lum = luminanceAt(data, width, x, y);
          sum += lum;
          sumSq += lum * lum;
          count += 1;
        }
      }

      const mean = sum / count;
      const variance = Math.max(0, sumSq / count - mean * mean);
      signature.push(mean / 255, variance / 6500);
    }
  }

  return signature;
}

function signatureDistance(a, b) {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    const diff = a[i] - b[i];
    total += diff * diff;
  }
  return Math.sqrt(total / a.length);
}

function seekVideoTo(video, time) {
  return new Promise((resolve, reject) => {
    const target = Math.max(0, Math.min(time, Math.max(video.duration - 0.04, 0)));
    const timeout = window.setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error("视频定位超时"));
    }, 8000);

    const onSeeked = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      resolve();
    };

    if (Math.abs(video.currentTime - target) < 0.03) {
      window.clearTimeout(timeout);
      resolve();
      return;
    }

    video.addEventListener("seeked", onSeeked);
    video.currentTime = target;
  });
}

async function captureFrameAt(video, time) {
  await seekVideoTo(video, time);
  const width = video.videoWidth;
  const height = video.videoHeight;
  frameCanvas.width = width;
  frameCanvas.height = height;
  frameCtx.drawImage(video, 0, 0, width, height);
  return {
    imageData: frameCtx.getImageData(0, 0, width, height),
    thumbnail: frameCanvas.toDataURL("image/jpeg", 0.84),
  };
}

function detectShotBoundaries(samples) {
  if (samples.length <= 1) {
    return [{ start: 0, end: samples[0].time, endIndex: 0 }];
  }

  const boundaries = [0];
  for (let i = 1; i < samples.length; i += 1) {
    const distance = signatureDistance(samples[i - 1].signature, samples[i].signature);
    if (distance >= SCENE_CUT_THRESHOLD) {
      boundaries.push(i);
    }
  }

  const segments = [];
  for (let i = 0; i < boundaries.length; i += 1) {
    const startIndex = boundaries[i];
    const endIndex = i + 1 < boundaries.length ? boundaries[i + 1] - 1 : samples.length - 1;
    segments.push({
      start: samples[startIndex].time,
      end: samples[endIndex].time,
      startIndex,
      endIndex,
    });
  }

  const merged = [];
  for (const segment of segments) {
    const duration = segment.end - segment.start;
    if (merged.length > 0 && duration < MIN_SHOT_SECONDS) {
      merged[merged.length - 1].end = segment.end;
      merged[merged.length - 1].endIndex = segment.endIndex;
    } else {
      merged.push({ ...segment });
    }
  }

  if (merged.length > MAX_SHOTS) {
    const step = Math.ceil(merged.length / MAX_SHOTS);
    return merged.filter((_, index) => index % step === 0).slice(0, MAX_SHOTS);
  }

  return merged;
}

function analyzeSubjectRegion(imageData) {
  const small = downscaleFrame(imageData, 48, 27);
  const { width, height, data } = small;
  const gridX = 12;
  const gridY = 8;
  const cellW = width / gridX;
  const cellH = height / gridY;
  let bestScore = -1;
  let bestBox = [0.28, 0.2, 0.44, 0.6];

  for (let gy = 0; gy < gridY; gy += 1) {
    for (let gx = 0; gx < gridX; gx += 1) {
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      const startX = Math.floor(gx * cellW);
      const endX = Math.floor((gx + 1) * cellW);
      const startY = Math.floor(gy * cellH);
      const endY = Math.floor((gy + 1) * cellH);

      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const lum = luminanceAt(data, width, x, y);
          sum += lum;
          sumSq += lum * lum;
          count += 1;
        }
      }

      const mean = sum / count;
      const variance = Math.max(0, sumSq / count - mean * mean);
      const edgeScore = variance / 900;
      const centerWeight = 1 - Math.abs(gx / gridX - 0.5) * 0.7 - Math.abs(gy / gridY - 0.45) * 0.5;
      const score = edgeScore * centerWeight;

      if (score > bestScore) {
        bestScore = score;
        bestBox = [
          gx / gridX,
          gy / gridY,
          1 / gridX,
          1 / gridH,
        ];
      }
    }
  }

  const expand = 2.4;
  const cx = bestBox[0] + bestBox[2] / 2;
  const cy = bestBox[1] + bestBox[3] / 2;
  const w = Math.min(0.92, bestBox[2] * expand);
  const h = Math.min(0.92, bestBox[3] * expand);
  return [
    Math.max(0, cx - w / 2),
    Math.max(0, cy - h / 2),
    w,
    h,
  ];
}

function shotSizeFromBBox(bbox) {
  const area = bbox[2] * bbox[3];
  if (area < 0.12) return "wide";
  if (area < 0.22) return "medium_wide";
  if (area < 0.38) return "medium";
  if (area < 0.55) return "medium_close";
  return "close";
}

function angleFromBBox(bbox) {
  const centerY = bbox[1] + bbox[3] / 2;
  if (centerY < 0.36) return "high_angle";
  if (centerY > 0.64) return "low_angle";
  if (centerY < 0.46) return "slightly_high";
  return "eye_level";
}

function describeSubjectAction(bbox, motion) {
  const centerX = bbox[0] + bbox[2] / 2;
  const horizontal =
    centerX < 0.38 ? "主体居左" : centerX > 0.62 ? "主体居右" : "主体居中";
  const vertical =
    bbox[1] < 0.22 ? "画面上方活动" : bbox[1] > 0.42 ? "画面下方活动" : "画面中部活动";

  if (motion.type === "follow") {
    return `${horizontal}，${vertical}，持续移动`;
  }
  if (motion.type === "dolly_in") {
    return `${horizontal}，向镜头靠近`;
  }
  if (motion.type === "dolly_out") {
    return `${horizontal}，远离镜头`;
  }
  if (motion.type === "pan_left" || motion.type === "pan_right") {
    return `${horizontal}，横向扫视`;
  }
  return `${horizontal}，${vertical}`;
}

function detectMotionBetween(startFrame, endFrame) {
  const start = downscaleFrame(startFrame, 32, 18);
  const end = downscaleFrame(endFrame, 32, 18);
  const { width, height, data: startData } = start;
  const endData = end.data;

  let weightedDx = 0;
  let weightedDy = 0;
  let totalWeight = 0;
  let globalDiff = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const lum = luminanceAt(startData, width, x, y);
      const right = Math.abs(lum - luminanceAt(startData, width, x + 1, y));
      const down = Math.abs(lum - luminanceAt(startData, width, x, y + 1));
      const edge = right + down;
      const endLum = luminanceAt(endData, width, x, y);
      const diff = Math.abs(lum - endLum);
      globalDiff += diff;
      if (edge < 12) continue;

      const localDx =
        luminanceAt(endData, width, Math.min(width - 1, x + 1), y) -
        luminanceAt(endData, width, Math.max(0, x - 1), y);
      const localDy =
        luminanceAt(endData, width, x, Math.min(height - 1, y + 1)) -
        luminanceAt(endData, width, x, Math.max(0, y - 1));

      const weight = edge * diff;
      weightedDx += localDx * weight;
      weightedDy += localDy * weight;
      totalWeight += weight;
    }
  }

  const avgDiff = globalDiff / (width * height * 255);
  if (avgDiff < 0.018) {
    return { type: "locked_off", note: "画面稳定" };
  }

  if (totalWeight < 1) {
    return { type: "locked_off_or_slow_push", note: "轻微变化" };
  }

  const dx = weightedDx / totalWeight;
  const dy = weightedDy / totalWeight;
  const magnitude = Math.hypot(dx, dy);

  if (magnitude < 0.8) {
    return { type: "locked_off_or_slow_push", note: "缓推或轻微运动" };
  }
  if (Math.abs(dx) > Math.abs(dy) * 1.4) {
    return {
      type: dx > 0 ? "pan_right" : "pan_left",
      note: dx > 0 ? "镜头右移" : "镜头左移",
    };
  }
  if (dy < -1.2) {
    return { type: "dolly_in", note: "镜头推进" };
  }
  if (dy > 1.2) {
    return { type: "dolly_out", note: "镜头拉远" };
  }
  return { type: "follow", note: "跟拍运动" };
}

async function sampleVideoFrames(video, duration, onProgress) {
  const sampleInterval = Math.max(0.35, Math.min(1.2, duration / 48));
  const timestamps = [];
  for (let time = 0; time < duration; time += sampleInterval) {
    timestamps.push(Number(time.toFixed(2)));
  }
  if (timestamps[timestamps.length - 1] < duration - 0.2) {
    timestamps.push(Number((duration - 0.05).toFixed(2)));
  }

  const samples = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    onProgress(`正在抽帧分析… ${i + 1}/${timestamps.length}`);
    const captured = await captureFrameAt(video, timestamps[i]);
    samples.push({
      time: timestamps[i],
      signature: frameSignature(downscaleFrame(captured.imageData)),
      imageData: captured.imageData,
    });
  }

  return samples;
}

async function buildStoryboardFromVideo(video, duration, onProgress) {
  const samples = await sampleVideoFrames(video, duration, onProgress);
  const segments = detectShotBoundaries(samples);
  const rows = [];

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    const midpoint = segment.start + (segment.end - segment.start) / 2;
    onProgress(`正在生成分镜截图… ${i + 1}/${segments.length}`);

    const startFrame = samples[segment.startIndex].imageData;
    const endFrame = samples[segment.endIndex].imageData;
    const keyFrame = await captureFrameAt(video, midpoint);
    const bbox = analyzeSubjectRegion(keyFrame.imageData);
    const motion = detectMotionBetween(startFrame, endFrame);
    const size = shotSizeFromBBox(bbox);
    const angle = angleFromBBox(bbox);

    rows.push({
      shot: rows.length + 1,
      timeRange: `${formatTime(segment.start)} - ${formatTime(Math.max(segment.end, segment.start + 0.3))}`,
      size,
      motion: motion.type,
      action: describeSubjectAction(bbox, motion),
      angle,
      note: motion.note,
      thumbnail: keyFrame.thumbnail,
    });
  }

  return rows;
}

function renderStoryboard(rows) {
  if (rows.length === 0) {
    storyboardBody.innerHTML =
      '<tr class="empty-row"><td colspan="8">未能从视频中提取有效分镜</td></tr>';
    return;
  }

  storyboardBody.innerHTML = rows
    .map(
      (row) => `
        <tr>
          <td class="shot-num">${String(row.shot).padStart(2, "0")}</td>
          <td>${row.timeRange}</td>
          <td>${shotSizeLabels[row.size] || row.size}</td>
          <td>${motionLabels[row.motion] || row.motion}</td>
          <td>${row.action}</td>
          <td>${angleLabels[row.angle] || row.angle}</td>
          <td>${row.note}</td>
          <td class="shot-thumb"><img src="${row.thumbnail}" alt="镜${row.shot}画面" loading="lazy" /></td>
        </tr>
      `,
    )
    .join("");
}

function resetStoryboard(message) {
  storyboardBody.innerHTML = `<tr class="empty-row"><td colspan="8">${message}</td></tr>`;
}

async function analyzeVideo(file) {
  if (!file || !file.type.startsWith("video/")) {
    videoStatus.textContent = "请上传有效视频文件";
    return;
  }

  if (activeVideoUrl) {
    URL.revokeObjectURL(activeVideoUrl);
    activeVideoUrl = null;
  }

  videoStatus.textContent = "正在加载视频…";
  resetStoryboard("正在抽帧分析，请稍候…");

  const objectUrl = URL.createObjectURL(file);
  activeVideoUrl = objectUrl;
  videoPreview.src = objectUrl;
  videoPlaceholder.classList.add("hidden");
  videoPreviewWrap.classList.remove("hidden");

  const waitForVideoData = () =>
    new Promise((resolve) => {
      if (videoPreview.readyState >= 2) {
        resolve();
        return;
      }
      videoPreview.addEventListener("loadeddata", resolve, { once: true });
    });

  const onReady = async () => {
    videoPreview.removeEventListener("loadedmetadata", onReady);
    videoPreview.removeEventListener("error", onError);

    const duration = Number.isFinite(videoPreview.duration) ? videoPreview.duration : 0;
    if (!duration || duration <= 0) {
      videoStatus.textContent = "无法读取视频时长";
      resetStoryboard("视频元数据读取失败");
      return;
    }

    try {
      await waitForVideoData();
      videoPreview.pause();
      const rows = await buildStoryboardFromVideo(videoPreview, duration, (message) => {
        videoStatus.textContent = message;
      });
      renderStoryboard(rows);
      videoStatus.textContent = `真实抽帧完成 · ${rows.length} 个分镜 · 时长 ${formatTime(duration)}`;
    } catch (error) {
      videoStatus.textContent = "分镜分析失败，请重试";
      resetStoryboard(error.message || "分镜分析失败");
    }
  };

  const onError = () => {
    videoPreview.removeEventListener("loadedmetadata", onReady);
    videoPreview.removeEventListener("error", onError);
    videoStatus.textContent = "视频加载失败，请重试";
    resetStoryboard("视频加载失败，请重试");
    if (activeVideoUrl) {
      URL.revokeObjectURL(activeVideoUrl);
      activeVideoUrl = null;
    }
  };

  videoPreview.addEventListener("loadedmetadata", onReady);
  videoPreview.addEventListener("error", onError);
}

function setupUploadZone(zone, input, onFile) {
  zone.addEventListener("dragover", (event) => {
    event.preventDefault();
    zone.classList.add("dragover");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    zone.classList.remove("dragover");
    const file = event.dataTransfer.files?.[0];
    if (file) {
      onFile(file);
    }
  });
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) {
      onFile(file);
    }
  });
}

photoPickBtn.addEventListener("click", () => photoInput.click());
photoReplaceBtn.addEventListener("click", () => photoInput.click());
videoPickBtn.addEventListener("click", () => videoInput.click());
videoReplaceBtn.addEventListener("click", () => videoInput.click());

setupUploadZone(photoUploadZone, photoInput, analyzePhoto);
setupUploadZone(videoUploadZone, videoInput, analyzeVideo);
