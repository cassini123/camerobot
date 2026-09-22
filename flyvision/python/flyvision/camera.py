"""Layer 1 camera sources: MJPEG URL, webcam, or a still image."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from urllib.request import Request, urlopen

from flyvision.image import RgbImage, decode_jpeg_bytes, load_image


def iter_frames(
    *,
    url: str | None = None,
    webcam: int | None = None,
    image: str | Path | None = None,
    once: bool = False,
) -> Iterator[RgbImage]:
    """Yield RGB frames from one of the supported sources."""

    selected = [item for item in (url, webcam, image) if item is not None]
    if len(selected) != 1:
        raise ValueError("choose exactly one of --url, --webcam, or --frame")
    if image is not None:
        frame = load_image(image)
        yield frame
        if not once:
            return
        return
    if url is not None:
        yield from iter_mjpeg(url)
        return
    yield from iter_webcam(0 if webcam is None else webcam)


def iter_mjpeg(url: str, timeout: float = 15.0) -> Iterator[RgbImage]:
    """Pull JPEG blobs out of an ESP32-CAM multipart MJPEG stream."""

    request = Request(url, headers={"Accept": "multipart/x-mixed-replace"})
    with urlopen(request, timeout=timeout) as response:  # noqa: S310 - user-provided CAM URL
        for jpeg in _iter_jpeg_blobs(response):
            yield decode_jpeg_bytes(jpeg)


def iter_webcam(index: int = 0) -> Iterator[RgbImage]:
    cv2, _np = _cv2()
    capture = cv2.VideoCapture(index)
    if not capture.isOpened():
        raise RuntimeError(f"could not open webcam index {index}")
    try:
        while True:
            ok, bgr = capture.read()
            if not ok or bgr is None:
                break
            yield RgbImage(
                int(bgr.shape[1]),
                int(bgr.shape[0]),
                bgr[:, :, ::-1].copy().tobytes(),
            )
    finally:
        capture.release()


def _iter_jpeg_blobs(stream, max_buffer: int = 2_000_000) -> Iterator[bytes]:
    buf = b""
    while True:
        chunk = stream.read(4096)
        if not chunk:
            break
        buf += chunk
        while True:
            start = buf.find(b"\xff\xd8")
            end = buf.find(b"\xff\xd9")
            if start != -1 and end != -1 and end > start:
                yield buf[start : end + 2]
                buf = buf[end + 2 :]
                continue
            if len(buf) > max_buffer:
                buf = buf[-10_000:]
            break


def _cv2():
    try:
        import cv2
        import numpy as np
    except ImportError as exc:  # pragma: no cover - optional extra
        raise RuntimeError(
            "OpenCV is required for webcam and MJPEG decode. "
            'Install with: pip install -e ".[flyvision]"'
        ) from exc
    return cv2, np
