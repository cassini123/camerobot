"""Gradio entry for the ModelScope studio cassini123/TRACE.

The uploaded archive is the flight package. This file is the required
Gradio entry (app.py) at the studio root.
"""

from __future__ import annotations

import zipfile
from math import sqrt
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
ARCHIVE_NAME = "trace-02-cinepath-yolo-firmware.zip"
HIST_H, HIST_S, HIST_V = 16, 4, 4
HIST_SIZE = HIST_H * HIST_S * HIST_V
MATCH_THRESHOLD = 0.85
COMPOSITION_DELTA = 0.05

SHOTS = {
    "shot_01 Establishing · 建筑建立": (0.50, 0.48, 0.22),
    "shot_02 Follow · 人物跟拍": (0.33, 0.52, 0.31),
    "shot_03 Reveal · 人物揭示": (0.38, 0.50, 0.28),
}


def _as_rgb(image) -> np.ndarray:
    if image is None:
        raise ValueError("请上传图片")
    if isinstance(image, Image.Image):
        array = np.asarray(image.convert("RGB"))
    else:
        array = np.asarray(image)
        if array.ndim == 2:
            array = np.stack([array, array, array], axis=-1)
        if array.shape[-1] == 4:
            array = array[:, :, :3]
    if array.dtype != np.uint8:
        array = np.clip(array, 0, 255).astype(np.uint8)
    return array


def _histogram(image: np.ndarray) -> np.ndarray:
    step = 2
    pixels = image[::step, ::step].reshape(-1, 3).astype(np.float32) / 255.0
    r, g, b = pixels[:, 0], pixels[:, 1], pixels[:, 2]
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    diff = mx - mn
    hue = np.zeros_like(mx)
    mask = diff > 0
    rmax = mask & (mx == r)
    gmax = mask & (mx == g) & ~rmax
    bmax = mask & ~rmax & ~gmax
    hue[rmax] = (60.0 * ((g[rmax] - b[rmax]) / diff[rmax]) + 360.0) % 360.0
    hue[gmax] = 60.0 * ((b[gmax] - r[gmax]) / diff[gmax]) + 120.0
    hue[bmax] = 60.0 * ((r[bmax] - g[bmax]) / diff[bmax]) + 240.0
    sat = np.zeros_like(mx)
    sat[mx > 0] = diff[mx > 0] / mx[mx > 0]
    h_bin = np.minimum(HIST_H - 1, (hue / 360.0 * HIST_H).astype(np.int32))
    s_bin = np.minimum(HIST_S - 1, (sat * HIST_S).astype(np.int32))
    v_bin = np.minimum(HIST_V - 1, (mx * HIST_V).astype(np.int32))
    index = (h_bin * HIST_S + s_bin) * HIST_V + v_bin
    bins = np.bincount(index, minlength=HIST_SIZE).astype(np.float64)
    total = bins.sum()
    if total:
        bins /= total
    return bins


def _correlation(left: np.ndarray, right: np.ndarray) -> float:
    da = left - left.mean()
    db = right - right.mean()
    denom = sqrt(float(np.dot(da, da) * np.dot(db, db)))
    if denom == 0:
        return 1.0
    corr = float(np.dot(da, db) / denom)
    corr = max(-1.0, min(1.0, corr))
    return (corr + 1.0) / 2.0


def _parse_box(text: str, width: int, height: int) -> tuple[float, float, float, float]:
    raw = (text or "").strip().replace("，", ",")
    if not raw:
        return (0.42, 0.27, 0.16, 0.46)
    parts = [float(item) for item in raw.split(",")]
    if len(parts) != 4:
        raise ValueError("主体框写成 x,y,w,h，四个 0 到 1 的数")
    x, y, w, h = parts
    if max(x, y, w, h) > 1.5:
        x, y, w, h = x / width, y / height, w / width, h / height
    return x, y, w, h


