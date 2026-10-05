"""FilmOps-style shot scale + composition tags. Offline-tag a reference still."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from flyvision.spatial import infer_visible_size

SHOT_SCALES = ("ECU", "CU", "MCU", "MS", "MLS", "LS", "ELS")
SCALE_ZH = {
    "ECU": "大特写",
    "CU": "特写",
    "MCU": "近景",
    "MS": "中景",
    "MLS": "中全",
    "LS": "全景",
    "ELS": "远景",
}
TAG_ZH = {
    "center": "居中",
    "thirds": "三分",
    "horizontal": "水平",
    "vertical": "垂直",
    "symmetric": "对称",
    "framing": "卡边",
    "scattered": "散点",
}


@dataclass(frozen=True)
class ShotLabelSet:
    scale: str
    tags: tuple[str, ...]

    def as_text(self) -> str:
        names = " / ".join(TAG_ZH[tag] for tag in self.tags if tag in TAG_ZH)
        scale = SCALE_ZH.get(self.scale, self.scale)
        return f"{scale} · {names}" if names else scale


def shot_scale_from_box(box: tuple[float, float, float, float], label: str = "person") -> str:
    visible = infer_visible_size(label, box)
    crop = visible.crop if visible else "object"
    _x, _y, _w, h = box
    if crop == "head":
        return "ECU" if h >= 0.48 else "CU"
    if crop == "bust":
        return "MCU"
    if crop == "waist":
        return "MS"
    if crop == "knee":
        return "MLS"
    if crop == "full":
        return "LS" if h >= 0.38 else "ELS"
    if h >= 0.72:
        return "CU"
    if h >= 0.45:
        return "MS"
    if h >= 0.22:
        return "LS"
    return "ELS"


def composition_tags(
    box: tuple[float, float, float, float],
    extra_boxes: int = 0,
) -> tuple[str, ...]:
    x, y, w, h = box
    cx, cy = x + w / 2.0, y + h / 2.0

    def near(value: float, target: float, tol: float = 0.07) -> bool:
        return abs(value - target) <= tol

    tags: list[str] = []
    if near(cx, 0.5, 0.08) and near(cy, 0.5, 0.12):
        tags.append("center")
    if near(cx, 1 / 3) or near(cx, 2 / 3) or near(cy, 1 / 3) or near(cy, 2 / 3):
        tags.append("thirds")
    if near(cy, 0.5, 0.08):
        tags.append("horizontal")
    if near(cx, 0.5, 0.08):
        tags.append("vertical")
    if near(cx, 0.5, 0.055):
        tags.append("symmetric")
    edges = int(y < 0.04) + int(y + h > 0.96) + int(x < 0.03) + int(x + w > 0.97)
    if edges >= 2:
        tags.append("framing")
    if extra_boxes >= 2:
        tags.append("scattered")
    return tuple(tags)


def label_shot(
    box: tuple[float, float, float, float],
    label: str = "person",
    extra_boxes: int = 0,
) -> ShotLabelSet:
    return ShotLabelSet(shot_scale_from_box(box, label), composition_tags(box, extra_boxes))


def label_similarity(current: ShotLabelSet, reference: ShotLabelSet) -> float:
    if current.scale == reference.scale:
        scale = 1.0
    elif abs(SHOT_SCALES.index(current.scale) - SHOT_SCALES.index(reference.scale)) == 1:
        scale = 0.45
    else:
        scale = 0.0
    union = set(current.tags) | set(reference.tags)
    if not union:
        return scale
    inter = len(set(current.tags) & set(reference.tags))
    return 0.62 * scale + 0.38 * (inter / len(union))


def tag_reference(
    boxes: Sequence[tuple[str, tuple[float, float, float, float]]],
) -> ShotLabelSet | None:
    """Offline-tag a reference still from its detections. Largest person wins."""

    if not boxes:
        return None
    people = [item for item in boxes if item[0] == "person"]
    pool: Iterable[tuple[str, tuple[float, float, float, float]]] = people or boxes
    label, box = max(pool, key=lambda item: item[1][2] * item[1][3])
    extras = max(0, len(list(boxes)) - 1)
    return label_shot(box, label, extras)
