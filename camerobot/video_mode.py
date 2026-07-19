"""Video storyboard mode: shots with reference stills, moves, and durations."""

from __future__ import annotations

from typing import Any

from camerobot.models import (
    Intent,
    OutputType,
    ReferenceAnalysis,
    ShotConstraints,
    ShotRequest,
    StoryboardShot,
)
from camerobot.photo_mode import run_photo_mode
from camerobot.planner import create_shot_plan
from camerobot.reference_analysis import analyze_reference


MOVEMENT_CATALOG = {
    "static": {"axes": [], "speed": "none", "drone": False},
    "push_in": {"axes": ["extend"], "speed": "slow", "drone": False},
    "pull_out": {"axes": ["extend"], "speed": "slow", "drone": False},
    "dolly": {"axes": ["base", "extend"], "speed": "medium", "drone": False},
    "follow": {"axes": ["base", "head"], "speed": "medium", "drone": False},
    "tracking": {"axes": ["base", "head"], "speed": "medium", "drone": False},
    "pan": {"axes": ["head"], "speed": "slow", "drone": False},
    "tilt": {"axes": ["head"], "speed": "slow", "drone": False},
    "orbit": {"axes": ["base", "head"], "speed": "slow", "drone": False},
    "crane": {"axes": ["lift", "arm"], "speed": "slow", "drone": False},
    "jib": {"axes": ["arm"], "speed": "slow", "drone": False},
    "low_to_high_reveal": {"axes": ["lift", "arm"], "speed": "slow", "drone": False},
    "drone_reveal": {"axes": ["drone"], "speed": "medium", "drone": True},
    "drone_orbit": {"axes": ["drone"], "speed": "medium", "drone": True},
    "drone_top_down": {"axes": ["drone"], "speed": "slow", "drone": True},
}


def run_video_mode(
    storyboard_shots: list[StoryboardShot] | tuple[StoryboardShot, ...],
    *,
    fallback_asset_path: str | None = None,
    intent: Intent = Intent.VLOG_FOLLOW,
    constraints: ShotConstraints | None = None,
) -> dict[str, object]:
    """Parse a motion-aware storyboard into per-shot plans and a timeline."""

    if not storyboard_shots:
        raise ValueError("video mode requires at least one storyboard shot")

    constraints = constraints or ShotConstraints()
    shots = tuple(_normalize_shot(shot, index) for index, shot in enumerate(storyboard_shots))
    planned: list[dict[str, object]] = []
    cursor = 0.0

    for shot in shots:
        duration = shot.resolved_duration_s
        start_s = shot.start_s if shot.end_s > shot.start_s else cursor
        end_s = shot.end_s if shot.end_s > shot.start_s else cursor + duration
        cursor = end_s

        asset_path = shot.reference_asset_path or fallback_asset_path
        if not asset_path:
            raise ValueError(
                f"shot {shot.index} needs reference_asset_path or fallback_asset_path"
            )

        photo_bundle = run_photo_mode(asset_path, intent=intent)
        asset = photo_bundle["asset"]
        analysis = photo_bundle["analysis"]
        assert hasattr(asset, "asset_id")

        movement = _movement_plan(shot, constraints)
        request = ShotRequest(
            reference_asset_id=asset.asset_id,
            intent=intent,
            output=OutputType.SHORT_VIDEO,
            constraints=ShotConstraints(
                indoor=constraints.indoor,
                max_distance_m=constraints.max_distance_m,
                use_drone=constraints.use_drone or bool(movement["uses_drone"]),
                allow_arm_motion=constraints.allow_arm_motion,
                allow_lighting_adjustment=constraints.allow_lighting_adjustment,
            ),
            storyboard_shots=(shot,),
        )
        # Re-analyze with motion type influenced by storyboard movement.
        motion_analysis = analyze_reference(asset, intent)
        motion_analysis = _override_motion(motion_analysis, shot)
        hardware_plan = create_shot_plan(request, motion_analysis)

        planned.append(
            {
                "shot": shot,
                "timeline": {
                    "start_s": round(start_s, 3),
                    "end_s": round(end_s, 3),
                    "duration_s": round(end_s - start_s, 3),
                },
                "photo": photo_bundle["photo"],
                "movement": movement,
                "hardware_plan": hardware_plan,
                "capture_hints": {
                    "rig": _rig_hint(movement),
                    "look_hint": shot.look_hint or photo_bundle["photo"]["look"]["effect_summary"],
                    "implementation": shot.implementation,
                },
            }
        )

    total_duration = planned[-1]["timeline"]["end_s"] if planned else 0.0
    return {
        "mode": "video",
        "intent": intent,
        "constraints": constraints,
        "timeline": {
            "shot_count": len(planned),
            "total_duration_s": total_duration,
        },
        "shots": planned,
        "edit_bridge": {
            "concatenate_in_order": True,
            "use_shot_index_markers": True,
            "target_app": "everec_simcut",
        },
        "notes": [
            "Video storyboard mode expands each shot with photo parse + movement axes.",
            "DJI Mini 4 Pro shots should set camera_movement/drone_role to drone_*.",
            "Sony A7M4 is the default ground rig for non-drone shots.",
        ],
    }


