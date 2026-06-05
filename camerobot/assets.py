"""Reference asset registration utilities."""

from __future__ import annotations

import hashlib
import mimetypes
import os
import struct
from pathlib import Path

from camerobot.models import ReferenceAsset


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def register_reference_asset(path: str | os.PathLike[str]) -> ReferenceAsset:
    """Register a local reference asset and extract lightweight metadata."""

    file_path = Path(path).expanduser().resolve()
    if not file_path.exists():
        raise FileNotFoundError(f"Reference asset not found: {file_path}")
    if not file_path.is_file():
        raise ValueError(f"Reference asset must be a file: {file_path}")

    size_bytes = file_path.stat().st_size
    media_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    width, height = read_image_size(file_path)
    asset_id = make_asset_id(file_path, size_bytes)

    return ReferenceAsset(
        asset_id=asset_id,
        path=str(file_path),
        media_type=media_type,
        size_bytes=size_bytes,
        width=width,
        height=height,
    )


def make_asset_id(file_path: Path, size_bytes: int) -> str:
    """Create a deterministic local asset ID from path and file metadata."""

    digest = hashlib.sha256()
    digest.update(str(file_path).encode("utf-8"))
    digest.update(str(size_bytes).encode("ascii"))
    digest.update(str(file_path.stat().st_mtime_ns).encode("ascii"))
    return f"asset_{digest.hexdigest()[:12]}"


def read_image_size(path: Path) -> tuple[int | None, int | None]:
    """Read PNG or JPEG dimensions using only the Python standard library."""

    with path.open("rb") as image_file:
        header = image_file.read(32)

        if header.startswith(PNG_SIGNATURE):
            return _read_png_size(header)

        if header.startswith(b"\xff\xd8"):
            image_file.seek(0)
            return _read_jpeg_size(image_file.read())

    return None, None


def _read_png_size(header: bytes) -> tuple[int, int]:
    if len(header) < 24:
        raise ValueError("PNG file is too small to contain an IHDR chunk")
    width, height = struct.unpack(">II", header[16:24])
    return width, height


def _read_jpeg_size(data: bytes) -> tuple[int | None, int | None]:
    index = 2
    while index < len(data) - 9:
        if data[index] != 0xFF:
            index += 1
            continue

        marker = data[index + 1]
        index += 2

        if marker in (0xD8, 0xD9):
            continue
        if marker == 0xDA:
            break
        if index + 2 > len(data):
            break

        segment_length = struct.unpack(">H", data[index : index + 2])[0]
        if segment_length < 2:
            break

        if marker in {
            0xC0,
            0xC1,
            0xC2,
            0xC3,
            0xC5,
            0xC6,
            0xC7,
            0xC9,
            0xCA,
            0xCB,
            0xCD,
            0xCE,
            0xCF,
        }:
            if index + 7 > len(data):
                break
            height, width = struct.unpack(">HH", data[index + 3 : index + 7])
            return width, height

        index += segment_length

    return None, None
