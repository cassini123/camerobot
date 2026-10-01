"""Camera exposure / optic parameter bundle (EXIF when present, else estimated)."""

from __future__ import annotations

import struct
from pathlib import Path
from typing import Any

from camerobot.models import ReferenceAnalysis, ReferenceAsset


def build_camera_parameters(
    asset: ReferenceAsset,
    analysis: ReferenceAnalysis,
    *,
    stats: dict[str, Any] | None,
) -> dict[str, Any]:
    """Return a full camera parameter block for replicate / A7M4 control."""

    exif = read_jpeg_exif_exposure(Path(asset.path))
    estimated = estimate_exposure_from_analysis(analysis, stats)
    merged = {**estimated, **{k: v for k, v in exif.items() if v is not None}}
    merged["source"] = "exif" if exif.get("iso") is not None else "estimated"
    merged["viewpoint"] = {
        "angle": analysis.camera["angle"],
        "height_m": analysis.camera["height_m"],
        "distance_m": analysis.camera["distance_m"],
        "perspective": analysis.camera["perspective"],
    }
    return merged


def estimate_exposure_from_analysis(
    analysis: ReferenceAnalysis,
    stats: dict[str, Any] | None,
) -> dict[str, Any]:
    brightness = float(stats["brightness"]) if stats else 0.5
    shot = analysis.composition["shot_size"]
    focal_hint = str(analysis.camera["focal_length_hint"])

    if focal_hint == "wide":
        focal_mm = 24.0
    elif focal_hint == "normal_to_short_telephoto":
        focal_mm = 85.0
    elif focal_hint == "telephoto":
        focal_mm = 135.0
    else:
        focal_mm = 50.0

    if shot in {"medium", "close"}:
        aperture = 2.0
    elif shot == "wide":
        aperture = 5.6
    else:
        aperture = 2.8

    # Map brightness → ISO / shutter ballpark for daylight-ish stills.
    if brightness > 0.7:
        iso = 100
        shutter = 1 / 500
        ev = 14.0
    elif brightness > 0.45:
        iso = 200
        shutter = 1 / 250
        ev = 12.0
    elif brightness > 0.28:
        iso = 400
        shutter = 1 / 125
        ev = 10.0
    else:
        iso = 1600
        shutter = 1 / 60
        ev = 7.0

    temperature_k = int(analysis.lighting.get("temperature_k", 5200))
    return {
        "iso": iso,
        "shutter_speed_s": shutter,
        "shutter_display": _shutter_display(shutter),
        "aperture_f": aperture,
        "focal_length_mm": focal_mm,
        "focal_length_35mm_equiv_mm": focal_mm,
        "exposure_compensation_ev": 0.0,
        "metering_mode": "multi",
        "exposure_program": "aperture_priority",
        "white_balance": "auto",
        "white_balance_temperature_k": temperature_k,
        "color_space": "srgb",
        "picture_profile": "standard",
        "focus_mode": "af_c" if shot != "wide" else "af_s",
        "focus_distance_m": float(analysis.camera["distance_m"]),
        "flash": "off",
        "drive_mode": "single",
        "image_stabilization": "on",
        "sensor_format": "full_frame",
        "ev_estimate": ev,
        "brightness_proxy": brightness,
    }


def read_jpeg_exif_exposure(path: Path) -> dict[str, Any]:
    """Best-effort EXIF ISO / exposure time / FNumber from JPEG APP1."""

    empty: dict[str, Any] = {
        "iso": None,
        "shutter_speed_s": None,
        "aperture_f": None,
        "focal_length_mm": None,
    }
    try:
        data = path.read_bytes()
    except OSError:
        return empty
    if not data.startswith(b"\xff\xd8"):
        return empty

    # Minimal TIFF-in-EXIF parse for common tags.
    index = data.find(b"Exif\x00\x00")
    if index < 0:
        return empty
    tiff = data[index + 6 :]
    if len(tiff) < 8:
        return empty
    endian = "<" if tiff[0:2] == b"II" else ">"
    if tiff[0:2] not in {b"II", b"MM"}:
        return empty

    def read_ifd(offset: int) -> dict[int, tuple[int, int, bytes]]:
        if offset + 2 > len(tiff):
            return {}
        (count,) = struct.unpack(endian + "H", tiff[offset : offset + 2])
        entries: dict[int, tuple[int, int, bytes]] = {}
        cursor = offset + 2
        for _ in range(count):
            if cursor + 12 > len(tiff):
                break
            tag, typ, cnt = struct.unpack(endian + "HHI", tiff[cursor : cursor + 8])
            value_bytes = tiff[cursor + 8 : cursor + 12]
            entries[tag] = (typ, cnt, value_bytes)
            cursor += 12
        return entries

    try:
        (ifd0,) = struct.unpack(endian + "I", tiff[4:8])
        entries = read_ifd(ifd0)
        # EXIF sub-IFD pointer tag 0x8769
        exif_entries = {}
        if 0x8769 in entries:
            typ, cnt, raw = entries[0x8769]
            if typ == 4 and cnt == 1:
                (exif_off,) = struct.unpack(endian + "I", raw)
                exif_entries = read_ifd(exif_off)
        else:
            exif_entries = entries
    except struct.error:
        return empty

    def rational(tag: int) -> float | None:
        item = exif_entries.get(tag)
        if not item:
            return None
        typ, cnt, raw = item
        if typ != 5 or cnt < 1:
            return None
        (offset,) = struct.unpack(endian + "I", raw)
        if offset + 8 > len(tiff):
            return None
        num, den = struct.unpack(endian + "II", tiff[offset : offset + 8])
        if den == 0:
            return None
        return num / den

    def short_or_long(tag: int) -> int | None:
        item = exif_entries.get(tag)
        if not item:
            return None
        typ, cnt, raw = item
        if typ == 3 and cnt >= 1:
            (value,) = struct.unpack(endian + "H", raw[:2])
            return int(value)
        if typ == 4 and cnt == 1:
            (value,) = struct.unpack(endian + "I", raw)
            return int(value)
        return None

    iso = short_or_long(0x8827)  # PhotographicSensitivity
    exposure_time = rational(0x829A)
    f_number = rational(0x829D)
    focal = rational(0x920A)

    result = dict(empty)
    result["iso"] = iso
    result["shutter_speed_s"] = exposure_time
    if exposure_time:
        result["shutter_display"] = _shutter_display(exposure_time)
    result["aperture_f"] = f_number
    result["focal_length_mm"] = focal
    return result


def _shutter_display(seconds: float) -> str:
    if seconds <= 0:
        return "unknown"
    if seconds >= 1:
        return f"{seconds:.1f}s"
    denom = max(1, round(1 / seconds))
    return f"1/{denom}"
