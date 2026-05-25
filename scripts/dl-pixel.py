#!/usr/bin/env python3
"""
DL Logo — pixel-art generator with PNG output.
Design DL logos on a pixel grid, render as PNG for true visual preview.
Also exports the exact Unicode block-character strings for terminal use.

Usage:
  python3 scripts/dl-pixel.py              # render all designs to PNG
  python3 scripts/dl-pixel.py --ascii       # print block-character versions
  python3 scripts/dl-pixel.py --design 3    # render only design index 3
"""

import sys
import os

# Pixel grid: each cell = 0 (off) or 1 (on)
# Convert 2×2 pixel blocks → Unicode quadrant characters:
#
#   0 0    0 1    1 0    1 1
#   0 0    0 0    0 0    0 0
#   ' '    '▗'    '▖'    '▄'
#
#   0 0    0 1    1 0    1 1
#   0 1    0 1    0 1    0 1
#   '▝'    '▐'    '▞'    '▟'
#
#   0 0    0 1    1 0    1 1
#   1 0    1 0    1 0    1 0
#   '▘'    '▚'    '▌'    '▙'
#
#   0 0    0 1    1 0    1 1
#   1 1    1 1    1 1    1 1
#   '▀'    '▜'    '▛'    '█'


def pixels_to_block(pixels, px, py):
    """Convert a 2×2 block of pixels to a Unicode quadrant char."""
    tl = pixels[py][px] if py < len(pixels) and px < len(pixels[0]) else 0
    tr = pixels[py][px + 1] if py < len(pixels) and px + 1 < len(pixels[0]) else 0
    bl = pixels[py + 1][px] if py + 1 < len(pixels) and px < len(pixels[0]) else 0
    br = pixels[py + 1][px + 1] if py + 1 < len(pixels) and px + 1 < len(pixels[0]) else 0
    idx = (tl << 3) | (tr << 2) | (bl << 1) | br
    return [
        ' ', '▗', '▖', '▄',
        '▝', '▐', '▞', '▟',
        '▘', '▚', '▌', '▙',
        '▀', '▜', '▛', '█',
    ][idx]


def grid_to_strings(pixels):
    """Convert pixel grid (even dimensions) to block-character strings."""
    h = len(pixels)
    w = len(pixels[0])
    rows = []
    for py in range(0, h, 2):
        line = ''
        for px in range(0, w, 2):
            line += pixels_to_block(pixels, px, py)
        rows.append(line)
    return rows


def p(rows):
    """Parse a compact text grid to pixel array."""
    h = len(rows)
    w = max(len(r) for r in rows)
    grid = [[0] * w for _ in range(h)]
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch in '█#●■◆⬛⬛1xX*':
                grid[y][x] = 1
    return grid


# ═══════════════════════════════════════════════════════════
# DESIGN DEFINITIONS  (pixel grids, each char = 1 pixel)
# ═══════════════════════════════════════════════════════════

DESIGNS = {}

# ── Design 0: Current (for reference) ──
DESIGNS['0-current'] = p([
    "..████...██",
    ".█....███.█",
    "██......███",
    "██......███",
    ".█....███.█",
    "..████...██",
])

# ── Design 1: Classic rounded D, slim L ──
DESIGNS['1-rounded-slim'] = p([
    "..████..██",
    ".█....█.██",
    "██......██",
    "██......██",
    ".█....█.██",
    "..████..██",
])

# ── Design 2: Modern rounded D, medium L ──
DESIGNS['2-rounded-mid'] = p([
    "..████..██.",
    ".█.....█.██",
    "█.......███",
    "█.......███",
    ".█.....█.██",
    "..████..███",
])

# ── Design 3: Wide D + thick L base ──
DESIGNS['3-wide-thick'] = p([
    "...█████..██.",
    "..█.....█.███",
    ".█.......████",
    ".█.......████",
    "..█.....█.███",
    "...█████..███",
])

# ── Design 4: Tall elegant (8px tall) ──
DESIGNS['4-tall-elegant'] = p([
    "....█████...██.",
    "...█.....█..███",
    "..█.......█.███",
    ".█.........████",
    ".█.........████",
    "..█.......█.███",
    "...█.....█..███",
    "....█████...███",
])

# ── Design 5: Grand (10px tall) ──
DESIGNS['5-grand'] = p([
    ".....██████....███.",
    "....█......█...███.",
    "...█........█..███.",
    "..█..........█.███.",
    ".█............████.",
    ".█............████.",
    "..█..........█.███.",
    "...█........█..███.",
    "....█......█...███.",
    ".....██████....████",
])

# ── Design 6: Compact square D ──
DESIGNS['6-compact-square'] = p([
    "..████..███",
    ".█....█.███",
    ".█....█.███",
    ".█....█.███",
    ".█....█.███",
    "..████..███",
])

