#!/usr/bin/env python3
"""DL Logo design generator — prints all designs for comparison."""
import json

DESIGNS = {
    # ── 3-row designs ──
    "01-original": [
        " ▘████▝   █",
        "█    █    █",
        " ▖████▗ ███",
    ],
    "02-clean-curve": [
        " ▗████▖   █",
        "▐      ▌  █",
        " ▝████▘  ███",
    ],
    "03-half-flat": [
        " ▄████▄   █",
        "█      █  █",
        " ▀████▀  ███",
    ],
    "04-wider-L": [
        " ▘████▝  ▐▌",
        "█     █  ▐▌",
        " ▖████▗ ███",
    ],
    "05-3D-L": [
        " ▘████▝  █▀",
        "█     █  █▄",
        " ▖████▗ ██▌",
    ],
    "06-bold-L": [
        " ▘████▝  ██",
        "█     █  ██",
        " ▖████▗ ███",
    ],

    # ── 5-row designs ──
    "07-tall-curve": [
        "  ▗████▖   █",
        " ▐      ▌  █",
        " ▐      ▌  █",
        " ▐      ▌  █",
        "  ▝████▘  ███",
    ],
    "08-tall-half": [
        "  ▄████▄   █▀",
        " █      █  █ ",
        " █      █  █ ",
        " █      █  █▄",
        "  ▀████▀  ███",
    ],
    "09-tall-bold-L": [
        "  ▗████▖  ▐▌",
        " ▐      ▌ ▐▌",
        " ▐      ▌ ▐▌",
        " ▐      ▌ ▐▌",
        "  ▝████▘ ███",
    ],
    "10-tall-3D": [
        "  ▄████▄  █▀",
        " █      █ █▄",
        " █  ▄▄  █ █▀",
        " █  ▀▀  █ █▄",
        "  ▀████▀ ███",
    ],
    "11-tall-geo": [
        "  ▗████▖  █▀",
        " ▐      ▌ █▄",
        " ▐  ▗▖  ▌ █▀",
        " ▐  ▝▘  ▌ █▄",
        "  ▝████▘ ███",
    ],
    "12-tall-serif": [
        "  ▗████▖  ██",
        " ▐      ▌ ██",
        " ▐      ▌ ██",
        " ▐      ▌ ██",
        "  ▝████▘ ████",
    ],

    # ── 7-row designs ──
    "13-grand-curve": [
        "   ▄████▄    █",
        "  █▘    ▝█   █",
        " █        █  █",
        " █        █  █",
        " █        █  █",
        "  █▖    ▗█   █",
        "   ▀████▀   ███",
    ],
    "14-grand-half": [
        "   ▗█████▖   █",
        "  ▐       ▌  █",
        " ▐         ▌ █",
        " ▐         ▌ █",
        " ▐         ▌ █",
        "  ▐       ▌  █",
        "   ▝█████▘  ███",
    ],
    "15-mega-bold": [
        "   ▄█████▄   ██",
        "  █       █  ██",
        " █         █ ██",
        " █         █ ██",
        " █         █ ██",
        "  █       █  ██",
        "   ▀█████▀  ████",
    ],

    # ── Box-drawing & mixed ──
    "16-box-draw": [
        "  ╭────╮  ┃",
        "  │    │  ┃",
        "  │    │  ┃",
        "  │    │  ┃",
        "  ╰────╯ ┗━┛",
    ],
    "17-mixed": [
        "  ▗████▖  ╽",
        " ▐      ▌ ╽",
        " ▐      ▌ ╽",
        " ▐      ▌ ╽",
        "  ▝████▘ ╘═╛",
    ],
    "18-gradient": [
        "  ▓████▓  ▐▌",
        " █      █ ▐▌",
        " █ ▓▓▓▓ █ ▐▌",
        " █ ░░░░ █ ▐▌",
        "  ▒████▒ ███",
    ],
}

COLORS = [
    ("\033[38;5;208m", "\033[0m"),      # orange
    ("\033[38;5;45m", "\033[0m"),       # cyan
    ("\033[38;5;213m", "\033[0m"),      # pink
    ("\033[38;5;118m", "\033[0m"),      # green
    ("\033[38;5;226m", "\033[0m"),      # yellow
    ("\033[1;37m", "\033[0m"),          # bold white
]

def show_all():
    # Header
    W = 62
    print()
    print("╔" + "═" * W + "╗")
    print("║" + " DL Logo Design Gallery — 18 designs ".center(W) + "║")
    print("╚" + "═" * W + "╝")
    print()

    for i, (name, rows) in enumerate(DESIGNS.items()):
        w = max(len(r) for r in rows)
        h = len(rows)
        color, reset = COLORS[i % len(COLORS)]

        # Card header
        print(f" ┌─ {name} ({w}×{h}) ".ljust(W-2, "─") + "┐")

        # Card body
        print(" │")
        for row in rows:
            print(f" │  {color}{row}{reset}")
        print(" │")

        # Card footer
        print(" └" + "─" * (W-2) + "┘")
        print()

        # Prompt after every 6
        if (i + 1) % 6 == 0 and i < len(DESIGNS) - 1:
            try:
                input(f"  ... showing {i+1}/{len(DESIGNS)} — press Enter for more ...")
            except EOFError:
                break

def show_one(name):
    """Print a single design enlarged."""
    rows = DESIGNS.get(name)
    if not rows:
        print(f"Unknown: {name}")
        print("Available:", ", ".join(DESIGNS.keys()))
        return

    print()
    print(f"  {name}")
    print(f"  {'─' * len(name)}")
    print()
    # Repeat each row to make it taller for easier viewing
    for row in rows:
        for _ in range(3):
            print(f"    \033[38;5;208m{row}\033[0m")
    print()
    w = max(len(r) for r in rows)
    print(f"  Width: {w} cols, Height: {len(rows)} rows")
    print(f"  C-string form:")
    for row in rows:
        print(f"    {json.dumps(row)}")
    print()

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        show_one(sys.argv[1])
    else:
        show_all()
