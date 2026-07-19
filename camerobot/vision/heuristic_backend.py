"""Deterministic placeholder detector (no neural weights)."""

from __future__ import annotations

from camerobot.models import Intent, ReferenceAsset
from camerobot.vision.backend import VisionDetection


class HeuristicVisionBackend:
    """Rule-based box from aspect ratio / intent — contract stand-in for YOLO."""

    name = "heuristic"

    def detect_primary_subject(
        self,
        asset: ReferenceAsset,
        intent: Intent,
    ) -> VisionDetection:
        width = asset.width or 1080
        height = asset.height or 1350
        orientation = (
            "square"
            if width == height
            else "landscape"
            if width > height
            else "portrait"
        )
        if orientation == "landscape":
            box = [0.34, 0.18, 0.28, 0.68]
        elif orientation == "square":
            box = [0.3, 0.16, 0.4, 0.72]
        else:
            box = [0.24, 0.16, 0.52, 0.72]

        if intent == Intent.PRODUCT_SHOOT:
            box = [0.3, 0.28, 0.4, 0.45]

        center = [
            round(box[0] + box[2] / 2, 3),
            round(box[1] + box[3] / 2, 3),
        ]
        return VisionDetection(
            bbox_norm=box,
            center_norm=center,
            label="person_or_primary_object",
            confidence=0.55 if asset.width and asset.height else 0.4,
            pose_hint="standing_or_presenting",
            backend=self.name,
        )
