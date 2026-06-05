"""Face display event helpers for the robot eye screens."""

from __future__ import annotations

from camerobot.models import DisplayEvent, DisplayState, ReferenceAnalysis


def framing_event(analysis: ReferenceAnalysis) -> DisplayEvent:
    """Tell the user that Camerobot is framing the shot."""

    shot_size = analysis.composition["shot_size"]
    return DisplayEvent(
        target="eyes",
        state=DisplayState.FRAMING,
        message=f"正在构图：{shot_size}",
        actions=[{"label": "查看取景", "action": "open_live_preview"}],
    )


def guidance_event(analysis: ReferenceAnalysis) -> DisplayEvent:
    """Create a simple human-readable pose/framing guidance event."""

    headroom = analysis.composition["headroom_ratio"]
    center_x, _ = analysis.subject["center_norm"]
    if center_x < 0.45:
        message = "请向右移动一点"
    elif center_x > 0.55:
        message = "请向左移动一点"
    elif headroom > 0.12:
        message = "请稍微靠近镜头"
    else:
        message = "位置很好，请看镜头"

    return DisplayEvent(
        target="eyes",
        state=DisplayState.GUIDANCE,
        message=message,
        timeout_ms=3000,
    )


def countdown_event(seconds: int = 3) -> DisplayEvent:
    """Show a countdown before capture."""

    return DisplayEvent(
        target="eyes",
        state=DisplayState.COUNTDOWN,
        message=f"{seconds} 秒后拍摄",
        timeout_ms=seconds * 1000,
    )


def capture_done_event(preview_asset_id: str) -> DisplayEvent:
    """Show a capture-complete state with quick actions."""

    return DisplayEvent(
        target="eyes",
        state=DisplayState.CAPTURE_DONE,
        message="拍摄完毕",
        preview_asset_id=preview_asset_id,
        actions=[
            {"label": "重拍", "action": "retake"},
            {"label": "保存", "action": "save"},
        ],
        timeout_ms=5000,
    )


def preview_event(preview_asset_id: str) -> DisplayEvent:
    """Show a low-resolution preview on the robot eyes."""

    return DisplayEvent(
        target="eyes",
        state=DisplayState.PREVIEW,
        message="预览窗口",
        preview_asset_id=preview_asset_id,
        actions=[
            {"label": "放大查看", "action": "open_app_preview"},
            {"label": "继续拍摄", "action": "continue_shooting"},
        ],
    )


def safety_event(message: str) -> DisplayEvent:
    """Create a high-priority safety event."""

    return DisplayEvent(
        target="eyes",
        state=DisplayState.SAFETY,
        message=message,
    )
