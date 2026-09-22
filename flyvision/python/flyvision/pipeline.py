"""End-to-end PC vision loop: frame → detect → match → compose → GO."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from flyvision.capture import (
    CAPTURE_GO,
    CONTINUE_FOLLOW,
    DEFAULT_STABLE_FRAMES,
    StabilityTracker,
    decide,
    save_capture,
)
from flyvision.composition import (
    DEFAULT_COMPOSITION_DELTA,
    CompositionResult,
    judge_composition,
)
from flyvision.image import RgbImage
from flyvision.match import (
    DEFAULT_MATCH_THRESHOLD,
    FeatureExtractor,
    HistogramFeatureExtractor,
    MatchResult,
    best_shot,
    features_for_shot,
    match_shot,
)
from flyvision.scene import Detection, Detector, StubDetector, primary_detection
from flyvision.shots import ShotRecord, load_shot_database, shot_by_id


@dataclass(frozen=True)
class FrameVerdict:
    active_shot: str
    similarity: float
    dx: float
    dy: float
    composition_ok: bool
    scene_match: bool
    stable: bool
    decision: str
    detections: tuple[Detection, ...]
    match: MatchResult
    composition: CompositionResult
    capture_path: Path | None = None

    def as_row(self) -> str:
        return (
            f"shot={self.active_shot} sim={self.similarity:.3f} "
            f"dx={self.dx:+.3f} dy={self.dy:+.3f} "
            f"COMPOSITION_OK={self.composition_ok} "
            f"stable={self.stable} decision={self.decision}"
        )


class VisionPipeline:
    """Stateful matcher. Inject a Detector in tests; HOG/OpenCV in production."""

    def __init__(
        self,
        shots: list[ShotRecord],
        *,
        detector: Detector | None = None,
        extractor: FeatureExtractor | None = None,
        active_shot: str | None = None,
        threshold: float = DEFAULT_MATCH_THRESHOLD,
        composition_delta: float = DEFAULT_COMPOSITION_DELTA,
        stable_frames: int = DEFAULT_STABLE_FRAMES,
        capture_dir: str | Path | None = None,
    ) -> None:
        if not shots:
            raise ValueError("shot database is empty")
        self.shots = list(shots)
        self.detector = detector or StubDetector()
        self.extractor = extractor or HistogramFeatureExtractor()
        self.threshold = threshold
        self.composition_delta = composition_delta
        self.capture_dir = Path(capture_dir) if capture_dir else None
        self.tracker = StabilityTracker(needed=stable_frames)
        self.capture_index = 0
        self.references = {
            shot.shot_id: features_for_shot(shot, self.extractor) for shot in self.shots
        }
        self.active_id = active_shot or self.shots[0].shot_id
        shot_by_id(self.shots, self.active_id)

    @classmethod
    def from_json(
        cls,
        path: str | Path,
        **kwargs,
    ) -> "VisionPipeline":
        return cls(load_shot_database(path), **kwargs)

    def push(self, image: RgbImage, *, auto_select: bool = False) -> FrameVerdict:
        detections = tuple(self.detector.detect(image))
        if auto_select:
            match = best_shot(
                image,
                self.shots,
                detections,
                extractor=self.extractor,
                references=self.references,
                threshold=self.threshold,
            )
            shot = shot_by_id(self.shots, match.shot_id)
            self.active_id = shot.shot_id
        else:
            shot = shot_by_id(self.shots, self.active_id)
            match = match_shot(
                image,
                shot,
                detections,
                extractor=self.extractor,
                reference=self.references.get(shot.shot_id),
                threshold=self.threshold,
            )
        subject = primary_detection(detections, shot.target_type)
        composition = judge_composition(
            shot,
            subject,
            delta=self.composition_delta,
        )
        decision, stable = decide(
            scene_match=match.scene_match,
            composition_ok=composition.composition_ok,
            tracker=self.tracker,
        )
        capture_path = None
        if decision == CAPTURE_GO and self.capture_dir is not None:
            self.capture_index += 1
            capture_path = save_capture(
                image,
                shot.shot_id,
                self.capture_dir,
                index=self.capture_index,
            )
        return FrameVerdict(
            active_shot=shot.shot_id,
            similarity=match.similarity,
            dx=composition.dx,
            dy=composition.dy,
            composition_ok=composition.composition_ok,
            scene_match=match.scene_match,
            stable=stable,
            decision=decision,
            detections=detections,
            match=match,
            composition=composition,
            capture_path=capture_path,
        )


def evaluate_image(
    image: RgbImage,
    shots: list[ShotRecord],
    *,
    detections: list[Detection] | None = None,
    active_shot: str | None = None,
    stable_frames: int = 1,
    **kwargs,
) -> FrameVerdict:
    """One-shot helper used by CLI `image` and unit tests."""

    pipeline = VisionPipeline(
        shots,
        detector=StubDetector(detections or []),
        active_shot=active_shot,
        stable_frames=stable_frames,
        **kwargs,
    )
    # Drive the tracker to a decision in one call when stable_frames==1.
    verdict = pipeline.push(image)
    if verdict.decision == CONTINUE_FOLLOW and stable_frames <= 1:
        return verdict
    return verdict