# ── Design 7: Bold D, thick L (even pixel sizes) ──
DESIGNS['7-bold-balanced'] = p([
    "....████....███.",
    "...█....█...███.",
    "..█......█..███.",
    "..█......█..███.",
    "..█......█..███.",
    "...█....█...███.",
    "....████....████",
    ".............██.",
])

# ── Design 8: Minimal D, prominent L ──
DESIGNS['8-minimal'] = p([
    "...████...██..",
    "..█....█..██..",
    "..█....█..██..",
    "..█....█..██..",
    "..█....█..██..",
    "...████...████",
])

# ── Design 9: Sleek modern ──
DESIGNS['9-sleek'] = p([
    "....█████...██.",
    "...█.....█..██.",
    "..█.......█.██.",
    "..█.......█.██.",
    "..█.......█.██.",
    "...█.....█..██.",
    "....█████...███",
    ".............██",
])


def render_all_ascii():
    """Print all designs as terminal block characters."""
    for name, pixels in DESIGNS.items():
        rows = grid_to_strings(pixels)
        w = max(len(r) for r in rows)
        print()
        print(f"  ┌─ {name} ({w}×{len(rows)}) ─{'─' * (50 - len(name))}┐")
        for row in rows:
            # Use simple spaces for alignment
            print(f"  │ \033[38;5;208m{row}\033[0m")
        print(f"  └{'─' * (w + 2)}┘")
        print(f"  Strings: {[repr(r) for r in rows]}")


def render_one_ascii(name):
    """Print one design enlarged."""
    pixels = DESIGNS.get(name)
    if not pixels:
        print(f"Unknown: {name}")
        print("Available:", list(DESIGNS.keys()))
        return
    rows = grid_to_strings(pixels)
    w = max(len(r) for r in rows)
    print()
    print(f"  {name} — {w} cols × {len(rows)} rows")
    print(f"  {'─' * 40}")
    print()
    for row in rows:
        # Print each row 3x for easier viewing
        for _ in range(2):
            print(f"    {row}")
    print()
    print(f"  Copy-paste ready:")
    for row in rows:
        print(f"    {repr(row)}")
    print()


def render_png(name=None, outdir="/tmp/dl-logos"):
    """Render designs as PNG images using PIL."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        print("PIL not available. Install with: pip install Pillow")
        print("Falling back to ASCII output...")
        render_all_ascii()
        return

    os.makedirs(outdir, exist_ok=True)

    items = [(name, DESIGNS[name])] if name else list(DESIGNS.items())

    for dname, pixels in items:
        rows = grid_to_strings(pixels)
        h = len(rows)
        w = max(len(r) for r in rows)

        # Render using monospace font
        cell_w, cell_h = 24, 42
        pad = 30
        img_w = w * cell_w + pad * 2
        img_h = h * cell_h + pad * 2

        img = Image.new('RGB', (img_w, img_h), '#0a0a0a')
        draw = ImageDraw.Draw(img)

        # Try to load a good monospace font
        font = None
        for fp in [
            '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
            '/usr/share/fonts/truetype/noto/NotoSansMono-Regular.ttf',
            '/System/Library/Fonts/Menlo.ttc',
            'C:\\Windows\\Fonts\\consola.ttf',
        ]:
            if os.path.exists(fp):
                try:
                    font = ImageFont.truetype(fp, 28)
                except Exception:
                    pass
                break

        for y, row in enumerate(rows):
            for x, ch in enumerate(row):
                if ch == ' ':
                    continue
                px = pad + x * cell_w
                py = pad + y * cell_h
                # Pillow textbbox is available in newer versions
                try:
                    bb = draw.textbbox((0, 0), ch, font=font)
                    tx = px + (cell_w - (bb[2] - bb[0])) // 2 - bb[0]
                    ty = py + (cell_h - (bb[3] - bb[1])) // 2 - bb[1]
                except Exception:
                    tx, ty = px + 2, py + 2
                draw.text((tx, ty), ch, fill='#ff6b35', font=font)

        outpath = os.path.join(outdir, f"{dname}.png")
        img.save(outpath)
        print(f"  → {outpath}  ({img_w}×{img_h})")


if __name__ == "__main__":
    args = sys.argv[1:]

    if '--ascii' in args:
        # Filter to specific design if requested
        for a in args:
            if a.startswith('--design='):
                render_one_ascii(a.split('=', 1)[1])
                break
        else:
            render_all_ascii()
    elif '--list' in args:
        for name in DESIGNS:
            rows = grid_to_strings(DESIGNS[name])
            print(f"  {name}: {max(len(r) for r in rows)}×{len(rows)}")
    else:
        # Try PNG, fall back to ASCII
        target = None
        for a in args:
            if a.startswith('--design='):
                target = a.split('=', 1)[1]
                break
        render_png(target)
