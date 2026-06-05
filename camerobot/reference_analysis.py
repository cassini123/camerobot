"""Reference image analysis for the MVP0 planning loop.

This module intentionally uses deterministic heuristics instead of real computer
vision models. The goal is to lock down the software contract first: future
image segmentation, pose estimation, depth, and lighting models can replace the
implementation while preserving the same `ReferenceAnalysis` output shape.
"""

from __future__ import annotations

from camerobot.models import Intent, ReferenceAnalysis, ReferenceAsset


def analyze_reference(asset: ReferenceAsset, intent: Intent) -> ReferenceAnalysis:
    """Create a structured analysis from a registered reference asset."""

    width = asset.width or 1080
    height = asset.height or 1350
    orientation = _orientation(width, height)
    aspect_ratio = round(width / height, 3)
    subject_box = _default_subject_box(orientation)
    shot_size = _shot_size_for_intent(intent, orientation)

    return ReferenceAnalysis(
        asset_id=asset.asset_id,
        subject={
            "type": "person_or_primary_object",
            "bbox_norm": subject_box,
            "center_norm": [
                round(subject_box[0] + subject_box[2] / 2, 3),
                round(subject_box[1] + subject_box[3] / 2, 3),
            ],
            "pose_hint": "standing_or_presenting",
        },
        composition={
            "orientation": orientation,
            "aspect_ratio": aspect_ratio,
            "shot_size": shot_size,
            "headroom_ratio": 0.08 if shot_size != "wide" else 0.14,
            "negative_space": "right" if intent == Intent.PRODUCT_SHOOT else "balanced",
            "horizon_hint": "middle_third",
            "foreground_midground_background": True,
        },
        camera={
            "angle": _camera_angle_for_intent(intent),
            "focal_length_hint": _focal_length_for_intent(intent),
            "height_m": _camera_height_for_shot(shot_size),
            "distance_m": _camera_distance_for_shot(shot_size),
            "perspective": "natural",
        },
        lighting={
            "key_direction": "front_left",
            "fill_direction": "front_right",
            "back_light": intent in {Intent.IMPROVE_PORTRAIT, Intent.PRODUCT_SHOOT},
            "softness": "soft",
            "temperature_k": 5200,
            "contrast": "medium",
        },
        motion={
            "type": _motion_for_intent(intent),
            "needs_arm": intent in {Intent.DRONE_REVEAL, Intent.IMPROVE_PORTRAIT},
            "needs_drone": intent == Intent.DRONE_REVEAL,
        },
        confidence=0.62 if asset.width and asset.height else 0.45,
    )


def _orientation(width: int, height: int) -> str:
    if width == height:
        return "square"
    return "landscape" if width > height else "portrait"


def _default_subject_box(orientation: str) -> list[float]:
    if orientation == "landscape":
        return [0.34, 0.18, 0.28, 0.68]
    if orientation == "square":
        return [0.3, 0.16, 0.4, 0.72]
    return [0.24, 0.16, 0.52, 0.72]


def _shot_size_for_intent(intent: Intent, orientation: str) -> str:
    if intent == Intent.PRODUCT_SHOOT:
        return "medium"
    if intent == Intent.VLOG_FOLLOW:
        return "medium_wide"
    if intent == Intent.DRONE_REVEAL:
        return "wide"
    if orientation == "portrait":
        return "medium"
    return "medium_wide"


def _camera_angle_for_intent(intent: Intent) -> str:
    if intent == Intent.DRONE_REVEAL:
        return "high_angle"
    if intent == Intent.PRODUCT_SHOOT:
        return "slightly_high"
    return "eye_level"


def _focal_length_for_intent(intent: Intent) -> str:
    if intent == Intent.VLOG_FOLLOW:
        return "wide"
    if intent == Intent.PRODUCT_SHOOT:
        return "normal_to_short_telephoto"
    if intent == Intent.DRONE_REVEAL:
        return "wide"
    return "normal"


def _camera_height_for_shot(shot_size: str) -> float:
    return {
        "wide": 1.8,
        "medium_wide": 1.55,
        "medium": 1.5,
    }.get(shot_size, 1.55)


def _camera_distance_for_shot(shot_size: str) -> float:
    return {
        "wide": 3.2,
        "medium_wide": 2.2,
        "medium": 1.6,
    }.get(shot_size, 2.0)


def _motion_for_intent(intent: Intent) -> str:
    return {
        Intent.DRONE_REVEAL: "drone_reveal_to_ground_follow",
        Intent.VLOG_FOLLOW: "follow",
        Intent.IMPROVE_PORTRAIT: "subtle_jib_reveal",
        Intent.PRODUCT_SHOOT: "locked_off_or_slow_push",
        Intent.REPLICATE_COMPOSITION: "locked_off",
    }[intent]
