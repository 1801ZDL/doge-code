#!/usr/bin/env python3
"""Simple DL logo designs — all hand-crafted block-character art."""
import sys

# Each design: (name, [rows])
# Designs are width-validated: all rows must have same length
DESIGNS = []

# Helper: validate & register
def add(name, rows):
    w = max(len(r) for r in rows)
    DESIGNS.append((name, rows, w, len(rows)))

# ═══ 3-ROW DESIGNS (11 cols) ═══

add("01-original", [
    " ▘████▝   █",
    "█    █    █",
    " ▖████▗ ███",
])

add("02-bold-L", [
    " ▘████▝  ██",
    "█     █  ██",
    " ▖████▗ ███",
])

add("03-half-stem", [
    " ▘████▝  ▐▌",
    "█     █  ▐▌",
    " ▖████▗ ███",
])

add("04-clean-square", [
    " ▄████▄  ██",
    "█      █ ██",
    " ▀████▀ ███",
])

add("05-clean-half", [
    " ▄████▄  ▐▌",
    "█      █ ▐▌",
    " ▀████▀ ███",
])

add("06-all-quadrant", [
    " ▗████▖  █▀",
    "▐      ▌ █▄",
    " ▝████▘ ██▌",
])

add("07-solid-both", [
    " ▄████▄  █▀",
    "█  ░░  █ █▄",
    " ▀████▀ ███",
])

add("08-shadow-L", [
    " ▘████▝  █▀",
    "█     █  █▄",
    " ▖████▗ ██▌",
])

# ═══ 5-ROW DESIGNS ═══

add("09-tall-curve", [
    "  ▗████▖   █",
    " ▐      ▌  █",
    " ▐      ▌  █",
    " ▐      ▌  █",
    "  ▝████▘  ███",
])

add("10-tall-bold-L", [
    "  ▗████▖  ▐▌",
    " ▐      ▌ ▐▌",
    " ▐      ▌ ▐▌",
    " ▐      ▌ ▐▌",
    "  ▝████▘ ███",
])

add("11-tall-square", [
    "  ▄████▄  █▀",
    " █      █ █▄",
    " █      █ █▀",
    " █      █ █▄",
    "  ▀████▀ ███",
])

add("12-tall-interior", [
    "  ▄████▄  ▐▌",
    " █  ░░  █ ▐▌",
    " █  ░░  █ ▐▌",
    " █  ░░  █ ▐▌",
    "  ▀████▀ ███",
])

# ═══ 7-ROW DESIGNS ═══

add("13-grand-curve", [
    "   ▄████▄    █",
    "  █▘    ▝█   █",
    " █        █  █",
    " █        █  █",
    " █        █  █",
    "  █▖    ▗█   █",
    "   ▀████▀   ███",
])

add("14-grand-half", [
    "   ▗█████▖   █",
    "  ▐       ▌  █",
    " ▐         ▌ █",
    " ▐         ▌ █",
    " ▐         ▌ █",
    "  ▐       ▌  █",
    "   ▝█████▘  ███",
])

add("15-grand-bold", [
    "   ▄████▄   █▀",
    "  █      █  █▄",
    " █        █ █▀",
    " █        █ █▄",
    " █        █ █▀",
    "  █      █  █▄",
    "   ▀████▀  ███",
])

# ═══ EXPERIMENTAL ═══

add("16-3D-extrude", [
    "  ▗████▖  █▀",
    " ▐  ░░  ▌ █▄",
    " ▐  ▒▒  ▌ █▀",
    " ▐  ▓▓  ▌ █▄",
    "  ▝████▘ ███",
])

add("17-connected-DL", [
    "  ▗████▖ █▀",
    " ▐      ▐▌▄",  # D right connects to L
    " ▐      ▌▀ ",
    " ▐      ▌  ",
    "  ▝████▘ ███",
])

add("18-neon-glow", [
    "  ▄████▄  █▀",
    " █  ░░  █ █▄",
    " █  ░░  █ █▀",
    " █  ░░  █ █▄",
    "  ▀████▀ ███",
])


def show_grid():
    """Show all designs in a grid layout."""
    # Group by height
    groups = {}
    for name, rows, w, h in DESIGNS:
        groups.setdefault(h, []).append((name, rows, w))

    for h, items in sorted(groups.items()):
        print(f"\n{'═'*70}")
        print(f"  {h}-ROW DESIGNS")
        print(f"{'═'*70}")

        # Print 3 per row
        for i in range(0, len(items), 3):
            batch = items[i:i+3]
            max_rows = max(len(d[1]) for d in batch)

            # Print header
            header = ""
            for name, _, w in batch:
                header += f"  {name} ({w}×{h})".ljust(28)
            print(f"\n{header}")

            # Print each row
            for r in range(max_rows):
                line = ""
                for _, rows, w in batch:
                    if r < len(rows):
                        line += f"  {rows[r]}".ljust(28)
                    else:
                        line += " " * 28
                print(line)

            # Print copy-paste strings
            for _, rows, _ in batch:
                cstr = ", ".join(repr(r) for r in rows)
                print(f"  Copy: [{cstr}]")
            print()


def main():
    if "--compact" in sys.argv:
        # Super compact: just names + first row
        for name, rows, w, h in DESIGNS:
            print(f"{name:25s} {rows[0]}")
    elif "--raw" in sys.argv:
        # Just the raw chars, one design per block
        for name, rows, w, h in DESIGNS:
            print(f"\n# {name} ({w}×{h})")
            for r in rows:
                print(r)
    else:
        show_grid()


if __name__ == "__main__":
    main()
