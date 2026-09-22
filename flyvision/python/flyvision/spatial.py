"""Crop-aware pinhole ranging. Same contract as lib/spatial.ts."""

from __future__ import annotations

from dataclasses import dataclass
from math import atan, pi, tan
from typing import Literal

DEFAULT_HFOV_DEG = 70.0
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
    )


def format_meters(value: float) -> str:
    return f"{value:.0f} m" if abs(value) >= 10 else f"{value:.1f} m"


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
        parts.append("距离接近")
    elif closer > 0:
        parts.append(f"近了 {format_meters(closer)}")
    else:
        parts.append(f"远了 {format_meters(-closer)}")
    if abs(right) < dead:
        parts.append("左右对齐")
    elif right > 0:
        parts.append(f"偏右 {format_meters(right)}")
    else:
        parts.append(f"偏左 {format_meters(-right)}")
    if abs(up) >= max(0.28, dead):
        parts.append(f"偏高 {format_meters(up)}" if up > 0 else f"偏低 {format_meters(-up)}")
    return " · ".join(parts)


def _clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


@dataclass
class SpatialDet:
    label: str
    box: tuple[float, float, float, float]
    score: float = 1.0


@dataclass
class VideoSpatialResult:
    track_id: int | None
    det: SpatialDet | None
    spatial: SpatialFix | None
    raw: SpatialFix | None
    delta: SpatialDelta | None
    matched: bool


@dataclass
class _Axis:
    x: float
    v: float = 0.0
    p00: float = 0.25
    p01: float = 0.0
    p11: float = 0.6


@dataclass
class _Track:
    id: int
    label: str
    box: tuple[float, float, float, float]
    score: float
    missed: int = 0
    crop: BodyCrop | None = None
    crop_hold: BodyCrop | None = None
    crop_hold_count: int = 0
    last_h: float = 0.0
    h_vel: float = 0.0
    dist: _Axis = None  # type: ignore[assignment]
    right: _Axis = None  # type: ignore[assignment]
    up: _Axis = None  # type: ignore[assignment]
    heading: Heading = "center"
    last_fix: SpatialFix | None = None
    last_raw: SpatialFix | None = None


_DEFAULT_VIDEO_DT = 0.36
_TRACK_IOU_MIN = 0.18
_TRACK_PAIR_MIN = 0.08
_TRACK_MAX_MISS = 5
_HEADING_ENTER = 0.34
_HEADING_LEAVE = 0.2


