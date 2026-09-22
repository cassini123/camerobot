from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / "python"
if str(PYTHON) not in sys.path:
    sys.path.insert(0, str(PYTHON))

from flyvision.capture import CAPTURE_GO, CONTINUE_FOLLOW  # noqa: E402
from flyvision.composition import judge_composition  # noqa: E402
from flyvision.image import blit_rect, load_image, save_bmp, solid_image  # noqa: E402
from flyvision.match import (  # noqa: E402
    HistogramFeatureExtractor,
    features_for_shot,
    histogram_correlation,
    hsv_histogram,
    match_shot,
)
from flyvision.pipeline import VisionPipeline  # noqa: E402
from flyvision.preprocess import center_crop_resize  # noqa: E402
from flyvision.scene import Detection, StubDetector  # noqa: E402
from flyvision.shots import load_cinepath_export, load_shot_database, shot_by_id  # noqa: E402

BOKTU = ROOT / "data" / "shots" / "boktu.json"
CINEPATH = Path(__file__).resolve().parent / "fixtures" / "cinepath_export.json"


def person_box(cx: float, cy: float, w: float = 0.16, h: float = 0.46) -> Detection:
    return Detection(
        label="person",
        bbox_norm=(cx - w / 2, cy - h / 2, w, h),
        confidence=1.0,
    )


