#!/usr/bin/env python3
"""
3D Block Letter Generator v4 — Clean shadow-extrusion style.
Renders any text with a right+down shadow using light blocks (░▒▓)
and front face using dark blocks (█).

Two styles:
  shadow  — front=█, shadow=░░ offset right & down
  extrude — front=█, top=▀, right=▐, corner=▜
  solid   — flat block letters, no 3D (for font debugging)

Usage:
  python3 block3d.py "DL"
  python3 block3d.py HELLO WORLD
  python3 block3d.py DL --extrude
  python3 block3d.py DL --solid
  python3 block3d.py --all
"""
import sys

# ═══ Font: 5×7 pixel bitmaps ═══
# Each row is a hex number, bits MSB=left LSB=right

FONT = {}
def letter(c, *hexrows):
    FONT[c] = [[(r >> b) & 1 for b in range(4, -1, -1)] for r in hexrows]

letter('A', 0x04,0x0A,0x11,0x11,0x1F,0x11,0x11)
letter('B', 0x1E,0x11,0x11,0x1E,0x11,0x11,0x1E)
letter('C', 0x0E,0x11,0x10,0x10,0x10,0x11,0x0E)
letter('D', 0x1E,0x11,0x11,0x11,0x11,0x11,0x1E)
letter('E', 0x1F,0x10,0x10,0x1E,0x10,0x10,0x1F)
letter('F', 0x1F,0x10,0x10,0x1E,0x10,0x10,0x10)
letter('G', 0x0E,0x11,0x10,0x17,0x11,0x11,0x0E)
letter('H', 0x11,0x11,0x11,0x1F,0x11,0x11,0x11)
letter('I', 0x0E,0x04,0x04,0x04,0x04,0x04,0x0E)
letter('J', 0x07,0x02,0x02,0x02,0x02,0x12,0x0C)
letter('K', 0x11,0x12,0x14,0x18,0x14,0x12,0x11)
letter('L', 0x10,0x10,0x10,0x10,0x10,0x10,0x1F)
letter('M', 0x11,0x1B,0x15,0x11,0x11,0x11,0x11)
letter('N', 0x11,0x19,0x15,0x13,0x11,0x11,0x11)
letter('O', 0x0E,0x11,0x11,0x11,0x11,0x11,0x0E)
letter('P', 0x1E,0x11,0x11,0x1E,0x10,0x10,0x10)
letter('Q', 0x0E,0x11,0x11,0x11,0x15,0x12,0x0D)
letter('R', 0x1E,0x11,0x11,0x1E,0x14,0x12,0x11)
letter('S', 0x0F,0x10,0x10,0x0E,0x01,0x01,0x1E)
letter('T', 0x1F,0x04,0x04,0x04,0x04,0x04,0x04)
letter('U', 0x11,0x11,0x11,0x11,0x11,0x11,0x0E)
letter('V', 0x11,0x11,0x11,0x11,0x0A,0x0A,0x04)
letter('W', 0x11,0x11,0x11,0x11,0x15,0x1B,0x11)
letter('X', 0x11,0x11,0x0A,0x04,0x0A,0x11,0x11)
letter('Y', 0x11,0x11,0x0A,0x04,0x04,0x04,0x04)
letter('Z', 0x1F,0x01,0x02,0x04,0x08,0x10,0x1F)


