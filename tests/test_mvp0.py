from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from camerobot.assets import register_reference_asset
from camerobot.models import DisplayState, Intent, ShotConstraints, to_jsonable
from camerobot.pipeline import run_shot_pipeline
from camerobot.reference_analysis import analyze_reference


def write_minimal_png(path: Path, width: int, height: int) -> None:
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


if __name__ == "__main__":
    unittest.main()
