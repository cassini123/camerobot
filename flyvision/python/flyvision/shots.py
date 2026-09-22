"""Shot database: native flyvision JSON plus CinePath export import."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping, Sequence

from flyvision.image import RgbImage, load_image


@dataclass(frozen=True)
class ShotRecord:
    """One planned shot. Spatial fields are stored but unused for Capture GO."""

    shot_id: str
    scene_id: str
    title: str
    kind: str
    target_type: str
    target_object_id: str
    composition_horizontal: float
    composition_vertical: float
    subject_ratio: float = 0.3
    camera_height_m: float | None = None
    distance_m: float | None = None
    position: tuple[float, float, float] | None = None
    reference_path: Path | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def composition_target(self) -> tuple[float, float]:
        return (self.composition_horizontal, self.composition_vertical)


def load_shot_database(path: str | Path) -> list[ShotRecord]:
    """Load flyvision shot JSON or a CinePath `yun-jing-project.json` export."""

    import json

    target = Path(path)
    payload = json.loads(target.read_text(encoding="utf-8"))
    base_dir = target.parent
    if _looks_like_cinepath(payload):
        return load_cinepath_export(payload, base_dir=base_dir)
    shots = payload.get("shots", [])
    if not isinstance(shots, list):
        raise ValueError(f"{target} has no shots[] array")
    return [_from_native(item, base_dir) for item in shots]


def load_cinepath_export(
    payload: Mapping[str, Any] | str | Path,
    *,
    base_dir: str | Path | None = None,
) -> list[ShotRecord]:
    """Parse CinePath export JSON (`shots[]` with composition / target / camera)."""

    import json

    if isinstance(payload, (str, Path)):
        path = Path(payload)
        base_dir = base_dir or path.parent
        payload = json.loads(path.read_text(encoding="utf-8"))
    shots = payload.get("shots", [])
    if not isinstance(shots, list):
        raise ValueError("CinePath export has no shots[] array")
    records = []
    for item in shots:
        records.append(_from_cinepath(item, Path(base_dir) if base_dir else None))
    return records


def load_reference_image(shot: ShotRecord) -> RgbImage | None:
    if shot.reference_path is None or not shot.reference_path.exists():
        return None
    return load_image(shot.reference_path)


def shot_by_id(shots: Sequence[ShotRecord], shot_id: str) -> ShotRecord:
    for shot in shots:
        if shot.shot_id == shot_id:
            return shot
    known = ", ".join(item.shot_id for item in shots) or "(none)"
    raise KeyError(f"unknown shot_id {shot_id!r}; have {known}")


def _looks_like_cinepath(payload: Mapping[str, Any]) -> bool:
    shots = payload.get("shots")
    if not isinstance(shots, list) or not shots:
        return False
    first = shots[0]
    return "robot_hints" in first or (
        isinstance(first.get("path"), dict) and "start" in first.get("path", {})
    )


def _from_native(item: Mapping[str, Any], base_dir: Path) -> ShotRecord:
    target = item.get("target") or {}
    composition = item.get("composition") or {}
    camera = item.get("camera") or {}
    spatial = item.get("spatial") or {}
    reference = item.get("reference") or item.get("reference_path")
    position = _vec3(spatial.get("position") or camera.get("position") or target.get("position"))
    distance = spatial.get("distance_m")
    if distance is None and position is not None and target.get("position"):
        distance = _distance(position, _vec3(target.get("position")))
    return ShotRecord(
        shot_id=str(item.get("shot_id") or item.get("id") or ""),
        scene_id=str(item.get("scene_id") or ""),
        title=str(item.get("title") or item.get("shot_id") or ""),
        kind=str(item.get("kind") or "character"),
        target_type=str(target.get("type") or "person"),
        target_object_id=str(target.get("object_id") or target.get("id") or ""),
        composition_horizontal=float(composition.get("horizontal", 0.5)),
        composition_vertical=float(composition.get("vertical", 0.5)),
        subject_ratio=float(composition.get("subject_ratio", 0.3)),
        camera_height_m=_optional_float(camera.get("height")),
        distance_m=_optional_float(distance),
        position=position,
        reference_path=_resolve_reference(reference, base_dir),
        raw=dict(item),
    )


def _from_cinepath(item: Mapping[str, Any], base_dir: Path | None) -> ShotRecord:
    target = item.get("target") or {}
    composition = item.get("composition") or {}
    camera = item.get("camera") or {}
    camera_pos = _vec3(camera.get("position"))
    target_pos = _vec3(target.get("position"))
    distance = None
    if camera_pos is not None and target_pos is not None:
        distance = _distance(camera_pos, target_pos)
    reference = item.get("reference") or item.get("reference_path")
    if reference is None and item.get("reference_id"):
        reference = f"reference/{item['reference_id']}.bmp"
    return ShotRecord(
        shot_id=str(item.get("shot_id") or ""),
        scene_id=str(item.get("scene_id") or ""),
        title=str(item.get("title") or item.get("shot_id") or ""),
        kind=str(item.get("kind") or "character"),
        target_type=str(target.get("type") or "person"),
        target_object_id=str(target.get("object_id") or ""),
        composition_horizontal=float(composition.get("horizontal", 0.5)),
        composition_vertical=float(composition.get("vertical", 0.5)),
        subject_ratio=float(composition.get("subject_ratio", 0.3)),
        camera_height_m=_optional_float(camera.get("height")),
        distance_m=distance,
        position=camera_pos,
        reference_path=_resolve_reference(reference, base_dir) if base_dir else None,
        raw=dict(item),
    )


def _resolve_reference(reference: Any, base_dir: Path) -> Path | None:
    if not reference:
        return None
    path = Path(str(reference))
    if not path.is_absolute():
        path = base_dir / path
    return path


def _vec3(value: Any) -> tuple[float, float, float] | None:
    if not isinstance(value, (list, tuple)) or len(value) < 3:
        return None
    return (float(value[0]), float(value[1]), float(value[2]))


def _distance(
    a: tuple[float, float, float],
    b: tuple[float, float, float],
) -> float:
    return (
        (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
    ) ** 0.5


def _optional_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(value)
