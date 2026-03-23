#!/usr/bin/env python3
"""Generate the Adobe AI Bridge app icon and the macOS iconset from vector-like shapes."""

from __future__ import annotations

import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICON_DIR = ROOT / "apps" / "desktop" / "src-tauri" / "icons"


def render(size: int) -> Image.Image:
    scale = size / 512
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    box = tuple(round(value * scale) for value in (20, 20, 492, 492))
    draw.rounded_rectangle(box, radius=round(110 * scale), fill="#253D38")

    def point(x: float, y: float) -> tuple[int, int]:
        return round(x * scale), round(y * scale)

    line_width = max(2, round(25 * scale))
    draw.line([point(105, 300), point(407, 300)], fill="#F4F3EF", width=line_width)
    arch = [point(105 + 302 * index / 80, 300 - 122 * math.sin(math.pi * index / 80)) for index in range(81)]
    draw.line(arch, fill="#F4F3EF", width=line_width, joint="curve")
    draw.line([point(155, 297), point(155, 393)], fill="#F4F3EF", width=line_width)
    draw.line([point(357, 297), point(357, 393)], fill="#F4F3EF", width=line_width)
    draw.line([point(115, 393), point(397, 393)], fill="#F4F3EF", width=line_width)
    return image


def main() -> None:
    ICON_DIR.mkdir(parents=True, exist_ok=True)
    render(512).save(ICON_DIR / "icon.png")
    iconset = ICON_DIR / "icon.iconset"
    iconset.mkdir(exist_ok=True)
    sizes = {
        "icon_16x16.png": 16,
        "icon_16x16@2x.png": 32,
        "icon_32x32.png": 32,
        "icon_32x32@2x.png": 64,
        "icon_128x128.png": 128,
        "icon_128x128@2x.png": 256,
        "icon_256x256.png": 256,
        "icon_256x256@2x.png": 512,
        "icon_512x512.png": 512,
        "icon_512x512@2x.png": 1024,
    }
    for name, size in sizes.items():
        render(size).save(iconset / name)
    subprocess.run(
        ["/usr/bin/iconutil", "-c", "icns", str(iconset), "-o", str(ICON_DIR / "icon.icns")],
        check=True,
    )
    print(f"Generated the macOS app icon at {ICON_DIR}")


if __name__ == "__main__":
    main()
