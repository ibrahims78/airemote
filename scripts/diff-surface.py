#!/usr/bin/env python
"""diff-surface.py — Phase 3 gate, hardened against the empty-space blind spot.

Three independent measurements, all must pass:
  diffPct       raw percentage of pixels whose max channel delta > threshold
  blockDiffPct  percentage of 64x64 blocks whose MEAN colour differs > block-thr
                (an empty area can no longer "match" a missing card)
  edgeMissPct   percentage of the reference's edge pixels with no edge nearby in
                the shot (structure: cards, borders, toolbars must exist)

Usage:
  python scripts/diff-surface.py shot.png design/server-light.png --out diff.png
Exit 0 only when all three are within limits.
"""
import argparse
import json
import sys

from PIL import Image, ImageChops, ImageFilter


def edges(img, thr=28):
    g = img.convert('L').filter(ImageFilter.FIND_EDGES)
    return g.point(lambda v: 255 if v > thr else 0)


def dilate(mask, px=2):
    return mask.filter(ImageFilter.MaxFilter(px * 2 + 1))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('shot')
    ap.add_argument('ref')
    ap.add_argument('--out', default='')
    ap.add_argument('--threshold', type=int, default=16)
    ap.add_argument('--block', type=int, default=64)
    ap.add_argument('--block-thr', type=float, default=10.0)
    ap.add_argument('--max', type=float, default=2.0)
    ap.add_argument('--max-block', type=float, default=2.0)
    ap.add_argument('--max-edge-miss', type=float, default=15.0)
    a = ap.parse_args()

    shot = Image.open(a.shot).convert('RGB')
    ref = Image.open(a.ref).convert('RGB')
    resized = False
    if shot.size != ref.size:
        resized = True
        shot = shot.resize(ref.size, Image.LANCZOS)

    diff = ImageChops.difference(shot, ref)
    px = list(diff.getdata())
    total = len(px)
    bad = sum(1 for p in px if max(p) > a.threshold)
    pct = round(bad * 100.0 / total, 2)
    mae = round(sum(sum(p) for p in px) / (total * 3), 2)

    # block means
    w, h = ref.size
    b = a.block
    blocks_total = 0
    blocks_bad = 0
    worst = []
    for y in range(0, h, b):
        for x in range(0, w, b):
            box = (x, y, min(x + b, w), min(y + b, h))
            rs = shot.crop(box).resize((1, 1), Image.BOX).getpixel((0, 0))
            rr = ref.crop(box).resize((1, 1), Image.BOX).getpixel((0, 0))
            d = max(abs(rs[i] - rr[i]) for i in range(3))
            blocks_total += 1
            if d > a.block_thr:
                blocks_bad += 1
                worst.append({'box': box, 'delta': d})
    block_pct = round(blocks_bad * 100.0 / max(blocks_total, 1), 2)
    worst.sort(key=lambda d: -d['delta'])

    # edge structure
    e_ref = edges(ref)
    e_shot = dilate(edges(shot), 2)
    ref_edges = e_ref.histogram()[255]
    missing = ImageChops.subtract(e_ref, e_shot).histogram()[255]
    edge_miss = round(missing * 100.0 / max(ref_edges, 1), 2)

    if a.out:
        base = ref.point(lambda v: int(v * 0.35 + 140))
        mask = diff.convert('L').point(lambda v: 255 if v > a.threshold else 0)
        red = Image.new('RGB', ref.size, (220, 38, 38))
        base.paste(red, (0, 0), mask)
        base.save(a.out)

    result = {
        'shot': a.shot, 'ref': a.ref, 'size': list(ref.size), 'resized': resized,
        'diffPct': pct, 'blockDiffPct': block_pct, 'edgeMissPct': edge_miss, 'mae': mae,
        'limits': {'diffPct': a.max, 'blockDiffPct': a.max_block, 'edgeMissPct': a.max_edge_miss},
        'pass': pct <= a.max and block_pct <= a.max_block and edge_miss <= a.max_edge_miss,
        'worstBlocks': worst[:4]
    }
    print(json.dumps(result, ensure_ascii=False))
    return 0 if result['pass'] else 1


if __name__ == '__main__':
    sys.exit(main())