class VideoSpatialTracker:
    """IoU lock + constant-velocity filter. Same contract as lib/spatial.ts."""

    def __init__(self) -> None:
        self._tracks: list[_Track] = []
        self._next_id = 1
        self._primary_id: int | None = None
        self._reference: SpatialFix | None = None
        self._last_t: float | None = None

    def set_reference(self, fix: SpatialFix | None) -> None:
        self._reference = fix

    def get_reference(self) -> SpatialFix | None:
        return self._reference

    def reset(self) -> None:
        self._tracks = []
        self._next_id = 1
        self._primary_id = None
        self._reference = None
        self._last_t = None

    def reset_tracks(self) -> None:
        self._tracks = []
        self._next_id = 1
        self._primary_id = None
        self._last_t = None

    def push(
        self,
        dets: list[SpatialDet],
        *,
        aspect: float = 16 / 9,
        hfov_deg: float = DEFAULT_HFOV_DEG,
        person_height_m: float = 1.7,
        reject_partial: bool = False,
        now_s: float | None = None,
    ) -> VideoSpatialResult:
        dt = self._step_dt(now_s)
        opts = dict(
            aspect=aspect,
            hfov_deg=hfov_deg,
            person_height_m=person_height_m,
            reject_partial=reject_partial,
        )
        matched: list[SpatialDet | None] = [None] * len(self._tracks)
        used: set[int] = set()
        pairs: list[tuple[float, int, int]] = []
        for ti, track in enumerate(self._tracks):
            for di, det in enumerate(dets):
                if det.label != track.label:
                    continue
                score = _pair_score(track.box, det.box)
                if score >= _TRACK_PAIR_MIN and _box_iou(track.box, det.box) >= _TRACK_IOU_MIN * 0.5:
                    pairs.append((score, ti, di))
        pairs.sort(reverse=True)
        for score, ti, di in pairs:
            if matched[ti] is not None or di in used:
                continue
            if _box_iou(self._tracks[ti].box, dets[di].box) < _TRACK_IOU_MIN and score < 0.22:
                continue
            matched[ti] = dets[di]
            used.add(di)

        for ti, track in enumerate(self._tracks):
            det = matched[ti]
            if det is None:
                _predict(track.dist, dt, 0.12)
                _predict(track.right, dt, 0.18)
                _predict(track.up, dt, 0.18)
                track.missed += 1
                if track.last_fix:
                    track.last_fix = _finish(track, track.last_fix)
                continue
            track.missed = 0
            track.box = det.box
            track.score = det.score
            raw = estimate_spatial(det.label, det.box, **opts)
            track.last_raw = raw
            self._update_track(track, det, raw, dt)

        for di, det in enumerate(dets):
            if di in used:
                continue
            self._tracks.append(self._spawn(det, estimate_spatial(det.label, det.box, **opts)))

        self._tracks = [track for track in self._tracks if track.missed <= _TRACK_MAX_MISS]
        self._lock_primary(dets)

        primary = next((track for track in self._tracks if track.id == self._primary_id), None)
        matched_det = None
        if primary is not None:
            matched_det = next(
                (
                    det
                    for det in dets
                    if det.label == primary.label and _box_iou(det.box, primary.box) >= _TRACK_IOU_MIN * 0.6
                ),
                SpatialDet(primary.label, primary.box, primary.score) if primary.missed == 0 else None,
            )
        spatial = primary.last_fix if primary else None
        raw = primary.last_raw if primary else None
        delta = compare_spatial(self._reference, spatial) if self._reference and spatial else None
        return VideoSpatialResult(
            track_id=primary.id if primary else None,
            det=matched_det,
            spatial=spatial,
            raw=raw,
            delta=delta,
            matched=bool(primary and primary.missed == 0),
        )

    def _step_dt(self, now_s: float | None) -> float:
        now = now_s if now_s is not None else 0.0
        if self._last_t is None:
            self._last_t = now
            return _DEFAULT_VIDEO_DT
        elapsed = now - self._last_t
        self._last_t = now
        if now_s is None or elapsed < 0.02:
            return _DEFAULT_VIDEO_DT
        return _clamp(elapsed, 0.08, 1.2)

    def _spawn(self, det: SpatialDet, raw: SpatialFix | None) -> _Track:
        track = _Track(
            id=self._next_id,
            label=det.label,
            box=det.box,
            score=det.score,
            last_h=det.box[3],
            dist=_Axis(raw.distance_m if raw else 2.0),
            right=_Axis(raw.right_m if raw else 0.0),
            up=_Axis(raw.up_m if raw else 0.0),
            heading=raw.heading if raw else "center",
            crop=raw.crop if raw else None,
            last_fix=raw,
            last_raw=raw,
        )
        self._next_id += 1
        return track

    def _update_track(
        self,
        track: _Track,
        det: SpatialDet,
        raw: SpatialFix | None,
        dt: float,
    ) -> None:
        dh = det.box[3] - track.last_h
        track.h_vel = 0.45 * (dh / max(dt, 1e-3)) + 0.55 * track.h_vel
        rel_h = abs(dh) / max(det.box[3], 0.05)
        growing = track.h_vel > 0.04
        shrinking = track.h_vel < -0.04
        track.last_h = det.box[3]
        _predict(track.dist, dt, 0.28 if growing or shrinking else 0.08)
        _predict(track.right, dt, 0.16)
        _predict(track.up, dt, 0.16)
        if raw is None:
            if track.last_fix:
                track.last_fix = _finish(track, track.last_fix)
            return
        crop_changed = _lock_crop(track, raw.crop)
        residual = abs(raw.distance_m - track.dist.x) / max(track.dist.x, 0.4)
        r_dist = 0.045 if raw.confidence == "high" else 0.14 if raw.confidence == "medium" else 0.4
        if crop_changed:
            r_dist *= 8
        if rel_h < 0.03 and residual > 0.12:
            r_dist *= 10
        r_lat = 0.03 if raw.confidence == "high" else 0.1
        if crop_changed:
            r_lat *= 3
        _update(track.dist, raw.distance_m, r_dist)
        _update(track.right, raw.right_m, r_lat)
        _update(track.up, raw.up_m, r_lat)
        if (growing or shrinking) and not crop_changed:
            size_vel = (-track.dist.x * track.h_vel) / max(det.box[3], 0.05)
            track.dist.v = 0.55 * track.dist.v + 0.45 * size_vel
        track.heading = _heading_hysteresis(track.right.x, track.heading)
        track.last_fix = _finish(track, raw)

    def _lock_primary(self, dets: list[SpatialDet]) -> None:
        live = [track for track in self._tracks if track.missed <= _TRACK_MAX_MISS]
        current = next((track for track in live if track.id == self._primary_id), None)
        if current is not None and current.missed < _TRACK_MAX_MISS:
            return
        seed = pick_primary_det(dets)
        if seed is None:
            self._primary_id = current.id if current else (live[0].id if live else None)
            return
        hit = next(
            (
                track
                for track in live
                if track.label == seed.label and _box_iou(track.box, seed.box) >= _TRACK_IOU_MIN
            ),
            None,
        )
        self._primary_id = hit.id if hit else (live[0].id if live else None)


