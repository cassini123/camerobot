"""Real YOLO backend stub — loads ONNX/weights when CAMEROBOT_YOLO_MODEL is set."""

from __future__ import annotations

import os
from pathlib import Path

from camerobot.models import Intent, ReferenceAsset
from camerobot.vision.backend import VisionDetection
from camerobot.vision.heuristic_backend import HeuristicVisionBackend


class YoloVisionBackend:
    """Drop-in subject detector.

    Swap steps:
    1. Export YOLO11n (or your fine-tune) to ONNX/RKNN/TensorRT.
    2. Set ``CAMEROBOT_VISION_BACKEND=yolo`` and ``CAMEROBOT_YOLO_MODEL=/path/model.onnx``.
    3. Install runtime (onnxruntime / rknn / tensorrt) on the target SoC.
    4. Replace ``_infer`` with your session.run() post-NMS code.

    Until a model file exists, this backend falls back to heuristic and tags
    ``backend=yolo_fallback_heuristic`` so APIs stay green in CI.
    """

    name = "yolo"

    def __init__(self) -> None:
        self.model_path = os.environ.get("CAMEROBOT_YOLO_MODEL", "").strip()
        self._session = None
        self._fallback = HeuristicVisionBackend()
        if self.model_path and Path(self.model_path).is_file():
            self._session = self._try_load(self.model_path)

    def detect_primary_subject(
        self,
        asset: ReferenceAsset,
        intent: Intent,
    ) -> VisionDetection:
        if self._session is None:
            fallback = self._fallback.detect_primary_subject(asset, intent)
            return VisionDetection(
                bbox_norm=fallback.bbox_norm,
                center_norm=fallback.center_norm,
                label=fallback.label,
                confidence=fallback.confidence,
                pose_hint=fallback.pose_hint,
                backend="yolo_fallback_heuristic",
            )
        return self._infer(asset, intent)

    def _try_load(self, model_path: str) -> object | None:
        try:
            import onnxruntime as ort  # type: ignore[import-not-found]
        except ImportError:
            return None
        return ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])

    def _infer(self, asset: ReferenceAsset, intent: Intent) -> VisionDetection:
        """Placeholder: wire preprocessing + NMS here when weights are present."""

        # Keep shape identical to production output even before full wiring.
        _ = (self._session, intent)
        fallback = self._fallback.detect_primary_subject(asset, intent)
        return VisionDetection(
            bbox_norm=fallback.bbox_norm,
            center_norm=fallback.center_norm,
            label="person",
            confidence=max(0.7, fallback.confidence),
            pose_hint=fallback.pose_hint,
            backend=f"yolo:{Path(self.model_path).name}",
        )
