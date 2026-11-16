"""Создаёт WebP рядом с используемыми PNG, сохраняя исходники художницы."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "public" / "assets"
UNUSED = {
    "backgrounds/home_sketch_3.png",
    "ui/home_window_mask.png",
    "ui/menu/logo.png",
    "ui/menu/seal_shards.png",
}

before = after = 0
for src in ROOT.rglob("*.png"):
    rel = src.relative_to(ROOT).as_posix()
    if rel in UNUSED:
        continue
    dst = src.with_suffix(".webp")
    with Image.open(src) as im:
        if rel == "icons/stats/escape.png":
            im = im.resize((256, 256), Image.Resampling.LANCZOS)
        quality = 88 if rel.startswith("ui/") or rel.startswith("icons/") else 84
        im.save(dst, "WEBP", quality=quality, method=6, exact=True)
    before += src.stat().st_size
    after += dst.stat().st_size

print(f"PNG: {before / 1048576:.2f} MiB")
print(f"WebP: {after / 1048576:.2f} MiB")
print(f"Saved: {(before - after) / 1048576:.2f} MiB")
