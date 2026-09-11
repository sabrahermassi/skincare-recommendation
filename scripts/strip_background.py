"""
One-off asset prep: convert an illustration sheet with a baked-in near-white
background to real RGBA transparency.

Both source sheets (assets/images/1.png, 2.jpeg) turned out to have NO real
alpha channel despite looking transparent in a viewer — what looks like a
transparency checkerboard is actually a faint two-tone pattern baked into the
pixels themselves (alternating ~254/~248 and ~255/~246 in samples). So both
need this treatment, not just the JPEG.

Threshold choice: the three pastel fills used across the sheets sample to
peach #FCD6C6 (min channel 198), blush #FCE1DB (min channel 219), and sage
#CDD8BE (min channel 190). The background's min channel measures ~245-255.
That's a ~30-55 point gap, so a min(R,G,B) >= 235 cutoff (feathered over the
last 8 levels for anti-aliased edges) clears the background without touching
any pastel fill or the line art.

Run:
    python scripts/strip_background.py assets/images/1.png /path/to/preview.png
"""

import sys
from PIL import Image
import numpy as np

THRESHOLD = 235
FEATHER = 8  # ramp width below THRESHOLD over which alpha fades in


def strip_near_white(im: Image.Image, threshold: int = THRESHOLD, feather: int = FEATHER) -> Image.Image:
    rgba = im.convert("RGBA")
    arr = np.asarray(rgba).astype(np.int16)
    rgb = arr[:, :, :3]
    min_channel = rgb.min(axis=2)

    # alpha = 255 where min_channel <= threshold-feather (kept fully opaque)
    #       = 0   where min_channel >= threshold (fully transparent)
    #       linear ramp in between, to avoid a jagged binary edge
    lo = threshold - feather
    alpha = np.clip((threshold - min_channel) / feather, 0.0, 1.0) * 255
    alpha = alpha.astype(np.uint8)

    out = arr.copy()
    out[:, :, 3] = alpha
    return Image.fromarray(out.astype(np.uint8), mode="RGBA")


def already_transparent(im: Image.Image) -> bool:
    if im.mode not in ("RGBA", "LA") and "transparency" not in im.info:
        return False
    rgba = im.convert("RGBA")
    alpha = np.asarray(rgba)[:, :, 3]
    return bool((alpha < 250).any())


if __name__ == "__main__":
    src, dest = sys.argv[1], sys.argv[2]
    im = Image.open(src)
    if already_transparent(im):
        print(f"{src}: already has real transparency, copying through unchanged")
        im.convert("RGBA").save(dest)
    else:
        print(f"{src}: mode={im.mode}, no real alpha — stripping near-white background")
        strip_near_white(im).save(dest)
    print(f"wrote {dest}")