def pick_primary_det(dets: list[SpatialDet]) -> SpatialDet | None:
    if not dets:
        return None
    people = [item for item in dets if item.label == "person"]
    pool = people or dets
    return max(pool, key=lambda item: item.score * item.box[2] * item.box[3])


def _box_iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x1 = max(ax, bx)
    y1 = max(ay, by)
    x2 = min(ax + aw, bx + bw)
    y2 = min(ay + ah, by + bh)
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = aw * ah + bw * bh - inter
    return 0.0 if union <= 0 else inter / union


def _pair_score(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    acx, acy = a[0] + a[2] / 2.0, a[1] + a[3] / 2.0
    bcx, bcy = b[0] + b[2] / 2.0, b[1] + b[3] / 2.0
    return _box_iou(a, b) - 0.35 * ((acx - bcx) ** 2 + (acy - bcy) ** 2) ** 0.5


def _predict(axis: _Axis, dt: float, q: float) -> None:
    axis.x += axis.v * dt
    p00 = axis.p00 + 2 * dt * axis.p01 + dt * dt * axis.p11 + q * dt**4 / 4
    p01 = axis.p01 + dt * axis.p11 + q * dt**3 / 2
    p11 = axis.p11 + q * dt * dt
    axis.p00, axis.p01, axis.p11 = p00, p01, p11


def _update(axis: _Axis, z: float, r: float) -> None:
    s = axis.p00 + r
    k0 = axis.p00 / s
    k1 = axis.p01 / s
    innov = z - axis.x
    axis.x += k0 * innov
    axis.v += k1 * innov
    axis.p11 -= k1 * axis.p01
    axis.p01 *= 1 - k0
    axis.p00 *= 1 - k0


def _lock_crop(track: _Track, crop: BodyCrop) -> bool:
    if track.crop is None:
        track.crop = crop
        return False
    if crop == track.crop:
        track.crop_hold = None
        track.crop_hold_count = 0
        return False
    if track.crop_hold == crop:
        track.crop_hold_count += 1
    else:
        track.crop_hold = crop
        track.crop_hold_count = 1
    if track.crop_hold_count >= 3:
        track.crop = crop
        track.crop_hold = None
        track.crop_hold_count = 0
        return False
    return True


def _heading_hysteresis(right_m: float, prev: Heading) -> Heading:
    if prev == "right":
        if right_m < -_HEADING_ENTER:
            return "left"
        return "center" if right_m < _HEADING_LEAVE else "right"
    if prev == "left":
        if right_m > _HEADING_ENTER:
            return "right"
        return "center" if right_m > -_HEADING_LEAVE else "left"
    if right_m > _HEADING_ENTER:
        return "right"
    if right_m < -_HEADING_ENTER:
        return "left"
    return "center"


def _finish(track: _Track, raw: SpatialFix) -> SpatialFix:
    distance = _clamp(track.dist.x, 0.25, 80.0)
    return SpatialFix(
        distance_m=distance,
        right_m=track.right.x,
        up_m=track.up.x,
        heading=track.heading,
        crop=track.crop or raw.crop,
        confidence=raw.confidence,
        used_height_m=raw.used_height_m,
    )
