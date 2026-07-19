from __future__ import annotations

import json
import struct
import tempfile
import unittest
import zlib
from pathlib import Path

from camerobot.assets import register_reference_asset
from camerobot.models import (
    DisplayState,
    Intent,
    ShotConstraints,
    StoryboardShot,
    to_jsonable,
)
from camerobot.photo_mode import run_photo_mode
from camerobot.pipeline import run_shot_pipeline
from camerobot.reference_analysis import analyze_reference
from camerobot.video_mode import run_video_mode


def write_minimal_png(path: Path, width: int, height: int) -> None:
    """Header-only PNG used by size-reading tests (no IDAT)."""

    png_signature = b"\x89PNG\r\n\x1a\n"
    ihdr_length = b"\x00\x00\x00\r"
    ihdr_type = b"IHDR"
    path.write_bytes(
        png_signature
        + ihdr_length
        + ihdr_type
        + width.to_bytes(4, "big")
        + height.to_bytes(4, "big")
        + b"\x08\x02\x00\x00\x00"
    )


def write_solid_png(
    path: Path,
    width: int,
    height: int,
    rgb: tuple[int, int, int],
) -> None:
    """Valid 8-bit RGB PNG with a solid color for look sampling tests."""

    raw = bytearray()
    r, g, b = rgb
    row = bytes([0]) + bytes([r, g, b]) * width
    for _ in range(height):
        raw.extend(row)
    compressed = zlib.compress(bytes(raw), level=9)

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", compressed) + chunk(b"IEND", b"")
    )


