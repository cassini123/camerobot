"""End-to-end MVP0 pipeline helpers."""

from __future__ import annotations

from camerobot.assets import register_reference_asset
from camerobot.models import (
    Intent,
    OutputType,
    ShotConstraints,
    ShotRequest,
)
from camerobot.planner import create_shot_plan
from camerobot.reference_analysis import analyze_reference


def run_shot_pipeline(
    asset_path: str,
    *,
    intent: Intent = Intent.REPLICATE_COMPOSITION,
    output: OutputType = OutputType.PORTRAIT_PHOTO,
    constraints: ShotConstraints | None = None,
) -> dict[str, object]:
    """Run reference registration, analysis, and planning in one call."""

    asset = register_reference_asset(asset_path)
    request = ShotRequest(
        reference_asset_id=asset.asset_id,
        intent=intent,
        output=output,
        constraints=constraints or ShotConstraints(),
    )
    analysis = analyze_reference(asset, intent)
    plan = create_shot_plan(request, analysis)

    return {
        "asset": asset,
        "shot_request": request,
        "analysis": analysis,
        "shot_plan": plan,
    }
