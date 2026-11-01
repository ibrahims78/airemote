import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB")
w, h = im.size
px = im.load()
def dark(p): return p[0] < 14 and p[1] < 14 and p[2] < 14
rows = [y for y in range(h) if sum(1 for x in range(0, w, 7) if not dark(px[x, y])) > 3]
cols = [x for x in range(w) if sum(1 for y in range(0, h, 7) if not dark(px[x, y])) > 3]
if not rows or not cols:
    print("0 0 0 0")
else:
    print(min(cols), min(rows), max(cols), max(rows))