"""Fuse a metric depth map (Depth Anything V2) with the pinhole height prior."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Sequence

from flyvision.spatial import SpatialFix, estimate_spatial

DepthSource = Literal["pinhole", "metric", "fused"]


@dataclass(frozen=True)
class FusedRange:
    distance_m: float
    pinhole_m: float | None
    metric_m: float | None
    source: DepthSource
    agree: bool
    note: str


def box_median_depth(
    depth_m: Sequence[Sequence[float]],
    box: tuple[float, float, float, float],
) -> float | None:
    """Median metric depth inside a normalized YOLO box. Prefer median over mean."""

    if not depth_m or not depth_m[0]:
        return None
    height = len(depth_m)
    width = len(depth_m[0])
    x, y, w, h = box
    x0 = max(0, min(width - 1, int(x * width)))
    y0 = max(0, min(height - 1, int(y * height)))
    x1 = max(x0 + 1, min(width, int((x + w) * width)))
    y1 = max(y0 + 1, min(height, int((y + h) * height)))
    values = [
        depth_m[row][col]
        for row in range(y0, y1)
        for col in range(x0, x1)
        if depth_m[row][col] > 0
    ]
    if not values:
        return None
    values.sort()
    mid = len(values) // 2
    if len(values) % 2 == 0:
        return (values[mid - 1] + values[mid]) / 2.0
    return values[mid]


def fuse_range(
    pinhole_m: float | None,
    metric_m: float | None,
    *,
    agree_tol: float = 0.35,
) -> FusedRange:
    if pinhole_m is None and metric_m is None:
        return FusedRange(1.0, None, None, "pinhole", False, "没有可用距离")
    if pinhole_m is None:
        return FusedRange(metric_m or 1.0, None, metric_m, "metric", True, "仅深度图")
    if metric_m is None:
        return FusedRange(pinhole_m, pinhole_m, None, "pinhole", True, "仅身高先验")
    gap = abs(pinhole_m - metric_m) / max(pinhole_m, metric_m)
    agree = gap <= agree_tol
    if agree:
        fused = 0.45 * pinhole_m + 0.55 * metric_m
        return FusedRange(fused, pinhole_m, metric_m, "fused", True, "先验与深度一致")
    return FusedRange(
        pinhole_m,
        pinhole_m,
        metric_m,
        "pinhole",
        False,
        "深度与先验差太大，保留身高先验",
    )


def fuse_detection(
    label: str,
    box: tuple[float, float, float, float],
    depth_m: Sequence[Sequence[float]] | None,
    *,
    aspect: float = 16 / 9,
    hfov_deg: float = 70.0,
    person_height_m: float = 1.7,
) -> tuple[SpatialFix | None, FusedRange]:
    prior = estimate_spatial(
        label,
        box,
        aspect=aspect,
        hfov_deg=hfov_deg,
        person_height_m=person_height_m,
    )
    metric = box_median_depth(depth_m, box) if depth_m is not None else None
    fused = fuse_range(prior.distance_m if prior else None, metric)
    if prior is None:
        return None, fused
    return (
        SpatialFix(
            distance_m=fused.distance_m,
            right_m=prior.right_m * (fused.distance_m / prior.distance_m),
            up_m=prior.up_m * (fused.distance_m / prior.distance_m),
            heading=prior.heading,
            crop=prior.crop,
            confidence="high" if fused.agree else "medium",
            used_height_m=prior.used_height_m,
        ),
        fused,
    )


def infer_dav2_metric(
    image_path: str | Path,
    *,
    checkpoint: str | Path | None = None,
    encoder: str = "vits",
    max_depth: float = 80.0,
) -> list[list[float]]:
    """Run Depth Anything V2 Metric (outdoor VKITTI) if the checkpoint is present."""

    weights = Path(checkpoint or _default_checkpoint())
    if not weights.is_file():
        raise FileNotFoundError(
            "Depth Anything V2 Metric checkpoint missing. "
            "Download depth_anything_v2_metric_vkitti_vits.pth "
            f"and pass --checkpoint (looked in {weights})."
        )
    try:
        import cv2  # type: ignore
        import torch
        from depth_anything_v2.dpt import DepthAnythingV2  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "Install the Depth-Anything-V2 package and torch to run metric depth."
        ) from exc
    configs = {
        "vits": {"encoder": "vits", "features": 64, "out_channels": [48, 96, 192, 384]},
        "vitb": {"encoder": "vitb", "features": 128, "out_channels": [96, 192, 384, 768]},
        "vitl": {"encoder": "vitl", "features": 256, "out_channels": [256, 512, 1024, 1024]},
    }
    model = DepthAnythingV2(**{**configs[encoder], "max_depth": max_depth})
    model.load_state_dict(torch.load(weights, map_location="cpu"))
    model.eval()
    image = cv2.imread(str(image_path))
    depth = model.infer_image(image)
    return depth.tolist()


def _default_checkpoint() -> Path:
    return (
        Path(__file__).resolve().parents[2]
        / "data"
        / "models"
        / "depth_anything_v2_metric_vkitti_vits.pth"
    )
