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

function buildStoryboardRows(duration, orientation) {
  const interval = duration <= 12 ? 2 : duration <= 30 ? 3 : 5;
  const shotPatterns = [
    { size: "wide", motion: "locked_off", action: "环境建立，交代场景", angle: "high_angle", note: "开场定场" },
    { size: "medium_wide", motion: "dolly_in", action: "主体入画，走向镜头", angle: "eye_level", note: "引导视线" },
    { size: "medium", motion: "follow", action: "主体停驻，自然互动", angle: "eye_level", note: "核心叙事" },
    { size: "medium_close", motion: "locked_off", action: "表情或细节特写", angle: "slightly_high", note: "情绪强化" },
    { size: "medium", motion: "pan_right", action: "主体转身或移动", angle: "eye_level", note: "节奏过渡" },
    { size: "medium_wide", motion: "dolly_out", action: "拉开空间，收束段落", angle: "eye_level", note: "段落结束" },
  ];

  const rows = [];
  let time = 0;
  let index = 0;

  while (time < duration && rows.length < 12) {
    const pattern = shotPatterns[index % shotPatterns.length];
    const end = Math.min(time + interval, duration);
    rows.push({
      shot: rows.length + 1,
      timeRange: `${formatTime(time)} - ${formatTime(end)}`,
      size: pattern.size,
      motion: pattern.motion,
      action: pattern.action,
      angle: pattern.angle,
      note: index === 0 ? pattern.note : orientation === "portrait" ? "竖屏构图" : pattern.note,
    });
    time = end;
    index += 1;
  }

  if (rows.length === 0) {
    rows.push({
      shot: 1,
      timeRange: "00:00 - 00:02",
      size: "medium",
      motion: "locked_off",
      action: "主体呈现",
      angle: "eye_level",
      note: "短视频单镜",
    });
  }

  return rows;
}

function renderStoryboard(rows) {
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
        </tr>
      `,
    )
    .join("");
}

function analyzeVideo(file) {
  if (!file || !file.type.startsWith("video/")) {
    videoStatus.textContent = "请上传有效视频文件";
    return;
  }

  videoStatus.textContent = "正在生成分镜表…";
  const objectUrl = URL.createObjectURL(file);
  videoPreview.src = objectUrl;
  videoPlaceholder.classList.add("hidden");
  videoPreviewWrap.classList.remove("hidden");

  videoPreview.onloadedmetadata = () => {
    const duration = Number.isFinite(videoPreview.duration) ? videoPreview.duration : 10;
    const orientation =
      videoPreview.videoWidth && videoPreview.videoHeight
        ? orientationFromSize(videoPreview.videoWidth, videoPreview.videoHeight)
        : "portrait";
    const rows = buildStoryboardRows(duration, orientation);
    renderStoryboard(rows);
    videoStatus.textContent = `已生成 ${rows.length} 个分镜 · 时长 ${formatTime(duration)}`;
    URL.revokeObjectURL(objectUrl);
  };

  videoPreview.onerror = () => {
    videoStatus.textContent = "视频加载失败，请重试";
    URL.revokeObjectURL(objectUrl);
  };
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
