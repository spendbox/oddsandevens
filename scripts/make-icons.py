#!/usr/bin/env python3
"""
Renders the maskable PNG app icons that the web manifest points at.

Android wants real PNGs at fixed sizes for the home-screen icon; it will not
rasterise the SVG for that slot. Rather than add an image library to the
project for two files that change about once a year, this draws them directly
and writes the PNG by hand. Run it after editing src/app/icon.svg so the two
do not drift:

    python3 scripts/make-icons.py

The artwork is kept in step with icon.svg by construction: same 64-unit box,
same gradient stops, same glyph coordinates, all scaled by SIZE/64.
"""

import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public"

# Matches the <linearGradient> in src/app/icon.svg.
GRAD_FROM = (0x63, 0x66, 0xF1)
GRAD_TO = (0x4F, 0x46, 0xE5)

# Supersampling factor. The glyph is thin strokes with round caps, and without
# this the edges stair-step badly at 192px.
SS = 4


def rounded_rect_alpha(x, y, w, h, r):
    """Coverage of a rounded rectangle at a point, as 0 or 1 (pre-supersample)."""
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), h - r)
    if x < r or x > w - r:
        if y < r or y > h - r:
            return 1.0 if (x - cx) ** 2 + (y - cy) ** 2 <= r * r else 0.0
    return 1.0 if 0 <= x <= w and 0 <= y <= h else 0.0


def seg_distance(px, py, ax, ay, bx, by):
    """Distance from a point to the line segment ab."""
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    length = vx * vx + vy * vy
    t = 0.0 if length == 0 else max(0.0, min(1.0, (wx * vx + wy * vy) / length))
    dx, dy = ax + t * vx - px, ay + t * vy - py
    return (dx * dx + dy * dy) ** 0.5


def render(size):
    """Returns RGBA bytes for one icon at the given pixel size."""
    scale = size / 64.0
    radius = 15 * scale
    stroke = (4.5 * scale) / 2.0  # half-width, since we measure from the centre line

    # The three strokes of the cursor glyph, in the same 64-unit coordinates
    # as icon.svg: a top serif, the stem, and a bottom serif.
    strokes = [
        (25, 19, 39, 19),
        (32, 19, 32, 45),
        (25, 45, 39, 45),
    ]
    strokes = [(a * scale, b * scale, c * scale, d * scale) for a, b, c, d in strokes]

    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r_acc = g_acc = b_acc = a_acc = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    x = px + (sx + 0.5) / SS
                    y = py + (sy + 0.5) / SS

                    inside = rounded_rect_alpha(x, y, size, size, radius)
                    if inside <= 0:
                        continue

                    # Gradient runs corner to corner, matching the SVG's
                    # userSpaceOnUse 0,0 -> 64,64.
                    t = max(0.0, min(1.0, (x + y) / (2.0 * size)))
                    cr = GRAD_FROM[0] + (GRAD_TO[0] - GRAD_FROM[0]) * t
                    cg = GRAD_FROM[1] + (GRAD_TO[1] - GRAD_FROM[1]) * t
                    cb = GRAD_FROM[2] + (GRAD_TO[2] - GRAD_FROM[2]) * t

                    on_glyph = any(
                        seg_distance(x, y, *s) <= stroke for s in strokes
                    )
                    if on_glyph:
                        cr = cg = cb = 255.0

                    r_acc += cr
                    g_acc += cg
                    b_acc += cb
                    a_acc += 255.0

            n = SS * SS
            if a_acc == 0:
                row += bytes((0, 0, 0, 0))
            else:
                # Un-premultiply so partially covered edge pixels keep their hue.
                cover = a_acc / (255.0 * n)
                row += bytes(
                    (
                        int(round(r_acc / (n * cover))),
                        int(round(g_acc / (n * cover))),
                        int(round(b_acc / (n * cover))),
                        int(round(a_acc / n)),
                    )
                )
        rows.append(bytes(row))
    return rows


def write_png(path, rows, size):
    raw = b"".join(b"\x00" + row for row in rows)  # filter byte 0 per scanline

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        target = OUT / f"icon-{size}.png"
        write_png(target, render(size), size)
        print(f"wrote {target.relative_to(OUT.parent)} ({target.stat().st_size} bytes)")
