"""
One-off asset prep: split a grid-sheet illustration (already RGBA, background
made transparent by strip_background.py) into individual illustration PNGs.

Detects separate illustrations as connected components of non-transparent
pixels, crops each with a margin, and writes them out sequentially.

Run:
    python scripts/split_illustration_sheet.py <sheet.png> assets/illustrations --prefix sheet1 --start 1
"""

import argparse
import os
from PIL import Image
import numpy as np
from scipy import ndimage

ALPHA_CUTOFF = 10   # pixels with alpha <= this are background, not part of a shape
MARGIN = 12          # px of transparent padding kept around each crop
MIN_AREA = 200        # discard specks (stray anti-aliasing flecks, dust) below this many pixels

# A barcode's bars, a QR code's modules, and a stray flyaway hair strand are
# all drawn as pixel regions that don't actually touch each other, so a plain
# connected-components pass over-splits a single illustration into dozens of
# pieces (measured: 64 "illustrations" out of a sheet with ~20 real ones).
# Grouping is decided on a dilated copy of the mask (bridges gaps up to ~2x
# this many px); DILATE_ITERS=10 was chosen by sweeping radii and checking the
# result against the actual artwork — it merges barcode bars, QR modules and
# broken hairlines into their parent illustration without merging distinct
# grid cells into each other. The crop itself still uses the ORIGINAL,
# undilated pixels, so dilation only affects grouping, never the output image.
DILATE_ITERS = 10


def split_sheet(path: str, out_dir: str, prefix: str, start: int, dilate_iters: int = DILATE_ITERS) -> list[str]:
    im = Image.open(path).convert("RGBA")
    arr = np.asarray(im)
    alpha = arr[:, :, 3]
    mask = alpha > ALPHA_CUTOFF

    # 8-connectivity: diagonal touches (e.g. a sparkle's points) still count
    # as one shape rather than splitting into fragments.
    structure = np.ones((3, 3), dtype=int)
    dilated = ndimage.binary_dilation(mask, structure=structure, iterations=dilate_iters)
    dilated_labels, _ = ndimage.label(dilated, structure=structure)
    # Zero out anything that isn't real artwork, so bounding boxes are drawn
    # from the actual illustration rather than the dilation halo around it.
    labels = np.where(mask, dilated_labels, 0)

    written = []
    n = start
    # order top-to-bottom, left-to-right by each component's bounding-box origin
    slices = ndimage.find_objects(labels)
    components = []
    for label_id, sl in enumerate(slices, start=1):
        if sl is None:
            continue
        area = int((labels[sl] == label_id).sum())
        if area < MIN_AREA:
            continue
        y0, y1 = sl[0].start, sl[0].stop
        x0, x1 = sl[1].start, sl[1].stop
        components.append((y0, x0, y1, x1))

    components.sort(key=lambda b: (b[0] // 40, b[1]))  # row-bucketed, then left-to-right

    h, w = mask.shape
    for (y0, x0, y1, x1) in components:
        cy0 = max(0, y0 - MARGIN)
        cx0 = max(0, x0 - MARGIN)
        cy1 = min(h, y1 + MARGIN)
        cx1 = min(w, x1 + MARGIN)
        crop = im.crop((cx0, cy0, cx1, cy1))
        out_path = os.path.join(out_dir, f"{prefix}-{n:02d}.png")
        crop.save(out_path)
        written.append(out_path)
        n += 1

    return written


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("sheet")
    parser.add_argument("out_dir")
    parser.add_argument("--prefix", default="illustration")
    parser.add_argument("--start", type=int, default=1)
    parser.add_argument(
        "--dilate", type=int, default=DILATE_ITERS,
        help="Grouping-dilation radius in px. Sheets differ in how tightly their "
             "grid cells are spaced, so this may need tuning per sheet: too low "
             "leaves barcodes/hairlines fragmented, too high fuses adjacent cells."
    )
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    written = split_sheet(args.sheet, args.out_dir, args.prefix, args.start, args.dilate)
    print(f"{args.sheet}: wrote {len(written)} illustrations")
    for p in written:
        print(" ", p)
