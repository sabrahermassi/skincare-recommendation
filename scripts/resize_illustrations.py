"""
One-off asset prep: shrink an illustration to a target long-edge size,
in place, preserving the alpha channel.

The bottle illustrations (`assets/illustrations/bottle-*.png`) ship at 800px
on the long side, but the largest render anywhere in the app is the result
hero at 111px (@3x = 333px) — see issue #239 for the render-size table this
was derived from. 340px covers every use with headroom, so the 800px
originals are unused weight in the bundle.

Run:
    python scripts/resize_illustrations.py assets/illustrations/bottle-*.png
    python scripts/resize_illustrations.py --max-size 340 <files...>
"""

import sys
from glob import glob
from pathlib import Path

from PIL import Image

DEFAULT_MAX_SIZE = 340


def resize_in_place(path: Path, max_size: int) -> None:
    im = Image.open(path)
    long_edge = max(im.size)
    if long_edge <= max_size:
        print(f"{path}: already {im.size}, <= {max_size}px — skipped")
        return

    scale = max_size / long_edge
    new_size = (round(im.width * scale), round(im.height * scale))
    resized = im.convert("RGBA").resize(new_size, Image.LANCZOS)
    resized.save(path, optimize=True, compress_level=9)
    print(f"{path}: {im.size} -> {new_size}")


if __name__ == "__main__":
    args = sys.argv[1:]
    max_size = DEFAULT_MAX_SIZE
    if args and args[0] == "--max-size":
        max_size = int(args[1])
        args = args[2:]

    # Expand globs ourselves: Windows shells don't do it for us the way a
    # POSIX shell would, so `bottle-*.png` would otherwise arrive as one
    # literal, unmatched argument.
    paths = [Path(p) for pattern in args for p in (glob(pattern) or [pattern])]
    if not paths:
        print("usage: resize_illustrations.py [--max-size N] <files or globs...>")
        sys.exit(1)

    for path in paths:
        resize_in_place(path, max_size)
