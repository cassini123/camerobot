"""Layer 2: scene understanding. Phase 1 only needs Person (+ optional Building)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, Sequence

from flyvision.image import RgbImage


@dataclass(frozen=True)
class Detection:
    """Axis-aligned box in normalized image coordinates (x, y, w, h)."""

    label: str
    bbox_norm: tuple[float, float, float, float]
    confidence: float = 1.0

    @property
    def center_norm(self) -> tuple[float, float]:
        x, y, w, h = self.bbox_norm
        return (x + w / 2.0, y + h / 2.0)

    @property
    def area_ratio(self) -> float:
        return max(0.0, self.bbox_norm[2] * self.bbox_norm[3])


class Detector(Protocol):
    """Replaceable detector. HOG now; YOLO / ESP-DL later."""

    def detect(self, image: RgbImage) -> list[Detection]:
        ...


class StubDetector:
    """Injected detections for tests and for running without OpenCV."""

    def __init__(self, detections: Sequence[Detection] | None = None) -> None:
        self._detections = list(detections or [])

    def detect(self, image: RgbImage) -> list[Detection]:
        del image
        return list(self._detections)


class HogPersonDetector:
    """OpenCV HOG pedestrian detector. Building is left as a later stub."""

    def __init__(self, win_stride: tuple[int, int] = (8, 8)) -> None:
        cv2, _np = _cv2()
        hog = cv2.HOGDescriptor()
        hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        self._hog = hog
        self._cv2 = cv2
        self._win_stride = win_stride

    def detect(self, image: RgbImage) -> list[Detection]:
        import numpy as np

        array = np.frombuffer(image.pixels, dtype=np.uint8).reshape(
            (image.height, image.width, 3)
        )
        bgr = array[:, :, ::-1].copy()
        boxes, weights = self._hog.detectMultiScale(
            bgr,
            winStride=self._win_stride,
            padding=(8, 8),
            scale=1.05,
        )
        detections: list[Detection] = []
        for box, weight in zip(boxes, weights, strict=False):
            x, y, w, h = (int(v) for v in box)
            score = float(weight[0] if hasattr(weight, "__len__") else weight)
            detections.append(
                Detection(
                    label="person",
                    bbox_norm=(
                        x / image.width,
                        y / image.height,
                        w / image.width,
                        h / image.height,
                    ),
                    confidence=max(0.0, min(1.0, score / 2.0)),
                )
            )
        return detections


def default_detector() -> Detector:
    """HOG when OpenCV is installed; otherwise an empty stub."""

    try:
        return HogPersonDetector()
    except RuntimeError:
        return StubDetector()


def primary_detection(
    detections: Sequence[Detection],
    target_type: str,
) -> Detection | None:
    """Pick the largest box matching the shot target (person / building)."""

    wanted = "person" if target_type in {"person", "character"} else target_type
    matches = [item for item in detections if item.label == wanted]
    if not matches and wanted != "person":
        matches = [item for item in detections if item.label == "person"]
    if not matches:
        return None
    return max(matches, key=lambda item: (item.area_ratio, item.confidence))


def _cv2():
    try:
        import cv2
        import numpy as np
    except ImportError as exc:  # pragma: no cover - optional extra
        raise RuntimeError(
            "OpenCV is required for HogPersonDetector. "
            'Install with: pip install -e ".[flyvision]"'
        ) from exc
    return cv2, np
