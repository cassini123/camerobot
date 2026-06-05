"""Typed data models for the Camerobot MVP0 pipeline."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from enum import StrEnum
from typing import Any


class Intent(StrEnum):
    """Supported first-pass user intents."""

    REPLICATE_COMPOSITION = "replicate_composition"
    IMPROVE_PORTRAIT = "improve_portrait"
    VLOG_FOLLOW = "vlog_follow"
    PRODUCT_SHOOT = "product_shoot"
    DRONE_REVEAL = "drone_reveal"


class OutputType(StrEnum):
    """Supported output modes."""

    PORTRAIT_PHOTO = "portrait_photo"
    SHORT_VIDEO = "short_video"
    PRODUCT_PHOTO = "product_photo"
    EVENT_HIGHLIGHT = "event_highlight"


class DisplayState(StrEnum):
    """Face display states shown on the robot eyes."""

    IDLE_COMPANION = "idle_companion"
    FRAMING = "framing"
    COUNTDOWN = "countdown"
    CAPTURING = "capturing"
    CAPTURE_DONE = "capture_done"
    PREVIEW = "preview"
    GUIDANCE = "guidance"
    PRIVACY = "privacy"
    SAFETY = "safety"


@dataclass(frozen=True)
class ReferenceAsset:
    """A local reference image or video registered for planning."""

    asset_id: str
    path: str
    media_type: str
    size_bytes: int
    width: int | None = None
    height: int | None = None


@dataclass(frozen=True)
class ShotConstraints:
    """Safety and execution constraints for a shot request."""

    indoor: bool = True
    max_distance_m: float = 4.0
    use_drone: bool = False
    allow_arm_motion: bool = True
    allow_lighting_adjustment: bool = True


@dataclass(frozen=True)
class ShotRequest:
    """User intent plus execution constraints."""

    reference_asset_id: str
    intent: Intent = Intent.REPLICATE_COMPOSITION
    output: OutputType = OutputType.PORTRAIT_PHOTO
    constraints: ShotConstraints = field(default_factory=ShotConstraints)


@dataclass(frozen=True)
class ReferenceAnalysis:
    """Structured interpretation of a reference image/video."""

    asset_id: str
    subject: dict[str, Any]
    composition: dict[str, Any]
    camera: dict[str, Any]
    lighting: dict[str, Any]
    motion: dict[str, Any]
    confidence: float


@dataclass(frozen=True)
class DisplayEvent:
    """An event rendered on the robot's eye display."""

    target: str
    state: DisplayState
    message: str
    preview_asset_id: str | None = None
    actions: list[dict[str, str]] = field(default_factory=list)
    timeout_ms: int | None = None


@dataclass(frozen=True)
class ShotPlan:
    """A hardware-agnostic plan for robot body and camera execution."""

    base: dict[str, Any]
    lift: dict[str, Any]
    head: dict[str, Any]
    camera: dict[str, Any]
    arm: dict[str, Any]
    lights: list[dict[str, Any]]
    display_events: list[DisplayEvent]
    safety: dict[str, Any]
    drone: dict[str, Any] | None = None


def to_jsonable(value: Any) -> Any:
    """Convert dataclasses and enums into JSON-serializable values."""

    if isinstance(value, StrEnum):
        return str(value)
    if is_dataclass(value):
        return {key: to_jsonable(item) for key, item in asdict(value).items()}
    if isinstance(value, dict):
        return {key: to_jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    return value
