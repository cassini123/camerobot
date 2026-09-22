"""Layer 3: shot matching via HSV histogram + composition vector."""

from __future__ import annotations

from dataclasses import dataclass
from math import sqrt
from typing import Protocol, Sequence

from flyvision.image import RgbImage, iter_sampled_pixels
from flyvision.preprocess import prepare_frame
from flyvision.scene import Detection, primary_detection
from flyvision.shots import ShotRecord, load_reference_image

HIST_H_BINS = 16
HIST_S_BINS = 4
HIST_V_BINS = 4
HIST_SIZE = HIST_H_BINS * HIST_S_BINS * HIST_V_BINS
DEFAULT_HIST_WEIGHT = 0.6
DEFAULT_COMP_WEIGHT = 0.4
DEFAULT_MATCH_THRESHOLD = 0.85


@dataclass(frozen=True)
class FrameFeatures:
    """Replaceable descriptor. Swap this out for ORB / MobileNet / ESP-DL."""

    histogram: tuple[float, ...]
    subject_center: tuple[float, float]
    subject_area: float


@dataclass(frozen=True)
class MatchResult:
    shot_id: str
    similarity: float
    histogram_similarity: float
    composition_similarity: float
    scene_match: bool
    features: FrameFeatures


class FeatureExtractor(Protocol):
    def extract(
        self,
        image: RgbImage,
        detections: Sequence[Detection],
        target_type: str,
    ) -> FrameFeatures:
        ...


class HistogramFeatureExtractor:
    """HSV histogram on the 256×256 AI crop, plus subject center / area."""

    def extract(
        self,
        image: RgbImage,
        detections: Sequence[Detection],
        target_type: str,
    ) -> FrameFeatures:
        prepared = prepare_frame(image)
        histogram = hsv_histogram(prepared.ai)
        subject = primary_detection(detections, target_type)
        if subject is None:
            center = (0.5, 0.5)
            area = 0.0
        else:
            center = subject.center_norm
            area = subject.area_ratio
        return FrameFeatures(
            histogram=histogram,
            subject_center=center,
            subject_area=area,
        )


def hsv_histogram(image: RgbImage, step: int = 2) -> tuple[float, ...]:
    bins = [0.0] * HIST_SIZE
    count = 0
    for r, g, b in iter_sampled_pixels(image, step=step):
        h_bin, s_bin, v_bin = _rgb_to_hsv_bins(r, g, b)
        bins[(h_bin * HIST_S_BINS + s_bin) * HIST_V_BINS + v_bin] += 1.0
        count += 1
    if count:
        scale = 1.0 / count
        bins = [value * scale for value in bins]
    return tuple(bins)


def histogram_correlation(left: Sequence[float], right: Sequence[float]) -> float:
    """OpenCV `HISTCMP_CORREL`, mapped from [-1, 1] into [0, 1]."""

    if len(left) != len(right):
        raise ValueError("histogram lengths must match")
    n = len(left)
    if n == 0:
        return 0.0
    mean_l = sum(left) / n
    mean_r = sum(right) / n
    num = 0.0
    den_l = 0.0
    den_r = 0.0
    for a, b in zip(left, right, strict=True):
        da = a - mean_l
        db = b - mean_r
        num += da * db
        den_l += da * da
        den_r += db * db
    denom = sqrt(den_l * den_r)
    if denom == 0:
        return 1.0 if num == 0 else 0.0
    corr = max(-1.0, min(1.0, num / denom))
    return (corr + 1.0) / 2.0


def composition_similarity(
    current: tuple[float, float, float],
    reference: tuple[float, float, float],
) -> float:
    """1 - clamped L2 on (cx, cy, area)."""

    dist = sqrt(sum((a - b) ** 2 for a, b in zip(current, reference, strict=True)))
    return max(0.0, 1.0 - dist / 1.2)


def feature_similarity(
    current: FrameFeatures,
    reference: FrameFeatures,
    *,
    hist_weight: float = DEFAULT_HIST_WEIGHT,
    comp_weight: float = DEFAULT_COMP_WEIGHT,
) -> tuple[float, float, float]:
    hist = histogram_correlation(current.histogram, reference.histogram)
    comp = composition_similarity(
        (*current.subject_center, current.subject_area),
        (*reference.subject_center, reference.subject_area),
    )
    total = hist_weight + comp_weight
    if total <= 0:
        raise ValueError("weights must sum to a positive value")
    combined = (hist_weight * hist + comp_weight * comp) / total
    return combined, hist, comp


def features_for_shot(
    shot: ShotRecord,
    extractor: FeatureExtractor | None = None,
    detections: Sequence[Detection] | None = None,
) -> FrameFeatures:
    """Build the reference descriptor. No still? Fall back to composition only."""

    extractor = extractor or HistogramFeatureExtractor()
    image = load_reference_image(shot)
    if image is None:
        histogram = tuple(1.0 / HIST_SIZE for _ in range(HIST_SIZE))
        return FrameFeatures(
            histogram=histogram,
            subject_center=shot.composition_target,
            subject_area=shot.subject_ratio,
        )
    return extractor.extract(image, detections or [], shot.target_type)


def match_shot(
    image: RgbImage,
    shot: ShotRecord,
    detections: Sequence[Detection],
    *,
    extractor: FeatureExtractor | None = None,
    reference: FrameFeatures | None = None,
    threshold: float = DEFAULT_MATCH_THRESHOLD,
) -> MatchResult:
    extractor = extractor or HistogramFeatureExtractor()
    reference = reference or features_for_shot(shot, extractor)
    current = extractor.extract(image, detections, shot.target_type)
    combined, hist, comp = feature_similarity(current, reference)
    return MatchResult(
        shot_id=shot.shot_id,
        similarity=combined,
        histogram_similarity=hist,
        composition_similarity=comp,
        scene_match=combined >= threshold,
        features=current,
    )


def best_shot(
    image: RgbImage,
    shots: Sequence[ShotRecord],
    detections: Sequence[Detection],
    *,
    extractor: FeatureExtractor | None = None,
    references: dict[str, FrameFeatures] | None = None,
    threshold: float = DEFAULT_MATCH_THRESHOLD,
) -> MatchResult:
    if not shots:
        raise ValueError("shot database is empty")
    ranked = [
        match_shot(
            image,
            shot,
            detections,
            extractor=extractor,
            reference=(references or {}).get(shot.shot_id),
            threshold=threshold,
        )
        for shot in shots
    ]
    return max(ranked, key=lambda item: item.similarity)


def _rgb_to_hsv_bins(r: int, g: int, b: int) -> tuple[int, int, int]:
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    mx = max(rf, gf, bf)
    mn = min(rf, gf, bf)
    diff = mx - mn
    if diff == 0:
        hue = 0.0
    elif mx == rf:
        hue = (60.0 * ((gf - bf) / diff) + 360.0) % 360.0
    elif mx == gf:
        hue = 60.0 * ((bf - rf) / diff) + 120.0
    else:
        hue = 60.0 * ((rf - gf) / diff) + 240.0
    sat = 0.0 if mx == 0 else diff / mx
    val = mx
    h_bin = min(HIST_H_BINS - 1, int(hue / 360.0 * HIST_H_BINS))
    s_bin = min(HIST_S_BINS - 1, int(sat * HIST_S_BINS))
    v_bin = min(HIST_V_BINS - 1, int(val * HIST_V_BINS))
    return h_bin, s_bin, v_bin
