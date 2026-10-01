"""Pluggable vision backends for subject detection and framing cues."""

from camerobot.vision.backend import (
    VisionBackend,
    VisionDetection,
    get_vision_backend,
    set_vision_backend,
)

__all__ = [
    "VisionBackend",
    "VisionDetection",
    "get_vision_backend",
    "set_vision_backend",
]
