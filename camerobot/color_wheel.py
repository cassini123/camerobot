"""HSV color-wheel mapping for palette / grade recognition."""

from __future__ import annotations

from typing import Any


# 12-sector RYB-inspired wheel labels (design + grade language).
WHEEL_SECTORS = (
    "red",
    "red_orange",
    "orange",
    "yellow_orange",
    "yellow",
    "yellow_green",
    "green",
    "blue_green",
    "blue",
    "blue_violet",
    "violet",
    "red_violet",
)


def rgb_to_hsv(r: int, g: int, b: int) -> tuple[float, float, float]:
    rf, gf, bf = r / 255.0, g / 255.0, b / 255.0
    max_c = max(rf, gf, bf)
    min_c = min(rf, gf, bf)
    delta = max_c - min_c
    if delta == 0:
        h = 0.0
    elif max_c == rf:
        h = (60 * ((gf - bf) / delta) + 360) % 360
    elif max_c == gf:
        h = 60 * ((bf - rf) / delta) + 120
    else:
        h = 60 * ((rf - gf) / delta) + 240
    s = 0.0 if max_c == 0 else delta / max_c
    v = max_c
    return h, s, v


def wheel_sector(hue_deg: float) -> str:
    index = int((hue_deg % 360) // 30) % 12
    return WHEEL_SECTORS[index]


def complementary_sector(sector: str) -> str:
    index = WHEEL_SECTORS.index(sector)
    return WHEEL_SECTORS[(index + 6) % 12]


def analogous_sectors(sector: str) -> list[str]:
    index = WHEEL_SECTORS.index(sector)
    return [
        WHEEL_SECTORS[(index - 1) % 12],
        sector,
        WHEEL_SECTORS[(index + 1) % 12],
    ]


def build_color_wheel_report(
    avg_rgb: list[int] | None,
    *,
    temperature_k: int,
) -> dict[str, Any]:
    """Structured color-wheel output for photo mode."""

    if not avg_rgb:
        return {
            "model": "hsv_12_sector_wheel",
            "primary_sector": "yellow",
            "hue_deg": None,
            "saturation": None,
            "value": None,
            "complementary_sector": "blue",
            "analogous_sectors": ["yellow_orange", "yellow", "yellow_green"],
            "temperature_k": temperature_k,
            "harmony_hint": "neutral",
            "wheel_position": {"angle_deg": 60, "radius": 0.35},
        }

    r, g, b = int(avg_rgb[0]), int(avg_rgb[1]), int(avg_rgb[2])
    h, s, v = rgb_to_hsv(r, g, b)
    primary = wheel_sector(h)
    if s < 0.12:
        harmony = "low_chroma_neutral"
    elif temperature_k < 4500:
        harmony = "warm_analogous"
    elif temperature_k > 6500:
        harmony = "cool_analogous"
    else:
        harmony = "balanced_complement_ready"

    return {
        "model": "hsv_12_sector_wheel",
        "primary_sector": primary,
        "hue_deg": round(h, 1),
        "saturation": round(s, 3),
        "value": round(v, 3),
        "complementary_sector": complementary_sector(primary),
        "analogous_sectors": analogous_sectors(primary),
        "temperature_k": temperature_k,
        "harmony_hint": harmony,
        "wheel_position": {
            "angle_deg": round(h, 1),
            "radius": round(min(1.0, s), 3),
        },
        "avg_rgb": [r, g, b],
    }
