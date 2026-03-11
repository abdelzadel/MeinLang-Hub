#!/usr/bin/env python3
"""Create subfolder thumbnail images for the hub.

Rules:
- Each text subfolder may contain `img.jpeg`.
- If missing, this script generates a default image.
- A shared fallback image is written to `site/assets/default-subfolder-img.jpeg`.
"""

from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

IMAGE_NAME = "img.jpeg"
DEFAULT_IMAGE_RELATIVE_PATH = Path("assets/default-subfolder-img.jpeg")
SIZE = (1200, 675)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate default img.jpeg files for subfolders.")
    parser.add_argument(
        "--site-root",
        default=Path(__file__).resolve().parents[1],
        type=Path,
        help="Path to site root. Defaults to this repository's site folder.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing img.jpeg files.",
    )
    return parser.parse_args()


def title_case(value: str) -> str:
    cleaned = re.sub(r"[_\-/]+", " ", str(value or "")).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.title() if cleaned else "Subfolder"


def pick_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for font_path in candidates:
        path = Path(font_path)
        if not path.is_file():
            continue
        try:
            return ImageFont.truetype(str(path), size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def gradient_colors(seed: str) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()
    r = int(digest[0:2], 16)
    g = int(digest[2:4], 16)
    b = int(digest[4:6], 16)

    start = (
        int(70 + (r / 255) * 110),
        int(80 + (g / 255) * 100),
        int(120 + (b / 255) * 90),
    )
    end = (
        max(25, start[0] - 55),
        max(25, start[1] - 55),
        max(40, start[2] - 55),
    )
    return start, end


def draw_vertical_gradient(img: Image.Image, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> None:
    draw = ImageDraw.Draw(img)
    width, height = img.size
    for y in range(height):
        ratio = y / max(1, height - 1)
        color = (
            int(top[0] + (bottom[0] - top[0]) * ratio),
            int(top[1] + (bottom[1] - top[1]) * ratio),
            int(top[2] + (bottom[2] - top[2]) * ratio),
        )
        draw.line([(0, y), (width, y)], fill=color)


def text_bbox(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> tuple[int, int, int, int]:
    return draw.textbbox((0, 0), text, font=font)


def create_image(output_path: Path, label: str, subtitle: str, seed: str) -> None:
    img = Image.new("RGB", SIZE)
    top, bottom = gradient_colors(seed)
    draw_vertical_gradient(img, top, bottom)

    draw = ImageDraw.Draw(img)
    width, height = img.size

    # Soft lower overlay for readability.
    overlay_top = int(height * 0.58)
    draw.rectangle([(0, overlay_top), (width, height)], fill=(20, 24, 34, 125))

    title_font = pick_font(72)
    subtitle_font = pick_font(34)

    title_box = text_bbox(draw, label, title_font)
    title_w = title_box[2] - title_box[0]
    title_h = title_box[3] - title_box[1]

    subtitle_box = text_bbox(draw, subtitle, subtitle_font)
    subtitle_w = subtitle_box[2] - subtitle_box[0]

    title_x = max(56, (width - title_w) // 2)
    title_y = int(height * 0.68 - title_h // 2)
    subtitle_x = max(56, (width - subtitle_w) // 2)
    subtitle_y = title_y + title_h + 20

    shadow_offset = 2
    draw.text((title_x + shadow_offset, title_y + shadow_offset), label, font=title_font, fill=(0, 0, 0))
    draw.text((title_x, title_y), label, font=title_font, fill=(255, 255, 255))

    draw.text(
        (subtitle_x + shadow_offset, subtitle_y + shadow_offset),
        subtitle,
        font=subtitle_font,
        fill=(0, 0, 0),
    )
    draw.text((subtitle_x, subtitle_y), subtitle, font=subtitle_font, fill=(232, 240, 255))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, format="JPEG", quality=90, optimize=True, progressive=True)


def list_text_subfolders(texts_root: Path) -> list[Path]:
    paths: list[Path] = []
    if not texts_root.is_dir():
        return paths

    for language_dir in sorted(texts_root.iterdir(), key=lambda p: p.name.lower()):
        if not language_dir.is_dir() or language_dir.name.startswith("."):
            continue

        for subfolder in sorted(language_dir.iterdir(), key=lambda p: p.name.lower()):
            if subfolder.is_dir() and not subfolder.name.startswith("."):
                paths.append(subfolder)

    return paths


def main() -> int:
    args = parse_args()
    site_root = args.site_root.expanduser().resolve()
    texts_root = site_root / "texts"

    if not texts_root.is_dir():
        raise FileNotFoundError(f"Could not find texts directory: {texts_root}")

    default_image_path = site_root / DEFAULT_IMAGE_RELATIVE_PATH
    create_image(default_image_path, "Mein Lang Hub", "Default Subfolder", "default-subfolder")

    created = 0
    overwritten = 0
    skipped = 0

    for subfolder in list_text_subfolders(texts_root):
        image_path = subfolder / IMAGE_NAME
        existed_before = image_path.exists()

        if existed_before and not args.force:
            skipped += 1
            continue

        language_name = subfolder.parent.name
        label = title_case(subfolder.name)
        subtitle = f"{title_case(language_name)}"
        create_image(image_path, label, subtitle, f"{language_name}/{subfolder.name}")

        if existed_before:
            overwritten += 1
        else:
            created += 1

    print(f"Default fallback image: {default_image_path}")
    print(f"Subfolder images - created: {created}, overwritten: {overwritten}, skipped: {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
