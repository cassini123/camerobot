"""Command-line interface for the flyvision PC vision brain."""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence
from pathlib import Path

from flyvision.camera import iter_frames
from flyvision.capture import DEFAULT_STABLE_FRAMES
from flyvision.composition import DEFAULT_COMPOSITION_DELTA
from flyvision.image import load_image
from flyvision.match import DEFAULT_MATCH_THRESHOLD
from flyvision.pipeline import VisionPipeline
from flyvision.scene import Detection, HogPersonDetector, StubDetector, default_detector
from flyvision.shots import load_shot_database


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "image":
        return run_image(args)
    if args.command == "stream":
        return run_stream(args)
    if args.command == "depth":
        return run_depth(args)
    if args.command == "tag":
        return run_tag(args)
    parser.print_help()
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="flyvision",
        description=(
            "ESP32-CAM is the eye; this PC process is the brain. "
            "Match a live or still frame against a CinePath / flyvision shot list."
        ),
    )
    sub = parser.add_subparsers(dest="command")

    image = sub.add_parser("image", help="Score one still against the shot database.")
    _add_shared(image)
    image.add_argument("--frame", required=True, help="Path to a BMP/PPM/JPEG/PNG frame.")
    image.add_argument(
        "--bbox",
        metavar="x,y,w,h",
        help="Inject a normalized person box instead of running HOG (tests / no OpenCV).",
    )

    stream = sub.add_parser("stream", help="Pull ESP32-CAM MJPEG or a webcam.")
    _add_shared(stream)
    source = stream.add_mutually_exclusive_group(required=True)
    source.add_argument("--url", help="MJPEG URL, e.g. http://192.168.4.1/stream")
    source.add_argument(
        "--webcam",
        nargs="?",
        const=0,
        type=int,
        help="Open local camera index (default 0).",
    )
    stream.add_argument(
        "--auto-select",
        action="store_true",
        help="Pick the highest-similarity shot each frame instead of --active-shot.",
    )
    stream.add_argument(
        "--max-frames",
        type=int,
        default=0,
        help="Stop after N frames (0 = run until Ctrl-C).",
    )

    depth = sub.add_parser("depth", help="Fuse pinhole ranging with a metric depth map.")
    depth.add_argument("--bbox", required=True, metavar="x,y,w,h")
    depth.add_argument("--label", default="person")
    depth.add_argument("--aspect", type=float, default=16 / 9)
    depth.add_argument("--hfov", type=float, default=70.0)
    depth.add_argument("--height", type=float, default=1.7, help="Standing person height in meters.")
    depth.add_argument("--frame", help="Still used only when --checkpoint is set.")
    depth.add_argument("--checkpoint", help="Depth Anything V2 Metric VKITTI weights.")
    depth.add_argument(
        "--depth-csv",
        help="Optional HxW CSV of metric meters (tests / no torch).",
    )

    tag = sub.add_parser("tag", help="Offline FilmOps-style labels for a reference box.")
    tag.add_argument("--bbox", required=True, metavar="x,y,w,h")
    tag.add_argument("--label", default="person")
    tag.add_argument("--extra-boxes", type=int, default=0)
    return parser


def _add_shared(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--shots",
        required=True,
        help="flyvision shot JSON or a CinePath yun-jing-project.json export.",
    )
    parser.add_argument("--active-shot", help="Shot id to match (default: first shot).")
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_MATCH_THRESHOLD,
        help="Scene-match similarity threshold (default 0.85).",
    )
    parser.add_argument(
        "--delta",
        type=float,
        default=DEFAULT_COMPOSITION_DELTA,
        help="Max |dx|/|dy| for COMPOSITION_OK (default 0.05).",
    )
    parser.add_argument(
        "--stable-frames",
        type=int,
        default=DEFAULT_STABLE_FRAMES,
        help="Consecutive ready frames before CAPTURE_GO (default 8).",
    )
    parser.add_argument(
        "--capture-dir",
        default=str(_default_capture_dir()),
        help="Directory for GO frames.",
    )
    parser.add_argument(
        "--no-detect",
        action="store_true",
        help="Skip HOG and run match/histogram only.",
    )


