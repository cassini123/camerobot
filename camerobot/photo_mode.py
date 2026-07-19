"""Photo mode: upload a still and parse viewpoint / subject / light / look / color.

Uses deterministic heuristics plus optional PNG RGB sampling. Real YOLO / lighting
models can replace the internals while keeping `PhotoModeResult` stable.
"""

from __future__ import annotations

from camerobot.assets import register_reference_asset
from camerobot.image_stats import sample_image_look
from camerobot.models import Intent, ReferenceAnalysis, ReferenceAsset, to_jsonable
from camerobot.reference_analysis import analyze_reference


def run_photo_mode(
    asset_path: str,
    *,
    intent: Intent = Intent.REPLICATE_COMPOSITION,
) -> dict[str, object]:
    """Analyze one reference photo into replicate-ready structured fields."""

    asset = register_reference_asset(asset_path)
    analysis = analyze_reference(asset, intent)
    stats = sample_image_look(asset.path)
    result = build_photo_mode_result(asset, analysis, stats)
    return {
        "mode": "photo",
        "asset": asset,
        "photo": result,
        "analysis": analysis,
    }


def build_photo_mode_result(
    asset: ReferenceAsset,
    analysis: ReferenceAnalysis,
    stats: dict[str, object] | None,
) -> dict[str, object]:
    lighting = _enrich_lighting(analysis.lighting, stats)
    color = _estimate_color(stats, lighting)
    look = _estimate_look(analysis, color, stats)
    viewpoint = {
        "angle": analysis.camera["angle"],
        "height_m": analysis.camera["height_m"],
        "distance_m": analysis.camera["distance_m"],
        "focal_length_hint": analysis.camera["focal_length_hint"],
        "perspective": analysis.camera["perspective"],
        "shot_size": analysis.composition["shot_size"],
        "orientation": analysis.composition["orientation"],
        "aspect_ratio": analysis.composition["aspect_ratio"],
    }
    subject = {
        "type": analysis.subject["type"],
        "bbox_norm": analysis.subject["bbox_norm"],
        "center_norm": analysis.subject["center_norm"],
        "pose_hint": analysis.subject["pose_hint"],
        "area_ratio": round(
            float(analysis.subject["bbox_norm"][2])
            * float(analysis.subject["bbox_norm"][3]),
            3,
        ),
        "headroom_ratio": analysis.composition["headroom_ratio"],
        "negative_space": analysis.composition["negative_space"],
    }
    replicate_targets = {
        "match_subject_center_norm": subject["center_norm"],
        "match_subject_area_ratio": subject["area_ratio"],
        "match_headroom_ratio": subject["headroom_ratio"],
        "match_camera_height_m": viewpoint["height_m"],
        "match_camera_distance_m": viewpoint["distance_m"],
        "match_key_direction": lighting["key_direction"],
        "match_temperature_k": lighting["temperature_k"],
        "match_color_grade": color["grade_hint"],
        "match_look": look["effect_summary"],
    }
    confidence = analysis.confidence
    if stats:
        confidence = min(0.9, confidence + 0.12)

    return {
        "viewpoint": viewpoint,
        "subject": subject,
        "lighting": lighting,
        "look": look,
        "color": color,
        "replicate_targets": replicate_targets,
        "confidence": round(confidence, 3),
        "source_stats": stats,
        "notes": [
            "Heuristic photo parse for contract lock-in.",
            "Replace subject/lighting estimators with edge CV when available.",
        ],
    }


def _enrich_lighting(
    base: dict[str, object],
    stats: dict[str, object] | None,
) -> dict[str, object]:
    lighting = dict(base)
    if not stats:
        lighting["estimation"] = "heuristic_default"
        return lighting

    left = float(stats["left_brightness"])
    right = float(stats["right_brightness"])
    brightness = float(stats["brightness"])
    delta = left - right

    if abs(delta) < 0.04:
        key = "front"
        fill = "front"
    elif delta > 0:
        key = "front_left"
        fill = "front_right"
    else:
        key = "front_right"
        fill = "front_left"

    if brightness < 0.28:
        contrast = "high"
        softness = "hard"
    elif brightness > 0.72:
        contrast = "low"
        softness = "soft"
    else:
        contrast = "medium"
        softness = "soft"

    avg_r, avg_g, avg_b = stats["avg_rgb"]  # type: ignore[misc]
    temperature_k = _rgb_to_temperature_k(int(avg_r), int(avg_g), int(avg_b))

    lighting.update(
        {
            "key_direction": key,
            "fill_direction": fill,
            "softness": softness,
            "contrast": contrast,
            "temperature_k": temperature_k,
            "brightness": brightness,
            "estimation": "png_rgb_sample",
        }
    )
    return lighting