class FlyvisionPipelineTests(unittest.TestCase):
    def test_boktu_database_has_three_shots(self) -> None:
        shots = load_shot_database(BOKTU)
        ids = [shot.shot_id for shot in shots]
        self.assertEqual(ids, ["shot_01", "shot_02", "shot_03"])
        follow = shot_by_id(shots, "shot_02")
        self.assertEqual(follow.target_type, "person")
        self.assertAlmostEqual(follow.composition_horizontal, 0.33)
        self.assertAlmostEqual(follow.composition_vertical, 0.52)
        self.assertTrue(follow.reference_path and follow.reference_path.exists())

    def test_cinepath_export_maps_composition_and_distance(self) -> None:
        shots = load_cinepath_export(CINEPATH)
        self.assertEqual(len(shots), 1)
        shot = shots[0]
        self.assertEqual(shot.shot_id, "shot_03")
        self.assertEqual(shot.kind, "reveal")
        self.assertAlmostEqual(shot.composition_horizontal, 0.38)
        self.assertAlmostEqual(shot.composition_vertical, 0.5)
        self.assertIsNotNone(shot.distance_m)
        self.assertGreater(shot.distance_m or 0, 3.0)
        self.assertIn("robot_hints", shot.raw)

    def test_composition_near_target_is_ok(self) -> None:
        shots = load_shot_database(BOKTU)
        shot = shot_by_id(shots, "shot_03")
        ok = judge_composition(shot, person_box(0.38, 0.50))
        self.assertTrue(ok.composition_ok)
        self.assertAlmostEqual(ok.dx, 0.0, places=3)
        self.assertAlmostEqual(ok.dy, 0.0, places=3)

    def test_composition_far_from_target_is_not_ok(self) -> None:
        shots = load_shot_database(BOKTU)
        shot = shot_by_id(shots, "shot_03")
        miss = judge_composition(shot, person_box(0.80, 0.20))
        self.assertFalse(miss.composition_ok)

    def test_similar_histograms_outrank_dissimilar_colors(self) -> None:
        warm = solid_image(64, 64, (180, 120, 60))
        warm_close = solid_image(64, 64, (176, 118, 58))
        cold = solid_image(64, 64, (40, 80, 180))
        similar = histogram_correlation(hsv_histogram(warm), hsv_histogram(warm_close))
        different = histogram_correlation(hsv_histogram(warm), hsv_histogram(cold))
        self.assertGreater(similar, 0.9)
        self.assertGreater(similar, different + 0.2)

    def test_reference_match_prefers_same_shot_still(self) -> None:
        shots = load_shot_database(BOKTU)
        shot_a = shot_by_id(shots, "shot_01")
        shot_b = shot_by_id(shots, "shot_03")
        frame = load_image(shot_a.reference_path)
        same = match_shot(frame, shot_a, [])
        other = match_shot(frame, shot_b, [])
        self.assertGreater(same.similarity, other.similarity)

    def test_pipeline_go_when_box_holds_for_stable_frames(self) -> None:
        shots = load_shot_database(BOKTU)
        shot = shot_by_id(shots, "shot_03")
        frame = load_image(shot.reference_path)
        box = person_box(shot.composition_horizontal, shot.composition_vertical)
        with tempfile.TemporaryDirectory() as temp_dir:
            pipeline = VisionPipeline(
                shots,
                detector=StubDetector([box]),
                active_shot="shot_03",
                threshold=0.5,
                stable_frames=3,
                capture_dir=temp_dir,
            )
            decisions = [pipeline.push(frame).decision for _ in range(3)]
            self.assertEqual(decisions[:2], [CONTINUE_FOLLOW, CONTINUE_FOLLOW])
            self.assertEqual(decisions[2], CAPTURE_GO)
            saved = list(Path(temp_dir).glob("shot_03_*.bmp"))
            self.assertEqual(len(saved), 1)

    def test_pipeline_keeps_following_when_subject_is_off_frame(self) -> None:
        shots = load_shot_database(BOKTU)
        shot = shot_by_id(shots, "shot_03")
        frame = load_image(shot.reference_path)
        pipeline = VisionPipeline(
            shots,
            detector=StubDetector([person_box(0.85, 0.15)]),
            active_shot="shot_03",
            threshold=0.5,
            stable_frames=2,
        )
        first = pipeline.push(frame)
        second = pipeline.push(frame)
        self.assertFalse(first.composition_ok)
        self.assertEqual(first.decision, CONTINUE_FOLLOW)
        self.assertEqual(second.decision, CONTINUE_FOLLOW)

    def test_center_crop_resize_is_square(self) -> None:
        image = solid_image(80, 40, (10, 20, 30))
        square = center_crop_resize(image, 16)
        self.assertEqual(square.width, 16)
        self.assertEqual(square.height, 16)

    def test_features_without_reference_use_composition_target(self) -> None:
        shots = load_shot_database(BOKTU)
        shot = shot_by_id(shots, "shot_02")
        missing = shot.__class__(
            **{
                **{key: getattr(shot, key) for key in shot.__dataclass_fields__},
                "reference_path": Path("/no/such/file.bmp"),
            }
        )
        features = features_for_shot(missing, HistogramFeatureExtractor())
        self.assertEqual(features.subject_center, shot.composition_target)
        self.assertAlmostEqual(features.subject_area, shot.subject_ratio)

    def test_load_shot_database_accepts_cinepath_file(self) -> None:
        shots = load_shot_database(CINEPATH)
        self.assertEqual(shots[0].shot_id, "shot_03")

    def test_bmp_roundtrip(self) -> None:
        original = blit_rect(solid_image(12, 10, (1, 2, 3)), 2, 2, 6, 7, (9, 8, 7))
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "round.bmp"
            save_bmp(original, path)
            loaded = load_image(path)
        self.assertEqual(loaded.width, 12)
        self.assertEqual(loaded.height, 10)
        self.assertEqual(loaded.pixel(0, 0), (1, 2, 3))
        self.assertEqual(loaded.pixel(3, 4), (9, 8, 7))

    def test_cli_image_prints_decision(self) -> None:
        from io import StringIO
        from unittest.mock import patch

        from flyvision.cli import main

        shots = load_shot_database(BOKTU)
        frame = str(shot_by_id(shots, "shot_02").reference_path)
        buf = StringIO()
        with tempfile.TemporaryDirectory() as temp_dir:
            with patch("sys.stdout", buf):
                code = main(
                    [
                        "image",
                        "--shots",
                        str(BOKTU),
                        "--frame",
                        frame,
                        "--active-shot",
                        "shot_02",
                        "--bbox",
                        "0.25,0.29,0.16,0.46",
                        "--capture-dir",
                        temp_dir,
                        "--threshold",
                        "0.4",
                    ]
                )
        self.assertEqual(code, 0)
        self.assertIn("shot=shot_02", buf.getvalue())
        self.assertIn("CAPTURE_GO", buf.getvalue())


if __name__ == "__main__":
    unittest.main()
