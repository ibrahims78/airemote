"""frame_stats.py — يقيس سطوع إطارات JPEG فعلياً (Pillow)، لا حجمها.

الاستخدام:  python frame_stats.py <dir>
يطبع JSON: لكل إطار mean R/G/B وblack% (بكسل mean<10) وcolorfulness تقريبي، ثم ملخص.
هذا هو القياس الحاكم لمسألة الشاشة السوداء (D22: لا PASS بلا قياس على الطبقة الصحيحة).
"""
import json
import os
import sys

from PIL import Image

BLACK_THRESHOLD = 10


def stats(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    small = im.resize((min(w, 320), min(h, 320)))
    px = list(small.getdata())
    n = len(px)
    rs = sum(p[0] for p in px) / n
    gs = sum(p[1] for p in px) / n
    bs = sum(p[2] for p in px) / n
    black = sum(1 for p in px if (p[0] + p[1] + p[2]) / 3 < BLACK_THRESHOLD) / n * 100.0
    return {
        "w": w, "h": h,
        "mean": [round(rs, 1), round(gs, 1), round(bs, 1)],
        "blackPct": round(black, 1),
        "bytes": os.path.getsize(path),
    }


def main():
    d = sys.argv[1]
    files = sorted(f for f in os.listdir(d) if f.lower().endswith(".jpg"))
    rows = []
    for f in files:
        try:
            s = stats(os.path.join(d, f))
            s["file"] = f
            rows.append(s)
        except Exception as e:  # noqa: BLE001
            rows.append({"file": f, "error": str(e)})
    ok = [r for r in rows if "mean" in r]
    summary = {
        "dir": d,
        "frames": len(rows),
        "decoded": len(ok),
        "meanOfMeans": [round(sum(r["mean"][i] for r in ok) / len(ok), 1) for i in range(3)] if ok else None,
        "avgBlackPct": round(sum(r["blackPct"] for r in ok) / len(ok), 1) if ok else None,
        "blackFrames": sum(1 for r in ok if r["blackPct"] > 99.0),
        "realFrames": sum(1 for r in ok if r["blackPct"] < 50.0),
    }
    print(json.dumps({"summary": summary, "frames": rows}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
