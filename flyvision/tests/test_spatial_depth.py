from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / "python"
if str(PYTHON) not in sys.path:
    sys.path.insert(0, str(PYTHON))

from flyvision.depth import box_median_depth, fuse_detection, fuse_range  # noqa: E402
from flyvision.shot_labels import label_shot, tag_reference  # noqa: E402
from flyvision.spatial import compare_spatial, estimate_spatial  # noqa: E402


class SpatialDepthLabelTests(unittest.TestCase):
    def test_webcam_bust_is_about_a_meter(self) -> None:
        fix = estimate_spatial("person", (0.3, 0.18, 0.4, 0.58), aspect=16 / 9, hfov_deg=70)
        self.assertIsNotNone(fix)
        assert fix is not None
        self.assertEqual(fix.crop, "bust")
        self.assertGreater(fix.distance_m, 0.45)
        self.assertLess(fix.distance_m, 1.6)

    def test_compare_keeps_near_far_right_copy(self) -> None:
        reference = estimate_spatial("person", (0.4, 0.2, 0.18, 0.45), aspect=4 / 3)
        live = estimate_spatial("person", (0.55, 0.15, 0.28, 0.65), aspect=4 / 3)
        assert reference and live
        delta = compare_spatial(reference, live)
        self.assertIn("近了", delta.summary)
        self.assertIn("偏右", delta.summary)

    def test_box_median_beats_mean_outlier(self) -> None:
        depth = [[1.0, 1.0, 1.0], [1.0, 40.0, 1.0], [1.0, 1.0, 1.0]]
        self.assertAlmostEqual(box_median_depth(depth, (0.0, 0.0, 1.0, 1.0)), 1.0)

    def test_fuse_keeps_pinhole_when_depth_disagrees(self) -> None:
        fused = fuse_range(2.0, 12.0)
        self.assertEqual(fused.source, "pinhole")
        self.assertFalse(fused.agree)
        agree = fuse_range(2.0, 2.2)
        self.assertEqual(agree.source, "fused")
        self.assertTrue(agree.agree)

    def test_fuse_detection_scales_lateral_with_fused_distance(self) -> None:
        depth = [[0.8] * 8 for _ in range(8)]
        fix, fused = fuse_detection("person", (0.3, 0.18, 0.4, 0.58), depth)
        self.assertIsNotNone(fix)
        self.assertIn(fused.source, {"fused", "pinhole", "metric"})

    def test_offline_tag_uses_largest_person(self) -> None:
        labels = tag_reference(
            [
                ("chair", (0.1, 0.6, 0.2, 0.2)),
                ("person", (0.3, 0.18, 0.4, 0.58)),
            ]
        )
        self.assertIsNotNone(labels)
        assert labels is not None
        self.assertEqual(labels.scale, "MCU")

    def test_cli_depth_and_tag(self) -> None:
        from io import StringIO
        from unittest.mock import patch

        from flyvision.cli import main

        with tempfile.TemporaryDirectory() as temp_dir:
            csv = Path(temp_dir) / "depth.csv"
            csv.write_text("0.9,0.9\n0.9,0.9\n", encoding="utf-8")
            buf = StringIO()
            with patch("sys.stdout", buf):
                code = main(
                    [
                        "depth",
                        "--bbox",
                        "0.3,0.18,0.4,0.58",
                        "--depth-csv",
                        str(csv),
                    ]
                )
            self.assertEqual(code, 0)
            self.assertIn("distance=", buf.getvalue())
            tag_buf = StringIO()
            with patch("sys.stdout", tag_buf):
                self.assertEqual(main(["tag", "--bbox", "0.3,0.18,0.4,0.58"]), 0)
            self.assertIn("scale=MCU", tag_buf.getvalue())

    def test_label_shot_center(self) -> None:
        labels = label_shot((0.38, 0.28, 0.24, 0.44))
        self.assertIn("center", labels.tags)


if __name__ == "__main__":
    unittest.main()
