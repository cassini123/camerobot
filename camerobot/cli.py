"""Command-line interface for Camerobot MVP0."""

from __future__ import annotations

import argparse
import json
from typing import Sequence

from camerobot.assets import register_reference_asset
from camerobot.models import Intent, OutputType, ShotConstraints, to_jsonable
from camerobot.pipeline import run_shot_pipeline
from camerobot.reference_analysis import analyze_reference


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "analyze":
        asset = register_reference_asset(args.asset)
        analysis = analyze_reference(asset, Intent(args.intent))
        print_json({"asset": asset, "analysis": analysis})
        return 0

    if args.command == "simulate":
        result = run_shot_pipeline(
            args.asset,
            intent=Intent(args.intent),
            output=OutputType(args.output),
            constraints=ShotConstraints(
                indoor=args.indoor,
                max_distance_m=args.max_distance_m,
                use_drone=args.use_drone,
                allow_arm_motion=args.allow_arm_motion,
                allow_lighting_adjustment=args.allow_lighting_adjustment,
            ),
        )
        print_json(result)
        return 0

    parser.print_help()
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="camerobot",
        description="Camerobot MVP0 reference analysis and shot planning tools.",
    )
    subparsers = parser.add_subparsers(dest="command")

    analyze = subparsers.add_parser("analyze", help="Analyze a reference image.")
    analyze.add_argument("--asset", required=True, help="Path to a local image/video.")
    analyze.add_argument(
        "--intent",
        choices=[item.value for item in Intent],
        default=Intent.REPLICATE_COMPOSITION.value,
    )

    simulate = subparsers.add_parser(
        "simulate",
        help="Run asset registration, analysis, planning, and display events.",
    )
    simulate.add_argument("--asset", required=True, help="Path to a local image/video.")
    simulate.add_argument(
        "--intent",
        choices=[item.value for item in Intent],
        default=Intent.REPLICATE_COMPOSITION.value,
    )
    simulate.add_argument(
        "--output",
        choices=[item.value for item in OutputType],
        default=OutputType.PORTRAIT_PHOTO.value,
    )
    simulate.add_argument(
        "--outdoor",
        dest="indoor",
        action="store_false",
        help="Use outdoor safety defaults.",
    )
    simulate.add_argument(
        "--max-distance-m",
        type=float,
        default=4.0,
        help="Maximum allowed robot-camera distance.",
    )
    simulate.add_argument(
        "--use-drone",
        action="store_true",
        help="Allow drone planning when the intent requires it.",
    )
    simulate.add_argument(
        "--no-arm-motion",
        dest="allow_arm_motion",
        action="store_false",
        help="Disable arm/jib motion.",
    )
    simulate.add_argument(
        "--no-lighting-adjustment",
        dest="allow_lighting_adjustment",
        action="store_false",
        help="Disable lighting changes.",
    )

    return parser


def print_json(value: object) -> None:
    print(json.dumps(to_jsonable(value), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    raise SystemExit(main())
