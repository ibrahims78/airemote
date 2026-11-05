#!/usr/bin/env python
"""edge-bands.py — where exactly is the structural gap? Edge-miss per 80px band."""
import sys
import json
from PIL import Image, ImageChops, ImageFilter


def edges(img, thr=28):
    return img.convert('L').filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > thr else 0)


def main():
    shot = Image.open(sys.argv[1]).convert('RGB')
    ref = Image.open(sys.argv[2]).convert('RGB')
    if shot.size != ref.size:
        shot = shot.resize(ref.size, Image.LANCZOS)
    w, h = ref.size
    band = 80
    er = edges(ref)
    es = edges(shot).filter(ImageFilter.MaxFilter(5))
    rows = []
    for y in range(0, h, band):
        box = (0, y, w, min(y + band, h))
        r = er.crop(box)
        s = es.crop(box)
        total = r.histogram()[255]
        if total < 50:
            continue
        miss = ImageChops.subtract(r, s).histogram()[255]
        rows.append((round(miss * 100.0 / total, 1), y, total))
    rows.sort(reverse=True)
    print(json.dumps({
        'worstBands': [{'y': y, 'edgeMissPct': p, 'refEdges': t} for p, y, t in rows[:8]],
        'note': 'y in pixels of the 3400x1960 reference'
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
