#!/usr/bin/env python
"""diff-surface.py — the Phase 3 gate: pixel difference between a screenshot
and the owner's approved reference, at identical size.

Usage:
  python scripts/diff-surface.py shot.png design/server-light.png --out diff.png [--threshold 16]

Exit code 0 when diff <= --max (default 2.0), 1 otherwise.
Prints one JSON line with the numbers.
"""
import argparse
import json
import sys

from PIL import Image, ImageChops


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('shot')
    ap.add_argument('ref')
    ap.add_argument('--out', default='')
    ap.add_argument('--threshold', type=int, default=16, help='per-pixel max channel delta that counts as different')
    ap.add_argument('--max', type=float, default=2.0, help='allowed percent of differing pixels')
    ap.add_argument('--grid', type=int, default=6, help='rows/cols used to report the worst regions')
    a = ap.parse_args()

    shot = Image.open(a.shot).convert('RGB')
    ref = Image.open(a.ref).convert('RGB')

    resized = False
    if shot.size != ref.size:
        resized = True
        shot = shot.resize(ref.size, Image.LANCZOS)

    diff = ImageChops.difference(shot, ref)
    # max channel delta per pixel
    r, g, b = diff.split()
    px = list(diff.getdata())
    total = len(px)
    bad = sum(1 for p in px if max(p) > a.threshold)
    pct = round(bad * 100.0 / total, 2)

    # mean absolute error
    mae = round(sum(sum(p) for p in px) / (total * 3), 2)

    # worst regions, so the report says where the gap is
    w, h = ref.size
    grid = max(1, a.grid)
    worst = []
    for gy in range(grid):
        for gx in range(grid):
            box = (gx * w // grid, gy * h // grid, (gx + 1) * w // grid, (gy + 1) * h // grid)
            part = diff.crop(box)
            data = list(part.getdata())
            if not data:
                continue
            rate = sum(1 for p in data if max(p) > a.threshold) / len(data)
            worst.append({'box': box, 'pct': round(rate * 100, 1)})
    worst.sort(key=lambda d: -d['pct'])

    if a.out:
        # red overlay of differing pixels over a faded reference
        base = ref.convert('RGB').point(lambda v: int(v * 0.35 + 140))
        mask = diff.convert('L').point(lambda v: 255 if v > a.threshold else 0)
        red = Image.new('RGB', ref.size, (220, 38, 38))
        base.paste(red, (0, 0), mask)
        base.save(a.out)

    result = {
        'shot': a.shot,
        'ref': a.ref,
        'size': list(ref.size),
        'resized': resized,
        'threshold': a.threshold,
        'diffPct': pct,
        'mae': mae,
        'allowed': a.max,
        'pass': pct <= a.max,
        'worst': worst[:4]
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result['pass'] else 1


if __name__ == '__main__':
    sys.exit(main())