def _estimate_color(
    stats: dict[str, object] | None,
    lighting: dict[str, object],
) -> dict[str, object]:
    temperature_k = int(lighting["temperature_k"])
    if not stats:
        return {
            "temperature_k": temperature_k,
            "white_balance_hint": _wb_label(temperature_k),
            "saturation_hint": "medium",
            "palette_hint": "neutral",
            "grade_hint": "natural",
            "avg_rgb": None,
        }

    avg_r, avg_g, avg_b = stats["avg_rgb"]  # type: ignore[misc]
    max_c = max(avg_r, avg_g, avg_b) or 1
    min_c = min(avg_r, avg_g, avg_b)
    saturation = (max_c - min_c) / max_c
    if saturation < 0.12:
        sat_hint = "low"
        palette = "muted"
        grade = "clean_neutral"
    elif saturation > 0.35:
        sat_hint = "high"
        palette = "vivid"
        grade = "punchy_color"
    else:
        sat_hint = "medium"
        palette = "balanced"
        grade = "natural"

    if temperature_k < 4500:
        grade = "warm_cinema" if sat_hint != "low" else "warm_soft"
    elif temperature_k > 6500:
        grade = "cool_crisp"

    return {
        "temperature_k": temperature_k,
        "white_balance_hint": _wb_label(temperature_k),
        "saturation_hint": sat_hint,
        "palette_hint": palette,
        "grade_hint": grade,
        "avg_rgb": [int(avg_r), int(avg_g), int(avg_b)],
    }


def _estimate_look(
    analysis: ReferenceAnalysis,
    color: dict[str, object],
    stats: dict[str, object] | None,
) -> dict[str, object]:
    shot_size = analysis.composition["shot_size"]
    dof = "shallow" if shot_size in {"medium", "close"} else "moderate"
    if analysis.camera["focal_length_hint"] in {
        "normal_to_short_telephoto",
        "telephoto",
    }:
        dof = "shallow"

    brightness = float(stats["brightness"]) if stats else 0.5
    vignette = brightness < 0.35
    effect_parts = [
        f"{dof}_dof",
        str(color["grade_hint"]),
        str(analysis.lighting.get("softness", "soft")) + "_light",
    ]
    if vignette:
        effect_parts.append("soft_vignette")

    return {
        "depth_of_field_hint": dof,
        "contrast_curve": analysis.lighting.get("contrast", "medium"),
        "style_tags": [
            analysis.composition["shot_size"],
            analysis.camera["angle"],
            color["grade_hint"],
        ],
        "effect_summary": "+".join(effect_parts),
        "film_grain_hint": "none",
        "vignette_hint": "soft" if vignette else "none",
    }


def _rgb_to_temperature_k(r: int, g: int, b: int) -> int:
    if b <= 0:
        return 3200
    ratio = r / max(b, 1)
    if ratio > 1.25:
        return 3200
    if ratio > 1.1:
        return 4500
    if ratio > 0.95:
        return 5200
    if ratio > 0.8:
        return 6500
    return 7500


def _wb_label(temperature_k: int) -> str:
    if temperature_k < 4000:
        return "tungsten_warm"
    if temperature_k < 5000:
        return "warm_daylight"
    if temperature_k < 6000:
        return "daylight"
    if temperature_k < 7000:
        return "cool_daylight"
    return "shade_cool"


def photo_mode_json(
    asset_path: str,
    *,
    intent: Intent = Intent.REPLICATE_COMPOSITION,
) -> dict[str, object]:
    """Convenience wrapper returning JSON-serializable photo mode output."""

    return to_jsonable(run_photo_mode(asset_path, intent=intent))
