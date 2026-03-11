#!/usr/bin/env python3
"""Extract and import "Becoming fluent in: German - 150 short stories".

The script creates one text file per numbered story and refreshes
`site/texts/catalog.json` so the static index includes the imported folder.
"""

from __future__ import annotations

import argparse
import json
import re
import unicodedata
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path

from pypdf import PdfReader

try:
    from ftfy import fix_text
except ImportError as exc:
    raise SystemExit("Missing dependency 'ftfy'. Install it with: python3 -m pip install ftfy") from exc

STORY_HEADER_RE = re.compile(r"^\s*(\d{1,3})\.\s+(.+?)\s*$")


def normalize_line(raw_line: str) -> str:
    line = raw_line.replace("\u00a0", " ").replace("\t", " ")
    line = re.sub(r" {2,}", " ", line)
    return line.rstrip()


def alpha_token(value: str) -> str:
    return "".join(ch.lower() for ch in value if ch.isalpha())


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    without_marks = "".join(ch for ch in normalized if not unicodedata.combining(ch))
    slug = re.sub(r"[^a-z0-9]+", "_", without_marks.lower()).strip("_")
    return slug or "story"


def collapse_blank_lines(lines: list[str]) -> list[str]:
    collapsed: list[str] = []
    previous_blank = True
    for line in lines:
        is_blank = not line.strip()
        if is_blank and previous_blank:
            continue
        collapsed.append("" if is_blank else line)
        previous_blank = is_blank
    while collapsed and not collapsed[-1].strip():
        collapsed.pop()
    return collapsed


def truncate_at_fragen(lines: list[str]) -> list[str]:
    kept: list[str] = []
    for line in lines:
        if alpha_token(line) == "fragen":
            break
        kept.append(line)
    return kept


def join_wrapped_lines(lines: list[str]) -> str:
    joined = ""
    for raw in lines:
        part = raw.strip()
        if not part:
            continue
        if not joined:
            joined = part
            continue
        # Merge PDF line wraps and preserve words split by trailing hyphen.
        if joined.endswith("-"):
            joined = f"{joined[:-1]}{part}"
        else:
            joined = f"{joined} {part}"

    joined = re.sub(r"\s+([,.;:!?])", r"\1", joined)
    joined = re.sub(r"\(\s+", "(", joined)
    joined = re.sub(r"\s+\)", ")", joined)
    joined = re.sub(r"\s{2,}", " ", joined).strip()
    return joined


def format_story_body(lines: list[str]) -> str:
    clipped = collapse_blank_lines(truncate_at_fragen(lines))
    paragraphs: list[str] = []
    chunk: list[str] = []

    for line in clipped:
        if not line.strip():
            if chunk:
                paragraph = join_wrapped_lines(chunk)
                if paragraph:
                    paragraphs.append(fix_text(paragraph))
                chunk = []
            continue
        chunk.append(line)

    if chunk:
        paragraph = join_wrapped_lines(chunk)
        if paragraph:
            paragraphs.append(fix_text(paragraph))

    return "\n\n".join(paragraphs).strip()


def extract_stories(pdf_path: Path) -> OrderedDict[int, dict[str, object]]:
    reader = PdfReader(str(pdf_path))
    stories: OrderedDict[int, dict[str, object]] = OrderedDict()
    current_number: int | None = None
    stop = False

    for page in reader.pages:
        if stop:
            break
        text = page.extract_text() or ""
        for raw_line in text.replace("\r", "\n").splitlines():
            line = normalize_line(raw_line)

            if alpha_token(line) == "afterword":
                stop = True
                break

            header_match = STORY_HEADER_RE.match(line)
            if header_match:
                number = int(header_match.group(1))
                title = header_match.group(2).strip()
                if 1 <= number <= 150:
                    current_number = number
                    stories[number] = {"title": title, "lines": []}
                    continue

            if current_number is not None:
                stories[current_number]["lines"].append(line)

    return stories


def story_text(number: int, title: str, lines: list[str]) -> str:
    heading = fix_text(f"{number}. {title}")
    body = format_story_body(lines)
    if body:
        return f"{heading}\n\n{body}\n"
    return f"{heading}\n"


def write_story_files(stories: OrderedDict[int, dict[str, object]], output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    for existing in output_dir.glob("*.txt"):
        existing.unlink()

    for number, payload in stories.items():
        title = str(payload["title"])
        lines = [str(line) for line in payload["lines"]]
        filename = f"{number:03d}_{slugify(title)}.txt"
        content = story_text(number, title, lines)
        (output_dir / filename).write_text(content, encoding="utf-8")


def build_tree(node_path: Path) -> dict[str, object]:
    tree: dict[str, object] = {}
    for entry in sorted(node_path.iterdir(), key=lambda item: item.name.lower()):
        if entry.name.startswith("."):
            continue
        if entry.is_dir():
            subtree = build_tree(entry)
            if subtree:
                tree[entry.name] = subtree
            continue
        if entry.is_file() and entry.suffix.lower() == ".txt":
            tree[entry.name] = True
    return tree


def refresh_catalog(texts_root: Path, catalog_path: Path) -> None:
    payload = {
        "version": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "root": texts_root.name,
        "tree": build_tree(texts_root),
    }
    catalog_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import 150 German short stories from a PDF into the hub.")
    parser.add_argument(
        "--pdf",
        required=True,
        type=Path,
        help="Absolute path to the source PDF file.",
    )
    parser.add_argument(
        "--site-root",
        default=Path(__file__).resolve().parents[1],
        type=Path,
        help="Path to the site root (defaults to repository's site folder).",
    )
    parser.add_argument(
        "--language",
        default="german",
        help="Language folder under texts/ (default: german).",
    )
    parser.add_argument(
        "--subfolder",
        default="BECOMING_FLUENT_150_STORIES",
        help="Target subfolder under texts/<language>/.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    pdf_path = args.pdf.expanduser().resolve()
    if not pdf_path.is_file():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    site_root = args.site_root.expanduser().resolve()
    texts_root = site_root / "texts"
    if not texts_root.is_dir():
        raise FileNotFoundError(f"Could not find texts directory at: {texts_root}")

    stories = extract_stories(pdf_path)

    expected = set(range(1, 151))
    found = set(stories.keys())
    missing = sorted(expected - found)
    if missing:
        raise ValueError(f"Expected stories 1..150, missing: {missing[:10]}")

    output_dir = texts_root / args.language / args.subfolder
    write_story_files(stories, output_dir)

    catalog_path = texts_root / "catalog.json"
    refresh_catalog(texts_root, catalog_path)

    print(f"Imported {len(stories)} stories into: {output_dir}")
    print(f"Catalog updated: {catalog_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