def run_image(args: argparse.Namespace) -> int:
    shots = load_shot_database(args.shots)
    frame = load_image(args.frame)
    detector = StubDetector(_parse_bbox(args.bbox) if args.bbox else [])
    pipeline = VisionPipeline(
        shots,
        detector=detector,
        active_shot=args.active_shot,
        threshold=args.threshold,
        composition_delta=args.delta,
        stable_frames=1,
        capture_dir=args.capture_dir,
    )
    verdict = pipeline.push(frame)
    print(verdict.as_row())
    if verdict.capture_path:
        print(f"saved {verdict.capture_path}")
    return 0


def run_stream(args: argparse.Namespace) -> int:
    shots = load_shot_database(args.shots)
    detector = StubDetector() if args.no_detect else _live_detector()
    pipeline = VisionPipeline(
        shots,
        detector=detector,
        active_shot=args.active_shot,
        threshold=args.threshold,
        composition_delta=args.delta,
        stable_frames=args.stable_frames,
        capture_dir=args.capture_dir,
    )
    frames = iter_frames(url=args.url, webcam=args.webcam)
    try:
        for index, frame in enumerate(frames, start=1):
            verdict = pipeline.push(frame, auto_select=args.auto_select)
            print(verdict.as_row(), flush=True)
            if verdict.capture_path:
                print(f"saved {verdict.capture_path}", flush=True)
            if args.max_frames and index >= args.max_frames:
                break
    except KeyboardInterrupt:
        print("stopped", file=sys.stderr)
    return 0


def run_depth(args: argparse.Namespace) -> int:
    from flyvision.depth import fuse_detection, infer_dav2_metric

    box = _parse_box(args.bbox)
    depth_map = None
    if args.depth_csv:
        depth_map = _load_depth_csv(args.depth_csv)
    elif args.checkpoint and args.frame:
        depth_map = infer_dav2_metric(args.frame, checkpoint=args.checkpoint)
    fix, fused = fuse_detection(
        args.label,
        box,
        depth_map,
        aspect=args.aspect,
        hfov_deg=args.hfov,
        person_height_m=args.height,
    )
    print(
        f"distance={fused.distance_m:.2f} source={fused.source} "
        f"pinhole={fused.pinhole_m} metric={fused.metric_m} {fused.note}"
    )
    if fix:
        print(f"heading={fix.heading} crop={fix.crop} conf={fix.confidence}")
    return 0


def run_tag(args: argparse.Namespace) -> int:
    from flyvision.shot_labels import label_shot

    labels = label_shot(_parse_box(args.bbox), args.label, args.extra_boxes)
    print(labels.as_text())
    print(f"scale={labels.scale} tags={','.join(labels.tags)}")
    return 0


def _parse_box(text: str) -> tuple[float, float, float, float]:
    parts = [float(item.strip()) for item in text.split(",")]
    if len(parts) != 4:
        raise ValueError("bbox needs x,y,w,h in normalized coordinates")
    return parts[0], parts[1], parts[2], parts[3]


def _load_depth_csv(path: str) -> list[list[float]]:
    rows: list[list[float]] = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append([float(item) for item in line.split(",")])
    return rows


def _live_detector():
    try:
        return HogPersonDetector()
    except RuntimeError as exc:
        print(f"warning: {exc}; continuing without person detection", file=sys.stderr)
        return default_detector()


def _parse_bbox(text: str) -> list[Detection]:
    parts = [float(item.strip()) for item in text.split(",")]
    if len(parts) != 4:
        raise ValueError("--bbox needs x,y,w,h in normalized coordinates")
    x, y, w, h = parts
    return [Detection(label="person", bbox_norm=(x, y, w, h), confidence=1.0)]


def _default_capture_dir() -> Path:
    return Path(__file__).resolve().parents[2] / "data" / "captures"


if __name__ == "__main__":
    raise SystemExit(main())
