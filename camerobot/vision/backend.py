"""Vision backend interface: heuristic today, real YOLO tomorrow."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Protocol

from camerobot.models import Intent, ReferenceAsset


@dataclass(frozen=True)
class VisionDetection:
    """Normalized subject detection used by photo/video modes."""

    bbox_norm: list[float]
    center_norm: list[float]
    label: str
    confidence: float
    pose_hint: str
    backend: str


class VisionBackend(Protocol):
    """Swap point for heuristic → YOLO / ONNX / RKNN."""

    name: str

    def detect_primary_subject(
        self,
        asset: ReferenceAsset,
        intent: Intent,
    ) -> VisionDetection: ...


_ACTIVE: VisionBackend | None = None


def get_vision_backend() -> VisionBackend:
    """Return the process-wide vision backend (env CAMEROBOT_VISION_BACKEND)."""

    global _ACTIVE
    if _ACTIVE is not None:
        return _ACTIVE

    choice = os.environ.get("CAMEROBOT_VISION_BACKEND", "heuristic").strip().lower()
    if choice in {"yolo", "yolo11n", "onnx"}:
        from camerobot.vision.yolo_backend import YoloVisionBackend

        _ACTIVE = YoloVisionBackend()
    else:
        from camerobot.vision.heuristic_backend import HeuristicVisionBackend

        _ACTIVE = HeuristicVisionBackend()
    return _ACTIVE


def set_vision_backend(backend: VisionBackend | None) -> None:
    """Override backend (tests / runtime injection). None reloads from env."""

    global _ACTIVE
    _ACTIVE = backend


def detection_to_subject_dict(detection: VisionDetection) -> dict[str, Any]:
    return {
        "type": detection.label,
        "bbox_norm": detection.bbox_norm,
        "center_norm": detection.center_norm,
        "pose_hint": detection.pose_hint,
        "detection_confidence": detection.confidence,
        "vision_backend": detection.backend,
    }