def render_shadow(grid, depth=2):
    """
    Clean shadow 3D: front face = █, shadow = ░ only outside the letter.
    Shadow offset right & down by `depth`.
    """
    H, W = len(grid), len(grid[0])
    out_H = H * 2 + depth + 3
    out_W = W * 2 + depth + 4
    C = [[' ' for _ in range(out_W)] for _ in range(out_H)]

    # Pass 1: map the solid letter position (boolean mask)
    solid_mask = [[False] * out_W for _ in range(out_H)]
    for py in range(H):
        for px in range(W):
            if grid[py][px]:
                fx, fy = 2 + px * 2, 2 + py * 2
                for dy in range(2):
                    for dx in range(2):
                        solid_mask[fy + dy][fx + dx] = True

    # Pass 2: draw shadow only where solid mask is False
    for py in range(H):
        for px in range(W):
            if not grid[py][px]:
                continue
            fx, fy = 2 + px * 2, 2 + py * 2
            for dy in range(2):
                for dx in range(2):
                    sx, sy = fx + depth + dx, fy + depth + dy
                    if 0 <= sy < out_H and 0 <= sx < out_W:
                        if not solid_mask[sy][sx]:
                            C[sy][sx] = '░'

    # Pass 3: draw front face (overwrites shadows inside letter)
    for py in range(H):
        for px in range(W):
            if grid[py][px]:
                fx, fy = 2 + px * 2, 2 + py * 2
                for dy in range(2):
                    for dx in range(2):
                        C[fy + dy][fx + dx] = '█'

    # Trim empty borders
    while C and all(c == ' ' for c in C[0]):
        C.pop(0)
    while C and all(c == ' ' for c in C[-1]):
        C.pop()
    if not C:
        return ['']
    l = 0
    while all(r[l] == ' ' for r in C):
        l += 1
    r = len(C[0]) - 1
    while all(row[r] == ' ' for row in C):
        r -= 1
    return [''.join(row[l:r + 1]) for row in C]


def render_extrude(grid):
    """
    Isometric-ish extrusion: front=█, top=▀, right=▐, corner=▜.
    Single-step extrusion for clean look.
    """
    H, W = len(grid), len(grid[0])
    out_H = H * 2 + 5
    out_W = W * 2 + 5
    C = [[' ' for _ in range(out_W)] for _ in range(out_H)]

    for py in range(H - 1, -1, -1):
        for px in range(W - 1, -1, -1):
            if not grid[py][px]:
                continue
            fx, fy = 3 + px * 2, 3 + py * 2

            # Front
            for dy in range(2):
                for dx in range(2):
                    C[fy + dy][fx + dx] = '█'

            # Top edge (up-right diagonal, one step)
            for dx in range(2):
                cx = fx + dx
                if C[fy - 1][cx] == ' ':
                    C[fy - 1][cx] = '▀'
            # Right edge
            for dy in range(2):
                if C[fy + dy][fx + 2] == ' ':
                    C[fy + dy][fx + 2] = '▐'
            # Corner
            if C[fy - 1][fx + 2] == ' ':
                C[fy - 1][fx + 2] = '▜'

            # Second step of extrusion (depth)
            # Top, 2nd step
            if fy > 1:
                for dx in range(2):
                    cx = fx + 1 + dx
                    if 0 <= cx < out_W and C[fy - 2][cx] == ' ':
                        C[fy - 2][cx] = '▀'
            # Right, 2nd step
            if fx + 3 < out_W:
                for dy in range(2):
                    if C[fy + dy][fx + 3] == ' ':
                        C[fy + dy][fx + 3] = '▐'
            # Corner 2nd step
            if fy > 1 and fx + 3 < out_W and C[fy - 2][fx + 3] == ' ':
                C[fy - 2][fx + 3] = '▜'
            # Diag corner
            if fy > 1 and fx + 2 < out_W and C[fy - 1][fx + 3] == ' ':
                C[fy - 1][fx + 3] = '▜'

    # Trim
    while C and all(c == ' ' for c in C[0]):
        C.pop(0)
    while C and all(c == ' ' for c in C[-1]):
        C.pop()
    if not C:
        return ['']
    l = 0
    while all(r[l] == ' ' for r in C):
        l += 1
    r = len(C[0]) - 1
    while all(row[r] == ' ' for row in C):
        r -= 1
    return [''.join(row[l:r + 1]) for row in C]


