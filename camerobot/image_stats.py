"""Lightweight image statistics without third-party CV libraries."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path
from typing import Any

from camerobot.assets import PNG_SIGNATURE


def sample_image_look(path: str | Path) -> dict[str, Any] | None:
    """Return coarse RGB / brightness stats for PNG files when decodable."""

    file_path = Path(path)
    try:
        raw = file_path.read_bytes()
    except OSError:
        return None

    if raw.startswith(PNG_SIGNATURE):
        return _sample_png(raw)
    return None


def _sample_png(data: bytes) -> dict[str, Any] | None:
    if len(data) < 33:
        return None

    width, height, bit_depth, color_type = struct.unpack(">IIBB", data[16:26])
    if bit_depth != 8 or color_type not in {2, 6}:
        return None

    channels = 3 if color_type == 2 else 4
    idat = bytearray()
    offset = 8
    while offset + 8 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        start = offset + 8
        end = start + length
        if end + 4 > len(data):
            break
        if chunk_type == b"IDAT":
            idat.extend(data[start:end])
        if chunk_type == b"IEND":
            break
        offset = end + 4

    if not idat:
        return None

    try:
        decompressed = zlib.decompress(bytes(idat))
    except zlib.error:
        return None

    stride = 1 + width * channels
    expected = stride * height
    if len(decompressed) < expected:
        return None

    step = max(1, (width * height) // 400)
    total_r = total_g = total_b = 0.0
    count = 0
    left_lum = right_lum = 0.0
    left_n = right_n = 0

    for y in range(height):
        row = decompressed[y * stride + 1 : (y + 1) * stride]
        for x in range(0, width, max(1, int(step**0.5))):
            index = x * channels
            if index + 2 >= len(row):
                break
            r, g, b = row[index], row[index + 1], row[index + 2]
            total_r += r
            total_g += g
            total_b += b
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            count += 1
            if x < width / 2:
                left_lum += lum
                left_n += 1
            else:
                right_lum += lum
                right_n += 1

    if count == 0:
        return None

    avg_r = total_r / count
    avg_g = total_g / count
    avg_b = total_b / count
    brightness = (0.2126 * avg_r + 0.7152 * avg_g + 0.0722 * avg_b) / 255.0
    left = (left_lum / left_n / 255.0) if left_n else brightness
    right = (right_lum / right_n / 255.0) if right_n else brightness

    return {
        "avg_rgb": [round(avg_r), round(avg_g), round(avg_b)],
        "brightness": round(brightness, 3),
        "left_brightness": round(left, 3),
        "right_brightness": round(right, 3),
        "sample_count": count,
    }
