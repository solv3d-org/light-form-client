#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


PAGE_RE = re.compile(r"/Pages/(\d+)\.fpage$")
POINT_RE = re.compile(r"(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)")
OUTPUT_COLUMNS = [
    ("code", "code"),
    ("description", "description"),
    ("vendor", "vendor"),
    ("whse", "whse"),
    ("rlf", "rlf"),
    ("imm", "imm"),
    ("export_price", "export price"),
    ("retail_price", "retail price"),
    ("w_sale_price", "w. sale price"),
]
SOURCE_COLUMNS = [
    ("source_odd_page", "source odd page"),
    ("source_even_page", "source even page"),
    ("row_in_pair", "row in pair"),
]


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def page_map(zf: zipfile.ZipFile) -> dict[int, str]:
    pages: dict[int, str] = {}
    for name in zf.namelist():
        match = PAGE_RE.search(name)
        if match:
            pages[int(match.group(1))] = name
    return pages


def parse_page(zf: zipfile.ZipFile, path: str) -> ET.Element:
    return ET.fromstring(zf.read(path))


def glyphs(page: ET.Element) -> list[tuple[float, float, str]]:
    out: list[tuple[float, float, str]] = []
    for el in page.iter():
        if local_name(el.tag) != "Glyphs":
            continue
        text = el.attrib.get("UnicodeString")
        if not text:
            continue
        out.append((float(el.attrib.get("OriginY", "0")), float(el.attrib.get("OriginX", "0")), text))
    return out


def row_bands(page: ET.Element) -> list[tuple[float, float]]:
    bands: set[tuple[float, float]] = set()
    for el in page.iter():
        if local_name(el.tag) != "Path" or el.attrib.get("Fill", "").lower() != "#ffccffcc":
            continue
        points = [(float(x), float(y)) for x, y in POINT_RE.findall(el.attrib.get("Data", ""))]
        if len(points) < 4:
            continue
        xs = [x for x, _ in points]
        ys = [y for _, y in points]
        width = max(xs) - min(xs)
        height = max(ys) - min(ys)
        if width > 80 and 10 < height < 50:
            bands.add((round(min(ys), 2), round(max(ys), 2)))
    return sorted(bands)


def band_glyphs(items: list[tuple[float, float, str]], top: float, bottom: float) -> list[tuple[float, float, str]]:
    return sorted((y, x, text) for y, x, text in items if top - 0.6 <= y <= bottom + 0.6)


def join_parts(parts: list[str], compact_wraps: bool = False) -> str:
    out = ""
    for raw in parts:
        part = " ".join(raw.split())
        if not part:
            continue
        if not out:
            out = part
            continue
        prev_token = out.rsplit(" ", 1)[-1]
        if compact_wraps and (part == ")" or len(part) == 1 or (len(prev_token) == 1 and part[:1].isalpha())):
            out += part
        elif out.endswith("-"):
            out += part
        else:
            out += " " + part
    return out.strip()


def odd_fields(items: list[tuple[float, float, str]]) -> dict[str, str]:
    cols: dict[str, list[str]] = {
        "code": [],
        "description": [],
        "vendor": [],
        "whse": [],
        "rlf": [],
        "imm": [],
        "export_price": [],
        "retail_price_odd": [],
    }
    for _, x, text in items:
        if 120 <= x < 246:
            cols["code"].append(text)
        elif 246 <= x < 419:
            cols["description"].append(text)
        elif 419 <= x < 497:
            cols["vendor"].append(text)
        elif 497 <= x < 536:
            cols["whse"].append(text)
        elif 536 <= x < 575:
            cols["rlf"].append(text)
        elif 575 <= x < 614:
            cols["imm"].append(text)
        elif 614 <= x < 664:
            cols["export_price"].append(text)
        elif 664 <= x < 715:
            cols["retail_price_odd"].append(text)
    return {
        "code": join_parts(cols["code"], compact_wraps=True),
        "description": join_parts(cols["description"]),
        "vendor": join_parts(cols["vendor"], compact_wraps=True),
        "whse": join_parts(cols["whse"]),
        "rlf": join_parts(cols["rlf"]),
        "imm": join_parts(cols["imm"]),
        "export_price": join_parts(cols["export_price"]),
        "retail_price_odd": join_parts(cols["retail_price_odd"]),
    }


def even_fields(items: list[tuple[float, float, str]]) -> dict[str, str]:
    retail: list[str] = []
    wsale: list[str] = []
    for _, x, text in items:
        if 50 <= x < 112:
            retail.append(text)
        elif 112 <= x < 170:
            wsale.append(text)
    return {"retail_price_even": join_parts(retail), "w_sale_price": join_parts(wsale)}


def extract_rows(oxps_path: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with zipfile.ZipFile(oxps_path) as zf:
        pages = page_map(zf)
        if not pages:
            raise ValueError("no .fpage entries found")
        max_page = max(pages)
        if max_page % 2:
            raise ValueError(f"expected paired pages, got odd max page {max_page}")
        for odd in range(1, max_page + 1, 2):
            even = odd + 1
            if odd not in pages or even not in pages:
                raise ValueError(f"missing page pair {odd}/{even}")
            odd_glyphs = glyphs(parse_page(zf, pages[odd]))
            even_page = parse_page(zf, pages[even])
            even_glyphs = glyphs(even_page)
            for row_in_pair, (top, bottom) in enumerate(row_bands(even_page), start=1):
                left = odd_fields(band_glyphs(odd_glyphs, top, bottom))
                right = even_fields(band_glyphs(even_glyphs, top, bottom))
                row = {
                    "code": left["code"],
                    "description": left["description"],
                    "vendor": left["vendor"],
                    "whse": left["whse"],
                    "rlf": left["rlf"],
                    "imm": left["imm"],
                    "export_price": left["export_price"],
                    "retail_price": right["retail_price_even"] or left["retail_price_odd"],
                    "w_sale_price": right["w_sale_price"],
                    "source_odd_page": str(odd),
                    "source_even_page": str(even),
                    "row_in_pair": str(row_in_pair),
                }
                rows.append(row)
    return rows


def write_csv(rows: list[dict[str, str]], out_path: Path, include_header: bool, include_source: bool) -> None:
    columns = OUTPUT_COLUMNS + (SOURCE_COLUMNS if include_source else [])
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if include_header:
            writer.writerow([header for _, header in columns])
        for row in rows:
            writer.writerow([row[key] for key, _ in columns])


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="extract IMS inventory rows from an OXPS export")
    parser.add_argument("oxps", type=Path)
    parser.add_argument("csv", type=Path)
    parser.add_argument("--expected-rows", type=int, default=22497)
    parser.add_argument("--no-header", action="store_true")
    parser.add_argument("--include-source", action="store_true")
    args = parser.parse_args(argv)

    rows = extract_rows(args.oxps)
    if args.expected_rows is not None and len(rows) != args.expected_rows:
        raise SystemExit(f"row count mismatch: got {len(rows)}, expected {args.expected_rows}")
    write_csv(rows, args.csv, include_header=not args.no_header, include_source=args.include_source)
    print(f"wrote {len(rows)} rows to {args.csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
