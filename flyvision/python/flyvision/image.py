"""Minimal RGB image type plus BMP/PPM IO that does not need OpenCV."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from struct import pack, unpack
from typing import Iterable


@dataclass(frozen=True)
class RgbImage:
    """Packed 8-bit RGB image (`pixels` length is `width * height * 3`)."""

    width: int
    height: int
    pixels: bytes

    def __post_init__(self) -> None:
        expected = self.width * self.height * 3
        if self.width <= 0 or self.height <= 0:
            raise ValueError("image dimensions must be positive")
        if len(self.pixels) != expected:
            raise ValueError(
                f"pixel buffer length {len(self.pixels)} != {expected}"
            )

    def pixel(self, x: int, y: int) -> tuple[int, int, int]:
        index = (y * self.width + x) * 3
        r, g, b = self.pixels[index : index + 3]
        return r, g, b


def solid_image(
    width: int,
    height: int,
    color: tuple[int, int, int],
) -> RgbImage:
    """Fill a rectangle with a single RGB color."""

    r, g, b = color
    return RgbImage(width, height, bytes([r, g, b]) * (width * height))


def blit_rect(
    image: RgbImage,
    x0: int,
    y0: int,
    x1: int,
    y1: int,
    color: tuple[int, int, int],
) -> RgbImage:
    """Return a copy with an axis-aligned rectangle filled."""

    pixels = bytearray(image.pixels)
    width = image.width
    r, g, b = color
    x0 = max(0, min(width, x0))
    x1 = max(0, min(width, x1))
    y0 = max(0, min(image.height, y0))
    y1 = max(0, min(image.height, y1))
    for y in range(y0, y1):
        row = y * width * 3
        for x in range(x0, x1):
            index = row + x * 3
            pixels[index] = r
            pixels[index + 1] = g
            pixels[index + 2] = b
    return RgbImage(image.width, image.height, bytes(pixels))


def load_image(path: str | Path) -> RgbImage:
    """Load BMP/PPM in pure Python; JPEG/PNG via OpenCV when installed."""

    target = Path(path)
    suffix = target.suffix.lower()
    if suffix in {".bmp", ".dib"}:
        return load_bmp(target)
    if suffix in {".ppm", ".p6"}:
        return load_ppm(target)
    if suffix in {".jpg", ".jpeg", ".png"}:
        return _load_with_cv2(target)
    raise ValueError(f"unsupported image format: {target.suffix}")


def save_image(image: RgbImage, path: str | Path) -> Path:
    """Save BMP/PPM without OpenCV; JPEG/PNG if OpenCV is available."""

    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    suffix = target.suffix.lower()
    if suffix in {".bmp", ".dib"}:
        save_bmp(image, target)
        return target
    if suffix in {".ppm", ".p6"}:
        save_ppm(image, target)
        return target
    if suffix in {".jpg", ".jpeg", ".png"}:
        _save_with_cv2(image, target)
        return target
    raise ValueError(f"unsupported image format: {target.suffix}")


def load_bmp(path: str | Path) -> RgbImage:
    """Read a 24-bit uncompressed Windows BMP."""

    data = Path(path).read_bytes()
    if data[:2] != b"BM":
        raise ValueError("not a BMP file")
    pixel_offset = unpack("<I", data[10:14])[0]
    header_size = unpack("<I", data[14:18])[0]
    width, height = unpack("<ii", data[18:26])
    planes, bpp = unpack("<HH", data[26:30])
    compression = unpack("<I", data[30:34])[0]
    if planes != 1 or bpp != 24 or compression != 0:
        raise ValueError("only uncompressed 24-bit BMP is supported")
    abs_height = abs(height)
    row_stride = ((width * 3 + 3) // 4) * 4
    pixels = bytearray(width * abs_height * 3)
    top_down = height < 0
    for y in range(abs_height):
        src_y = y if top_down else abs_height - 1 - y
        row = pixel_offset + src_y * row_stride
        for x in range(width):
            b, g, r = data[row + x * 3 : row + x * 3 + 3]
            dest = (y * width + x) * 3
            pixels[dest] = r
            pixels[dest + 1] = g
            pixels[dest + 2] = b
    return RgbImage(width, abs_height, bytes(pixels))


def save_bmp(image: RgbImage, path: str | Path) -> None:
    """Write a 24-bit uncompressed Windows BMP."""

    row_stride = ((image.width * 3 + 3) // 4) * 4
    pixel_size = row_stride * image.height
    pixel_offset = 54
    data = bytearray(pixel_offset + pixel_size)
    data[0:2] = b"BM"
    data[2:6] = pack("<I", len(data))
    data[10:14] = pack("<I", pixel_offset)
    data[14:18] = pack("<I", 40)
    data[18:22] = pack("<i", image.width)
    data[22:26] = pack("<i", image.height)
    data[26:28] = pack("<H", 1)
    data[28:30] = pack("<H", 24)
    data[34:38] = pack("<I", pixel_size)
    for y in range(image.height):
        src_y = image.height - 1 - y
        dest = pixel_offset + y * row_stride
        for x in range(image.width):
            r, g, b = image.pixel(x, src_y)
            data[dest + x * 3] = b
            data[dest + x * 3 + 1] = g
            data[dest + x * 3 + 2] = r
    Path(path).write_bytes(data)


def load_ppm(path: str | Path) -> RgbImage:
    """Read a binary P6 PPM."""

    data = Path(path).read_bytes()
    if not data.startswith(b"P6"):
        raise ValueError("not a P6 PPM file")
    header, pixels = _split_ppm_header(data)
    tokens = header.split()
    if len(tokens) < 4 or tokens[0] != b"P6":
        raise ValueError("invalid PPM header")
    width = int(tokens[1])
    height = int(tokens[2])
    maxval = int(tokens[3])
    if maxval != 255:
        raise ValueError("only 8-bit PPM is supported")
    expected = width * height * 3
    if len(pixels) < expected:
        raise ValueError("PPM pixel data is truncated")
    return RgbImage(width, height, pixels[:expected])


def save_ppm(image: RgbImage, path: str | Path) -> None:
    header = f"P6\n{image.width} {image.height}\n255\n".encode("ascii")
    Path(path).write_bytes(header + image.pixels)


def _split_ppm_header(data: bytes) -> tuple[bytes, bytes]:
    index = 0
    tokens: list[bytes] = []
    current = bytearray()
    comment = False
    while index < len(data):
        char = data[index]
        index += 1
        if comment:
            if char in {10, 13}:
                comment = False
            continue
        if char == 35 and not current:
            comment = True
            continue
        if char in {9, 10, 13, 32}:
            if current:
                tokens.append(bytes(current))
                current.clear()
                if len(tokens) == 4:
                    return b" ".join(tokens), data[index:]
            continue
        current.append(char)
    raise ValueError("PPM header is incomplete")


def bgr_bytes_to_rgb(width: int, height: int, bgr: bytes) -> RgbImage:
    """Convert packed OpenCV BGR bytes into an RgbImage."""

    if len(bgr) != width * height * 3:
        raise ValueError("BGR buffer size does not match dimensions")
    rgb = bytearray(len(bgr))
    for index in range(0, len(bgr), 3):
        rgb[index] = bgr[index + 2]
        rgb[index + 1] = bgr[index + 1]
        rgb[index + 2] = bgr[index]
    return RgbImage(width, height, bytes(rgb))


def rgb_to_bgr_bytes(image: RgbImage) -> bytes:
    bgr = bytearray(len(image.pixels))
    for index in range(0, len(image.pixels), 3):
        bgr[index] = image.pixels[index + 2]
        bgr[index + 1] = image.pixels[index + 1]
        bgr[index + 2] = image.pixels[index]
    return bytes(bgr)


def iter_sampled_pixels(
    image: RgbImage,
    step: int = 2,
) -> Iterable[tuple[int, int, int]]:
    """Yield RGB pixels on a coarse grid for cheap histograms."""

    step = max(1, step)
    for y in range(0, image.height, step):
        row = y * image.width * 3
        for x in range(0, image.width, step):
            index = row + x * 3
            yield (
                image.pixels[index],
                image.pixels[index + 1],
                image.pixels[index + 2],
            )


def _load_with_cv2(path: Path) -> RgbImage:
    cv2, np = _cv2()
    bgr = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if bgr is None:
        raise FileNotFoundError(f"OpenCV could not read {path}")
    return RgbImage(
        int(bgr.shape[1]),
        int(bgr.shape[0]),
        np.ascontiguousarray(bgr[:, :, ::-1]).tobytes(),
    )


def _save_with_cv2(image: RgbImage, path: Path) -> None:
    cv2, np = _cv2()
    array = np.frombuffer(image.pixels, dtype=np.uint8).reshape(
        (image.height, image.width, 3)
    )
    bgr = array[:, :, ::-1].copy()
    if not cv2.imwrite(str(path), bgr):
        raise OSError(f"OpenCV could not write {path}")


def decode_jpeg_bytes(data: bytes) -> RgbImage:
    """Decode a JPEG blob with OpenCV."""

    cv2, np = _cv2()
    array = np.frombuffer(data, dtype=np.uint8)
    bgr = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("could not decode JPEG frame")
    return RgbImage(
        int(bgr.shape[1]),
        int(bgr.shape[0]),
        np.ascontiguousarray(bgr[:, :, ::-1]).tobytes(),
    )


def _cv2():
    try:
        import cv2
        import numpy as np
    except ImportError as exc:  # pragma: no cover - optional extra
        raise RuntimeError(
            "OpenCV is required for JPEG/PNG and live camera IO. "
            'Install with: pip install -e ".[flyvision]"'
        ) from exc
    return cv2, np
