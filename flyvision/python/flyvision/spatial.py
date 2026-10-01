"""Crop-aware pinhole ranging. Same contract as lib/spatial.ts."""

from __future__ import annotations

from dataclasses import dataclass
from math import atan, pi, tan
from typing import Literal

DEFAULT_HFOV_DEG = 70.0
WEBCAM_HFOV_DEG = 70.0
ESP32CAM_HFOV_DEG = 66.0
DEFAULT_ESP_CAM_STREAM_URL = "http://192.168.4.1/stream"
OCCUPANCY_BAND = 0.18
OFFSET_BAND = 0.12
REAL_HEIGHT_M = {
    "person": 1.7,
    "bicycle": 1.05,
    "car": 1.5,
    "bus": 3.2,
    "truck": 3.4,
    "chair": 0.9,
    "dog": 0.55,
    "cat": 0.25,
    "bottle": 0.28,
    "tv": 0.55,
    "laptop": 0.22,
}
REAL_WIDTH_M = {
    "person": 0.42,
    "bicycle": 0.55,
    "car": 1.8,
    "chair": 0.5,
    "dog": 0.35,
    "cat": 0.18,
    "bottle": 0.07,
    "tv": 1.1,
    "laptop": 0.32,
}
PERSON_VISIBLE = {
    "full": (1.7, 0.42),
    "knee": (1.28, 0.42),
    "waist": (0.98, 0.4),
    "bust": (0.7, 0.4),
    "head": (0.28, 0.16),
}

BodyCrop = Literal["full", "knee", "waist", "bust", "head", "object"]
Heading = Literal["left", "center", "right"]
Confidence = Literal["high", "medium", "low"]


@dataclass(frozen=True)
class SpatialFix:
    distance_m: float
    right_m: float
    up_m: float
    heading: Heading
    crop: BodyCrop
    confidence: Confidence
    used_height_m: float


@dataclass(frozen=True)
class SpatialDelta:
    closer_m: float
    right_m: float
    up_m: float
    summary: str
    meters_hint: str


@dataclass(frozen=True)
class GeometryGate:
    height_ratio: float
    area_ratio: float
    dx: float
    dy: float
    range_cue: str
    heading_cue: str
    pitch_cue: str
    occupancy_ok: bool
    offset_ok: bool
    geometry_ok: bool
    summary: str


@dataclass(frozen=True)
class VisibleSize:
    crop: BodyCrop
    height_m: float
    width_m: float
    height_usable: bool
    width_usable: bool


def estimate_spatial(
    label: str,
    box: tuple[float, float, float, float],
    *,
    aspect: float = 16 / 9,
    hfov_deg: float = DEFAULT_HFOV_DEG,
    person_height_m: float = 1.7,
    reject_partial: bool = False,
) -> SpatialFix | None:
    visible = infer_visible_size(label, box, person_height_m=person_height_m)
    x, y, w, h = box
    if visible is None or h < 0.02 or w < 0.01:
        return None
    if reject_partial and not visible.height_usable:
        return None
    hfov = hfov_deg * pi / 180.0
    vfov = 2.0 * atan(tan(hfov / 2.0) / max(0.2, aspect))
    tan_h = tan(hfov / 2.0)
    tan_v = tan(vfov / 2.0)
    from_h = visible.height_m / (2.0 * h * tan_v) if visible.height_usable else None
    from_w = visible.width_m / (2.0 * w * tan_h) if visible.width_usable else None
    distance = _clamp(_fuse(from_h, from_w, visible.crop), 0.25, 80.0)
    cx = x + w / 2.0
    cy = y + h / 2.0
    right = distance * (cx - 0.5) * 2.0 * tan_h
    up = distance * (0.5 - cy) * 2.0 * tan_v
    heading: Heading = "right" if right > 0.28 else "left" if right < -0.28 else "center"
    return SpatialFix(
        distance_m=distance,
        right_m=right,
        up_m=up,
        heading=heading,
        crop=visible.crop,
        confidence=_confidence(from_h, from_w, visible),
        used_height_m=visible.height_m,
    )


def infer_visible_size(
    label: str,
    box: tuple[float, float, float, float],
    *,
    person_height_m: float = 1.7,
) -> VisibleSize | None:
    if label == "person":
        return _person_size(box, person_height_m)
    height = REAL_HEIGHT_M.get(label)
    width = REAL_WIDTH_M.get(label)
    if height is None and width is None:
        return None
    top, bottom, _ = _clip(box)
    return VisibleSize(
        crop="object",
        height_m=height or width or 0.0,
        width_m=width or height or 0.0,
        height_usable=height is not None and not (top and bottom),
        width_usable=width is not None,
    )


def compare_spatial(reference: SpatialFix, live: SpatialFix) -> SpatialDelta:
    closer = reference.distance_m - live.distance_m
    right = live.right_m - reference.right_m
    up = live.up_m - reference.up_m
    loose = reference.confidence == "low" or live.confidence == "low"
    return SpatialDelta(
        closer_m=closer,
        right_m=right,
        up_m=up,
        summary=_phrase(closer, right, up, loose),
        meters_hint=format_meters_hint(live),
    )