class CamerobotMVP0Tests(unittest.TestCase):
    def test_register_reference_asset_reads_png_size(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "portrait.png"
            write_minimal_png(image_path, width=1080, height=1920)

            asset = register_reference_asset(image_path)

            self.assertEqual(asset.width, 1080)
            self.assertEqual(asset.height, 1920)
            self.assertEqual(asset.media_type, "image/png")
            self.assertTrue(asset.asset_id.startswith("asset_"))

    def test_analyze_reference_outputs_portrait_composition(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "portrait.png"
            write_minimal_png(image_path, width=1080, height=1920)
            asset = register_reference_asset(image_path)

            analysis = analyze_reference(asset, Intent.REPLICATE_COMPOSITION)

            self.assertEqual(analysis.composition["orientation"], "portrait")
            self.assertEqual(analysis.composition["shot_size"], "medium")
            self.assertEqual(analysis.camera["angle"], "eye_level")
            self.assertGreater(analysis.confidence, 0.6)

    def test_pipeline_generates_display_preview_and_lighting_plan(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "product.png"
            write_minimal_png(image_path, width=1600, height=1000)

            result = run_shot_pipeline(
                str(image_path),
                intent=Intent.PRODUCT_SHOOT,
                constraints=ShotConstraints(allow_lighting_adjustment=True),
            )

            plan = result["shot_plan"]
            display_states = [event.state for event in plan.display_events]

            self.assertIn(DisplayState.CAPTURE_DONE, display_states)
            self.assertIn(DisplayState.PREVIEW, display_states)
            self.assertGreaterEqual(len(plan.lights), 2)
            self.assertEqual(plan.base["mode"], "position")

    def test_drone_plan_is_created_only_when_allowed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "wide.png"
            write_minimal_png(image_path, width=1920, height=1080)

            without_drone = run_shot_pipeline(
                str(image_path),
                intent=Intent.DRONE_REVEAL,
                constraints=ShotConstraints(use_drone=False),
            )
            with_drone = run_shot_pipeline(
                str(image_path),
                intent=Intent.DRONE_REVEAL,
                constraints=ShotConstraints(use_drone=True),
            )

            self.assertIsNone(without_drone["shot_plan"].drone)
            self.assertIsNotNone(with_drone["shot_plan"].drone)

    def test_pipeline_result_is_json_serializable(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "portrait.png"
            write_minimal_png(image_path, width=1080, height=1920)

            result = run_shot_pipeline(str(image_path))
            encoded = json.dumps(to_jsonable(result), ensure_ascii=False)

            self.assertIn("拍摄完毕", encoded)
            self.assertIn("shot_plan", encoded)

    def test_storyboard_shots_passthrough_and_extend_hint(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "follow.png"
            write_minimal_png(image_path, width=1280, height=720)
            shots = (
                StoryboardShot(
                    index=0,
                    start_s=0.0,
                    end_s=3.0,
                    shot_type="wide",
                    camera_movement="static",
                    implementation="建立环境",
                ),
                StoryboardShot(
                    index=1,
                    start_s=3.0,
                    end_s=8.0,
                    shot_type="medium",
                    camera_movement="push_in",
                    implementation="推进主体",
                    subject_hint="person_primary",
                ),
            )

            result = run_shot_pipeline(
                str(image_path),
                storyboard_shots=shots,
            )
            plan = result["shot_plan"]

            self.assertEqual(len(plan.storyboard_shots), 2)
            self.assertEqual(plan.storyboard_shots[1].camera_movement, "push_in")
            self.assertEqual(plan.extend["mode"], "standby")

            push_first = run_shot_pipeline(
                str(image_path),
                storyboard_shots=(
                    StoryboardShot(
                        index=0,
                        camera_movement="push_in",
                        shot_type="medium",
                    ),
                ),
            )["shot_plan"]
            self.assertEqual(push_first.extend["mode"], "rail")
            self.assertEqual(push_first.extend["trajectory"], "push_in")

            encoded = json.dumps(to_jsonable(result), ensure_ascii=False)
            self.assertIn("storyboard_shots", encoded)
            self.assertIn("建立环境", encoded)

    def test_photo_mode_parses_viewpoint_subject_lighting_color(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "warm.png"
            write_solid_png(image_path, width=64, height=96, rgb=(210, 160, 120))

            result = run_photo_mode(str(image_path))
            photo = result["photo"]

            self.assertEqual(result["mode"], "photo")
            self.assertIn("viewpoint", photo)
            self.assertIn("subject", photo)
            self.assertIn("lighting", photo)
            self.assertIn("look", photo)
            self.assertIn("color", photo)
            self.assertIn("replicate_targets", photo)
            self.assertEqual(photo["lighting"]["estimation"], "png_rgb_sample")
            self.assertLess(photo["color"]["temperature_k"], 5500)
            self.assertIn("match_subject_center_norm", photo["replicate_targets"])

    def test_video_mode_builds_timeline_and_drone_rig_hint(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            ground = Path(temp_dir) / "ground.png"
            aerial = Path(temp_dir) / "aerial.png"
            write_solid_png(ground, width=80, height=45, rgb=(120, 140, 180))
            write_solid_png(aerial, width=80, height=45, rgb=(100, 150, 200))

            result = run_video_mode(
                [
                    StoryboardShot(
                        index=0,
                        duration_s=4.0,
                        shot_type="wide",
                        camera_movement="drone_reveal",
                        reference_asset_path=str(aerial),
                        drone_role="establishing",
                        implementation="Mini 4 Pro reveal",
                    ),
                    StoryboardShot(
                        index=1,
                        duration_s=5.0,
                        shot_type="medium",
                        camera_movement="push_in",
                        reference_asset_path=str(ground),
                        look_hint="natural_portrait",
                        implementation="A7M4 push in",
                    ),
                ],
                constraints=ShotConstraints(use_drone=True, indoor=False),
            )

            self.assertEqual(result["mode"], "video")
            self.assertEqual(result["timeline"]["shot_count"], 2)
            self.assertEqual(result["timeline"]["total_duration_s"], 9.0)
            self.assertEqual(result["shots"][0]["capture_hints"]["rig"], "dji_mini_4_pro")
            self.assertEqual(result["shots"][1]["capture_hints"]["rig"], "sony_a7m4")
            self.assertEqual(result["shots"][1]["movement"]["axes"], ["extend"])
            self.assertEqual(result["shots"][1]["hardware_plan"].extend["mode"], "rail")
            encoded = json.dumps(to_jsonable(result), ensure_ascii=False)
            self.assertIn("everec_simcut", encoded)


if __name__ == "__main__":
    unittest.main()