def _draw(image: np.ndarray, box: tuple[float, float, float, float], target: tuple[float, float]) -> Image.Image:
    canvas = Image.fromarray(image.copy())
    draw = ImageDraw.Draw(canvas)
    width, height = canvas.size
    x, y, w, h = box
    draw.rectangle(
        [x * width, y * height, (x + w) * width, (y + h) * height],
        outline=(230, 194, 122),
        width=3,
    )
    tx, ty = target
    radius = 6
    draw.ellipse(
        [tx * width - radius, ty * height - radius, tx * width + radius, ty * height + radius],
        outline=(244, 239, 228),
        width=3,
    )
    return canvas


def archive_status() -> str:
    path = ROOT / ARCHIVE_NAME
    if not path.exists():
        return "根目录还没有 trace-02-cinepath-yolo-firmware.zip。"
    data = path.read_bytes()[:80]
    if data.startswith(b"version https://git-lfs.github.com/spec/v1"):
        return "压缩包只写下了 Git LFS 指针，31MB 的包体没有进仓库。请重新拖入这个 zip。"
    if zipfile.is_zipfile(path):
        return "已找到飞行包 zip，里面是 CinePath、YOLOv8n 和 ESP32-CAM 烧录工程。"
    return "根目录有同名文件，但不是可解压的 zip。"


def compare(reference, live, shot_name: str, box_text: str):
    ref = _as_rgb(reference)
    frame = _as_rgb(live)
    target_x, target_y, target_area = SHOTS[shot_name]
    box = _parse_box(box_text, frame.shape[1], frame.shape[0])
    x, y, w, h = box
    center = (x + w / 2.0, y + h / 2.0)
    area = max(0.0, w * h)
    hist = _correlation(_histogram(frame), _histogram(ref))
    comp_dist = sqrt((center[0] - target_x) ** 2 + (center[1] - target_y) ** 2 + (area - target_area) ** 2)
    comp = max(0.0, 1.0 - comp_dist / 1.2)
    similarity = 0.6 * hist + 0.4 * comp
    dx = center[0] - target_x
    dy = center[1] - target_y
    composition_ok = abs(dx) <= COMPOSITION_DELTA and abs(dy) <= COMPOSITION_DELTA
    decision = "单帧已接近计划镜头" if similarity >= MATCH_THRESHOLD and composition_ok else "CONTINUE_FOLLOW"
    marked = _draw(frame, box, (target_x, target_y))
    report = "\n".join(
        [
            f"镜头 {shot_name}",
            f"相似度 {similarity:.3f}（直方图 {hist:.3f}，构图 {comp:.3f}，阈值 {MATCH_THRESHOLD:.2f}）",
            f"偏移 dx={dx:+.3f}  dy={dy:+.3f}",
            f"COMPOSITION_OK={composition_ok}",
            f"判定 {decision}",
            "黄框是主体框，圆点是计划分镜的构图目标。连续 8 帧稳定后，PC 端才给出 CAPTURE_GO。",
            archive_status(),
        ]
    )
    return marked, report


def build_demo():
    import gradio as gr

    with gr.Blocks(title="随影 TRACE") as demo:
        gr.Markdown(
            """# 随影 TRACE · 飞行视觉

创空间当前 SDK 是 Gradio，入口必须是根目录的 `app.py`。
上传的 `trace-02-cinepath-yolo-firmware.zip` 是 CinePath、YOLOv8n 和 ESP32-CAM 烧录工程，它本身不能被当作启动文件。

左边放计划分镜，右边放实时帧。主体框沿用飞行模块的归一化格式 `x,y,w,h`。留空时使用示例人物框。比对在本机完成，不上传到其他服务。"""
        )
        with gr.Row():
            reference = gr.Image(label="计划分镜", type="numpy")
            live = gr.Image(label="实时帧", type="numpy")
        shot = gr.Dropdown(choices=list(SHOTS), value="shot_03 Reveal · 人物揭示", label="计划镜头")
        box = gr.Textbox(label="主体框 x,y,w,h", value="0.30,0.27,0.16,0.46")
        button = gr.Button("比对")
        marked = gr.Image(label="主体框与构图目标", type="pil")
        report = gr.Textbox(label="偏移反馈", lines=8)
        button.click(compare, [reference, live, shot, box], [marked, report])
    return demo


try:
    demo = build_demo()
except ModuleNotFoundError:
    demo = None


if __name__ == "__main__" and demo is not None:
    demo.launch()
