"""Layer 5: Capture GO when match + composition stay true for N frames."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from flyvision.image import RgbImage, save_image

CONTINUE_FOLLOW = "CONTINUE_FOLLOW"
CAPTURE_GO = "CAPTURE_GO"
DEFAULT_STABLE_FRAMES = 8


@dataclass
class StabilityTracker:
    """Count consecutive ready frames. Resets on GO so we do not dump every frame."""

    needed: int = DEFAULT_STABLE_FRAMES
    count: int = 0

    def update(self, ready: bool) -> bool:
        if ready:
            self.count += 1
        else:
            self.count = 0
        return self.count >= self.needed

    def reset(self) -> None:
        self.count = 0


def decide(
    *,
    scene_match: bool,
    composition_ok: bool,
    tracker: StabilityTracker,
) -> tuple[str, bool]:
    """Return (decision, stable)."""

    ready = scene_match and composition_ok
    stable = tracker.update(ready)
    if stable:
        tracker.reset()
        return CAPTURE_GO, True
    return CONTINUE_FOLLOW, stable


def save_capture(
    image: RgbImage,
    shot_id: str,
    directory: str | Path,
    *,
    index: int = 1,
) -> Path:
    """Write a GO frame. BMP so it works without OpenCV."""

    dest_dir = Path(directory)
    dest_dir.mkdir(parents=True, exist_ok=True)
    path = dest_dir / f"{shot_id}_{index:04d}.bmp"
    while path.exists():
        index += 1
        path = dest_dir / f"{shot_id}_{index:04d}.bmp"
    return save_image(image, path)