def render_solid(grid):
    """Flat block letters — no 3D. For verifying the font."""
    H, W = len(grid), len(grid[0])
    out_H = H * 2
    out_W = W * 2
    C = [[' ' for _ in range(out_W)] for _ in range(out_H)]
    for py in range(H):
        for px in range(W):
            if grid[py][px]:
                for dy in range(2):
                    for dx in range(2):
                        C[py * 2 + dy][px * 2 + dx] = '█'
    # Trim left/right empty cols
    l = 0
    while all(r[l] == ' ' for r in C):
        l += 1
    r = out_W - 1
    while all(row[r] == ' ' for row in C):
        r -= 1
    return [''.join(row[l:r + 1]) for row in C]


def render_outline(grid, depth=2):
    """
    Hollow outline letters with shadow.
    Only the outer boundary of the letter is drawn, interior is empty.
    Shadow falls outside.
    """
    H, W = len(grid), len(grid[0])
    out_H = H * 2 + depth + 3
    out_W = W * 2 + depth + 4
    C = [[' ' for _ in range(out_W)] for _ in range(out_H)]

    # Determine which 2×2 blocks are "edge" blocks
    # A filled pixel is an edge if it has an empty neighbor (NSEW)
    is_edge = [[False] * W for _ in range(H)]
    for py in range(H):
        for px in range(W):
            if not grid[py][px]:
                continue
            # Check 4 neighbors
            for ny, nx in [(py-1,px),(py+1,px),(py,px-1),(py,px+1)]:
                if ny < 0 or ny >= H or nx < 0 or nx >= W or not grid[ny][nx]:
                    is_edge[py][px] = True
                    break

    # Build solid mask for edge blocks only
    solid_mask = [[False] * out_W for _ in range(out_H)]
    for py in range(H):
        for px in range(W):
            if is_edge[py][px]:
                fx, fy = 2 + px * 2, 2 + py * 2
                for dy in range(2):
                    for dx in range(2):
                        solid_mask[fy + dy][fx + dx] = True

    # Shadow (from edge blocks only)
    for py in range(H):
        for px in range(W):
            if not is_edge[py][px]:
                continue
            fx, fy = 2 + px * 2, 2 + py * 2
            for dy in range(2):
                for dx in range(2):
                    sx, sy = fx + depth + dx, fy + depth + dy
                    if 0 <= sy < out_H and 0 <= sx < out_W:
                        if not solid_mask[sy][sx]:
                            C[sy][sx] = '░'

    # Front face (edge only)
    for py in range(H):
        for px in range(W):
            if is_edge[py][px]:
                fx, fy = 2 + px * 2, 2 + py * 2
                for dy in range(2):
                    for dx in range(2):
                        C[fy + dy][fx + dx] = '█'

    # Trim
    while C and all(c == ' ' for c in C[0]):
        C.pop(0)
    while C and all(c == ' ' for c in C[-1]):
        C.pop()
    if not C:
        return ['']
    l = 0
    while all(r[l] == ' ' for r in C):
        l += 1
    r = len(C[0]) - 1
    while all(row[r] == ' ' for row in C):
        r -= 1
    return [''.join(row[l:r + 1]) for row in C]


