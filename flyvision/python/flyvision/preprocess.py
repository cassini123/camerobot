"""Layer 1 helpers: resize, center-crop, and keep the original frame."""

from __future__ import annotations

from dataclasses import dataclass

from flyvision.image import RgbImage

DEFAULT_AI_SIZE = 256


@dataclass(frozen=True)
class PreparedFrame:
    """Original camera frame plus the square tensor used for matching."""

    original: RgbImage
    ai: RgbImage


def prepare_frame(image: RgbImage, size: int = DEFAULT_AI_SIZE) -> PreparedFrame:
    """Center-crop to square, then nearest-neighbor resize for the matcher."""

    return PreparedFrame(original=image, ai=center_crop_resize(image, size))


def center_crop_resize(image: RgbImage, size: int) -> RgbImage:
    """Crop the largest centered square, then resize with nearest neighbors."""

    square = center_crop_square(image)
    return resize_nearest(square, size, size)


def center_crop_square(image: RgbImage) -> RgbImage:
    side = min(image.width, image.height)
    x0 = (image.width - side) // 2
    y0 = (image.height - side) // 2
    pixels = bytearray(side * side * 3)
    for y in range(side):
        src = ((y0 + y) * image.width + x0) * 3
        dest = y * side * 3
        pixels[dest : dest + side * 3] = image.pixels[src : src + side * 3]
    return RgbImage(side, side, bytes(pixels))


def resize_nearest(image: RgbImage, width: int, height: int) -> RgbImage:
    if width == image.width and height == image.height:
        return image
    pixels = bytearray(width * height * 3)
    x_ratio = image.width / width
    y_ratio = image.height / height
    for y in range(height):
        src_y = min(image.height - 1, int(y * y_ratio))
        src_row = src_y * image.width * 3
        dest_row = y * width * 3
        for x in range(width):
            src_x = min(image.width - 1, int(x * x_ratio))
            src = src_row + src_x * 3
            dest = dest_row + x * 3
            pixels[dest : dest + 3] = image.pixels[src : src + 3]
    return RgbImage(width, height, bytes(pixels))
