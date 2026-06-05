"""Shot planner that converts reference analysis into robot actions."""

from __future__ import annotations

from camerobot.face_display import (
    capture_done_event,
    countdown_event,
    framing_event,
    guidance_event,
    preview_event,
    safety_event,
)
from camerobot.models import DisplayEvent, ReferenceAnalysis, ShotPlan, ShotRequest


def create_shot_plan(request: ShotRequest, analysis: ReferenceAnalysis) -> ShotPlan:
    """Create a hardware-agnostic shot plan from analysis and constraints."""

    distance_m = min(
        float(analysis.camera["distance_m"]),
        request.constraints.max_distance_m,
    )
    yaw_deg = _yaw_from_subject_center(analysis.subject["center_norm"][0])
    preview_asset_id = f"{analysis.asset_id}_preview"
    display_events = _display_sequence(preview_asset_id, analysis, request)

    return ShotPlan(
        base={
            "x_m": round(distance_m, 2),
            "y_m": _lateral_offset(analysis),
            "yaw_deg": yaw_deg,
            "mode": "follow" if analysis.motion["type"] == "follow" else "position",
        },
        lift={
            "height_m": float(analysis.camera["height_m"]),
            "lock_after_move": True,
        },
        head={
            "pan_deg": -yaw_deg,
            "tilt_deg": _tilt_for_camera_angle(analysis.camera["angle"]),
            "roll_deg": 0,
            "tracking": "subject_lock",
        },
        camera={
            "mode": "video" if request.output.value.endswith("video") else "photo",
            "focal_length_hint": analysis.camera["focal_length_hint"],
            "exposure_mode": "auto_with_face_priority",
            "focus_mode": "subject_tracking",
        },
        arm=_arm_plan(request, analysis),
        lights=_light_plan(request, analysis),
        drone=_drone_plan(request, analysis),
        display_events=display_events,
        safety={
            "max_speed_mps": 0.35 if request.constraints.indoor else 0.55,
            "human_clearance_m": 0.8,
            "emergency_stop_required": True,
            "privacy_indicator_required": True,
        },
    )


def _display_sequence(
    preview_asset_id: str,
    analysis: ReferenceAnalysis,
    request: ShotRequest,
) -> list[DisplayEvent]:
    events = [
        framing_event(analysis),
        guidance_event(analysis),
        countdown_event(3),
        capture_done_event(preview_asset_id),
        preview_event(preview_asset_id),
    ]
    if not request.constraints.indoor:
        events.insert(0, safety_event("户外移动中，请保持距离"))
    return events


def _yaw_from_subject_center(center_x: float) -> int:
    return round((center_x - 0.5) * 18)


def _lateral_offset(analysis: ReferenceAnalysis) -> float:
    negative_space = analysis.composition.get("negative_space")
    if negative_space == "right":
        return -0.25
    return 0.0


def _tilt_for_camera_angle(angle: str) -> int:
    return {
        "high_angle": -15,
        "slightly_high": -8,
        "eye_level": 0,
    }.get(angle, 0)


def _arm_plan(request: ShotRequest, analysis: ReferenceAnalysis) -> dict[str, object]:
    if not request.constraints.allow_arm_motion:
        return {"mode": "disabled", "reason": "constraint"}
    if analysis.motion["needs_arm"]:
        return {
            "mode": "jib",
            "trajectory": analysis.motion["type"],
            "max_payload_kg": 0.6,
        }
    return {"mode": "standby"}


def _light_plan(request: ShotRequest, analysis: ReferenceAnalysis) -> list[dict[str, object]]:
    if not request.constraints.allow_lighting_adjustment:
        return []

    lighting = analysis.lighting
    lights = [
        {
            "role": "key",
            "brightness": 0.65,
            "temperature_k": lighting["temperature_k"],
            "direction": lighting["key_direction"],
            "softness": lighting["softness"],
        },
        {
            "role": "fill",
            "brightness": 0.28,
            "temperature_k": lighting["temperature_k"],
            "direction": lighting["fill_direction"],
        },
    ]
    if lighting["back_light"]:
        lights.append(
            {
                "role": "back",
                "brightness": 0.35,
                "temperature_k": lighting["temperature_k"],
                "direction": "rear_left",
            }
        )
    return lights


def _drone_plan(
    request: ShotRequest,
    analysis: ReferenceAnalysis,
) -> dict[str, object] | None:
    if not request.constraints.use_drone or not analysis.motion["needs_drone"]:
        return None
    return {
        "mode": "external_api_placeholder",
        "mission": "establishing_reveal_then_return",
        "max_altitude_m": 8 if request.constraints.indoor else 30,
        "return_to_dock": True,
    }
