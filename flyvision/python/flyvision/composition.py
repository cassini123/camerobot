"""Layer 4: composition — is the subject where the shot says it should be?"""

from __future__ import annotations

from dataclasses import dataclass

from flyvision.scene import Detection
from flyvision.shots import ShotRecord

DEFAULT_COMPOSITION_DELTA = 0.05


@dataclass(frozen=True)
class CompositionResult:
    dx: float
    dy: float
    composition_ok: bool
    target: tuple[float, float]
    current: tuple[float, float] | None


def judge_composition(
    shot: ShotRecord,
    subject: Detection | None,
    *,
    delta: float = DEFAULT_COMPOSITION_DELTA,
) -> CompositionResult:
    target = shot.composition_target
    if subject is None:
        return CompositionResult(
            dx=1.0,
            dy=1.0,
            composition_ok=False,
            target=target,
            current=None,
        )
    cx, cy = subject.center_norm
    dx = cx - target[0]
    dy = cy - target[1]
    return CompositionResult(
        dx=dx,
        dy=dy,
        composition_ok=abs(dx) <= delta and abs(dy) <= delta,
        target=target,
        current=(cx, cy),
    )