def judge_geometry(
    reference: tuple[float, float, float, float],
    live: tuple[float, float, float, float],
    occupancy_band: float = OCCUPANCY_BAND,
    offset_band: float = OFFSET_BAND,
) -> GeometryGate:
    """Visual-servoing gate: occupancy + center offset. Meters are not an input."""

    _rx, _ry, rw, rh = reference
    _lx, _ly, lw, lh = live
    height_ratio = lh / max(rh, 1e-6)
    area_ratio = (lw * lh) / max(rw * rh, 1e-6)
    dx = (_lx + lw / 2.0) - (_rx + rw / 2.0)
    dy = (_ly + lh / 2.0) - (_ry + rh / 2.0)
    occupancy_ok = abs(height_ratio - 1.0) <= occupancy_band
    offset_ok = abs(dx) <= offset_band and abs(dy) <= offset_band
    range_cue = "远近合适" if occupancy_ok else ("近了" if height_ratio > 1.0 else "远了")
    heading_cue = "居中" if abs(dx) <= offset_band else ("偏右" if dx > 0 else "偏左")
    pitch_cue = "高低合适" if abs(dy) <= offset_band else ("偏上" if dy < 0 else "偏下")
    parts = [range_cue, heading_cue]
    if pitch_cue != "高低合适":
        parts.append(pitch_cue)
    return GeometryGate(
        height_ratio=height_ratio,
        area_ratio=area_ratio,
        dx=dx,
        dy=dy,
        range_cue=range_cue,
        heading_cue=heading_cue,
        pitch_cue=pitch_cue,
        occupancy_ok=occupancy_ok,
        offset_ok=offset_ok,
        geometry_ok=occupancy_ok and offset_ok,
        summary=" · ".join(parts),
    )


def hfov_for_source(source: str, webcam_deg: float, cam_deg: float) -> float:
    return cam_deg if source == "esp-cam" else webcam_deg


def normalize_stream_url(raw: str) -> str:
    trimmed = raw.strip()
    return trimmed or DEFAULT_ESP_CAM_STREAM_URL


def https_blocks_http_stream(page_protocol: str, stream_url: str) -> bool:
    return page_protocol.rstrip(":") == "https" and stream_url.startswith("http://")


def format_meters(value: float) -> str:
    return f"{value:.0f} m" if abs(value) >= 10 else f"{value:.1f} m"


def format_meters_hint(fix: SpatialFix) -> str:
    return f"约 {format_meters(fix.distance_m)} · 不可靠"


def _person_size(box: tuple[float, float, float, float], person_height_m: float) -> VisibleSize:
    _x, _y, w, h = box
    aspect = w / max(h, 1e-6)
    top, bottom, _ = _clip(box)
    if top and bottom:
        crop: BodyCrop = "bust" if aspect >= 0.72 else "waist" if aspect >= 0.5 else "knee"
    elif top and not bottom:
        crop = "bust" if aspect >= 0.62 else "waist"
    elif not top and bottom:
        crop = "full" if aspect <= 0.38 else "knee" if aspect <= 0.55 else "waist"
    elif aspect <= 0.34 and h >= 0.22:
        crop = "full"
    elif aspect <= 0.45:
        crop = "knee"
    elif aspect <= 0.58:
        crop = "waist"
    elif aspect <= 0.8 and h >= 0.42:
        crop = "bust"
    else:
        crop = "head"
    height, width = PERSON_VISIBLE[crop]
    scale = (person_height_m or 1.7) / 1.7
    return VisibleSize(
        crop=crop,
        height_m=height * scale,
        width_m=width * scale,
        height_usable=not (top and bottom),
        width_usable=True,
    )


def _clip(box: tuple[float, float, float, float]) -> tuple[bool, bool, bool]:
    x, y, w, h = box
    return y < 0.035, y + h > 0.965, x < 0.02 or x + w > 0.98


def _fuse(from_h: float | None, from_w: float | None, crop: BodyCrop) -> float:
    if from_h is None and from_w is None:
        return 1.0
    if from_h is None:
        return from_w or 1.0
    if from_w is None:
        return from_h
    weight = {
        "full": 0.22,
        "knee": 0.32,
        "waist": 0.48,
        "bust": 0.62,
        "head": 0.7,
        "object": 0.35,
    }[crop]
    return (1.0 - weight) * from_h + weight * from_w


def _confidence(from_h: float | None, from_w: float | None, visible: VisibleSize) -> Confidence:
    if from_h is None or from_w is None:
        return "low"
    gap = abs(from_h - from_w) / max(from_h, from_w)
    if not visible.height_usable:
        return "medium" if gap < 0.35 else "low"
    if gap < 0.22 and visible.crop in {"full", "knee"}:
        return "high"
    return "medium" if gap < 0.4 else "low"


def _phrase(closer: float, right: float, up: float, loose: bool) -> str:
    dead = 0.4 if loose else 0.22
    parts: list[str] = []
    if abs(closer) < dead:
        parts.append("远近合适")
    elif closer > 0:
        parts.append("近了")
    else:
        parts.append("远了")
    if abs(right) < dead:
        parts.append("居中")
    elif right > 0:
        parts.append("偏右")
    else:
        parts.append("偏左")
    if abs(up) >= max(0.28, dead):
        parts.append("偏上" if up > 0 else "偏下")
    return " · ".join(parts)


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))