def render_bevel(grid):
    """
    Raised/embossed bevel style.
    Top-left edges use lighter blocks (▀, ▌) for highlight.
    Bottom-right edges use darker shade (░, ▒) for shadow.
    Front face uses █.
    """
    H, W = len(grid), len(grid[0])
    out_H = H * 2 + 4
    out_W = W * 2 + 4
    C = [[' ' for _ in range(out_W)] for _ in range(out_H)]

    for py in range(H):
        for px in range(W):
            if not grid[py][px]:
                continue
            fx, fy = 3 + px * 2, 3 + py * 2

            # Front face
            for dy in range(2):
                for dx in range(2):
                    C[fy + dy][fx + dx] = '█'

            # Top highlight: if pixel above is empty, add ▀ above front
            is_top_edge = (py == 0 or not grid[py - 1][px])
            is_left_edge = (px == 0 or not grid[py][px - 1])

            if is_top_edge:
                for dx in range(2):
                    cx = fx + dx
                    if fy > 0 and C[fy - 1][cx] == ' ':
                        C[fy - 1][cx] = '▀'

            # Left highlight
            if is_left_edge:
                for dy in range(2):
                    if fx > 0 and C[fy + dy][fx - 1] == ' ':
                        C[fy + dy][fx - 1] = '▌'

            # Bottom shadow
            is_bottom_edge = (py == H - 1 or not grid[py + 1][px])
            if is_bottom_edge:
                for dx in range(2):
                    cx = fx + dx
                    cy = fy + 2
                    if cy < out_H and C[cy][cx] == ' ':
                        C[cy][cx] = '░'

            # Right shadow
            is_right_edge = (px == W - 1 or not grid[py][px + 1])
            if is_right_edge:
                for dy in range(2):
                    cx = fx + 2
                    if cx < out_W and C[fy + dy][cx] == ' ':
                        C[fy + dy][cx] = '░'

            # Corner highlights/ shadows
            if is_top_edge and is_left_edge and fy > 0 and fx > 0 and C[fy - 1][fx - 1] == ' ':
                C[fy - 1][fx - 1] = '▘'
            if is_top_edge and is_right_edge and fy > 0 and C[fy - 1][fx + 2] == ' ':
                C[fy - 1][fx + 2] = '▝'
            if is_bottom_edge and is_left_edge and fx > 0 and fy + 2 < out_H and C[fy + 2][fx - 1] == ' ':
                C[fy + 2][fx - 1] = '▖'
            if is_bottom_edge and is_right_edge and fy + 2 < out_H and fx + 2 < out_W and C[fy + 2][fx + 2] == ' ':
                C[fy + 2][fx + 2] = '░'

    # Trim
    while C and all(c == ' ' for c in C[0]):
        C.pop(0)
    while C and all(c == ' ' for c in C[-1]):
        C.pop()
    if not C:
        return ['']
    l = 0
    while all(r[l] == ' ' for r in C):
        l += 1
    r = len(C[0]) - 1
    while all(row[r] == ' ' for row in C):
        r -= 1
    return [''.join(row[l:r + 1]) for row in C]


def render_text(text, style='shadow'):
    text = text.upper()
    renderers = {
        'shadow':  lambda g: render_shadow(g, 2),
        'extrude': render_extrude,
        'solid':   render_solid,
        'outline': lambda g: render_outline(g, 2),
        'bevel':   render_bevel,
    }
    renderer = renderers[style]
    letters = []

    for ch in text:
        if ch == ' ':
            letters.append(['      '])
            continue
        g = FONT.get(ch)
        if not g:
            print(f"(unknown '{ch}')", file=sys.stderr)
            continue
        letters.append(renderer(g))

    if not letters:
        return ''
    max_h = max(len(l) for l in letters)
    # Pad heights
    for l in letters:
        w = max(len(r) for r in l) if l else 6
        while len(l) < max_h:
            l.append(' ' * w)

    result = []
    for row_idx in range(max_h):
        parts = []
        for i, l in enumerate(letters):
            if i > 0:
                parts.append('  ')
            parts.append(l[row_idx])
        result.append(''.join(parts))
    return '\n'.join(result)


def show_all():
    for ch in sorted(FONT):
        print(f"\n── {ch} ──")
        print(render_text(ch))
        print()


if __name__ == "__main__":
    args = sys.argv[1:]
    style = 'shadow'
    text = 'DL'

    for a in args:
        if a == '--all':
            show_all()
            sys.exit(0)
        elif a in ('--shadow', '--extrude', '--solid'):
            style = a.lstrip('-')
        elif not a.startswith('--'):
            text = a

    result = render_text(text, style)
    print()
    for line in result.split('\n'):
        print(f"  {line}")
    print()