def parse_storyboard_payload(
    raw_shots: Any,
    *,
    allow_empty: bool = False,
) -> list[StoryboardShot]:
    """Parse API/CLI JSON objects into StoryboardShot values."""

    if raw_shots is None:
        raw_shots = []
    if not isinstance(raw_shots, list):
        raise ValueError("storyboard_shots must be a list")
    if not raw_shots and not allow_empty:
        raise ValueError("storyboard_shots must be a non-empty list")

    shots: list[StoryboardShot] = []
    for item in raw_shots:
        if not isinstance(item, dict):
            raise ValueError("each storyboard shot must be an object")
        shots.append(
            StoryboardShot(
                index=int(item.get("index", len(shots))),
                start_s=float(item.get("start_s", 0.0)),
                end_s=float(item.get("end_s", 0.0)),
                shot_type=str(item.get("shot_type", "medium")),
                camera_movement=str(item.get("camera_movement", "static")),
                implementation=str(item.get("implementation", "")),
                subject_hint=(
                    None
                    if item.get("subject_hint") is None
                    else str(item.get("subject_hint"))
                ),
                duration_s=(
                    None
                    if item.get("duration_s") is None
                    else float(item["duration_s"])
                ),
                reference_asset_path=(
                    None
                    if item.get("reference_asset_path") is None
                    else str(item.get("reference_asset_path"))
                ),
                look_hint=(
                    None if item.get("look_hint") is None else str(item.get("look_hint"))
                ),
                drone_role=(
                    None
                    if item.get("drone_role") is None
                    else str(item.get("drone_role"))
                ),
            )
        )
    return shots


def _normalize_shot(shot: StoryboardShot, index: int) -> StoryboardShot:
    if shot.index != index and shot.index >= 0:
        return shot
    return StoryboardShot(
        index=index,
        start_s=shot.start_s,
        end_s=shot.end_s,
        shot_type=shot.shot_type,
        camera_movement=shot.camera_movement,
        implementation=shot.implementation,
        subject_hint=shot.subject_hint,
        duration_s=shot.duration_s,
        reference_asset_path=shot.reference_asset_path,
        look_hint=shot.look_hint,
        drone_role=shot.drone_role,
    )


def _movement_plan(shot: StoryboardShot, constraints: ShotConstraints) -> dict[str, object]:
    key = shot.camera_movement
    catalog = MOVEMENT_CATALOG.get(key, MOVEMENT_CATALOG["static"])
    uses_drone = bool(catalog["drone"] or shot.drone_role)
    if uses_drone and constraints.indoor and not constraints.use_drone:
        # Keep plan visible but mark blocked until explicitly allowed.
        status = "blocked_indoor_without_use_drone"
    elif uses_drone and not constraints.use_drone:
        status = "blocked_use_drone_false"
    else:
        status = "ok"

    return {
        "camera_movement": key,
        "axes": list(catalog["axes"]),
        "speed": catalog["speed"],
        "uses_drone": uses_drone,
        "drone_role": shot.drone_role
        or ("establishing" if uses_drone else None),
        "duration_s": shot.resolved_duration_s,
        "status": status,
    }


def _rig_hint(movement: dict[str, object]) -> str:
    if movement["uses_drone"]:
        return "dji_mini_4_pro"
    return "sony_a7m4"


def _override_motion(
    analysis: ReferenceAnalysis,
    shot: StoryboardShot,
) -> ReferenceAnalysis:
    motion = dict(analysis.motion)
    motion["type"] = shot.camera_movement
    motion["needs_arm"] = shot.camera_movement in {
        "crane",
        "jib",
        "low_to_high_reveal",
    }
    motion["needs_drone"] = shot.camera_movement.startswith("drone") or bool(
        shot.drone_role
    )
    return ReferenceAnalysis(
        asset_id=analysis.asset_id,
        subject=analysis.subject,
        composition=analysis.composition,
        camera=analysis.camera,
        lighting=analysis.lighting,
        motion=motion,
        confidence=analysis.confidence,
    )
