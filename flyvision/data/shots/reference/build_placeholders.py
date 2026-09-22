#!/usr/bin/env python3
"""Write the three Boktu placeholder BMPs next to this script."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "python"))

from flyvision.image import RgbImage, blit_rect, save_bmp, solid_image  # noqa: E402


def hall_base(width: int = 160, height: int = 120, warm: bool = True) -> RgbImage:
    sky = (196, 168, 120) if warm else (140, 158, 176)
    floor = (92, 72, 48) if warm else (70, 74, 80)
    wall = (148, 96, 52) if warm else (110, 118, 128)
    image = solid_image(width, height, sky)
    image = blit_rect(image, 0, int(height * 0.55), width, height, floor)
    image = blit_rect(
        image,
        int(width * 0.28),
        int(height * 0.18),
        int(width * 0.78),
        int(height * 0.78),
        wall,
    )
    window = (220, 210, 170) if warm else (190, 205, 220)
    image = blit_rect(
        image,
        int(width * 0.46),
        int(height * 0.28),
        int(width * 0.62),
        int(height * 0.48),
        window,
    )
    return image


def add_person(image: RgbImage, x0_ratio: float, y0_ratio: float) -> RgbImage:
    x0 = int(image.width * x0_ratio)
    y0 = int(image.height * y0_ratio)
    x1 = x0 + int(image.width * 0.16)
    y1 = y0 + int(image.height * 0.46)
    body = blit_rect(image, x0, y0 + 8, x1, y1, (46, 58, 92))
    return blit_rect(body, x0 + 4, y0, x1 - 4, y0 + 16, (210, 168, 140))


def main() -> None:
    dest = Path(__file__).resolve().parent
    save_bmp(hall_base(warm=True), dest / "shot_01.bmp")
    save_bmp(add_person(hall_base(warm=True), 0.22, 0.32), dest / "shot_02.bmp")
    save_bmp(add_person(hall_base(warm=False), 0.30, 0.30), dest / "shot_03.bmp")
    print(f"wrote {dest / 'shot_01.bmp'}")
    print(f"wrote {dest / 'shot_02.bmp'}")
    print(f"wrote {dest / 'shot_03.bmp'}")


if __name__ == "__main__":
    main()
