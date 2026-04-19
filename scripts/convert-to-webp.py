#!/usr/bin/env python3
"""
Konvertuje všechny JPG/JPEG/PNG v uploads/ na WebP.
Originály smaže po úspěšné konverzi.

Usage: python3 scripts/convert-to-webp.py
"""

import os
import sys
from pathlib import Path
from PIL import Image
from concurrent.futures import ThreadPoolExecutor, as_completed

UPLOADS_DIR = Path(__file__).parent.parent / "public" / "wp-content" / "uploads"
QUALITY = 80
MAX_WORKERS = 8

def convert_file(src: Path) -> tuple:
    dst = src.with_suffix(".webp")
    if dst.exists():
        src.unlink()
        return ("skip", src, 0, 0)
    try:
        before = src.stat().st_size
        img = Image.open(src)
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        img.save(dst, "WEBP", quality=QUALITY, method=4)
        after = dst.stat().st_size
        src.unlink()
        return ("ok", src, before, after)
    except Exception as e:
        return ("err", src, 0, str(e))

def main():
    files = [
        p for p in UPLOADS_DIR.rglob("*")
        if p.suffix.lower() in (".jpg", ".jpeg", ".png") and p.is_file()
    ]
    print(f"Souborů k převodu: {len(files)}")
    if not files:
        print("Nic k převodu.")
        return

    ok = err = skip = 0
    saved_bytes = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(convert_file, f): f for f in files}
        done = 0
        for future in as_completed(futures):
            result = future.result()
            done += 1
            if result[0] == "ok":
                ok += 1
                saved_bytes += result[2] - result[3]
            elif result[0] == "err":
                err += 1
                print(f"  ERR: {result[1].name}: {result[3]}")
            else:
                skip += 1
            if done % 200 == 0 or done == len(files):
                print(f"  {done}/{len(files)} ... uloženo {saved_bytes // (1024*1024)} MB")

    print(f"\nHotovo: {ok} OK, {skip} přeskočeno, {err} chyb")
    print(f"Ušetřeno: {saved_bytes // (1024*1024)} MB")

if __name__ == "__main__":
    main()
