#!/usr/bin/env python3
"""Imagens do instalador do Bifrost (NSIS e WiX), geradas em código: céu noturno,
estrelas e o arco-íris da ponte. Rode: python3 scripts/gen-installer-art.py"""
import os, random
from PIL import Image, ImageDraw, ImageFilter
OUT = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "installer")
PRISM = [(79, 227, 193), (90, 169, 255), (157, 123, 255), (255, 111, 174), (255, 198, 92)]

def sky(w, h, seed=7):
    im = Image.new("RGB", (w, h))
    px = im.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(int(a + (b - a) * t) for a, b in zip((24, 33, 70), (6, 8, 18)))
        for x in range(w):
            px[x, y] = c
    d = ImageDraw.Draw(im)
    r = random.Random(seed)
    for _ in range(int(w * h / 900)):
        x, y = r.randrange(w), r.randrange(h)
        b = r.randrange(120, 255)
        d.point((x, y), fill=(b, b, min(255, b + 20)))
    return im

def arc(im, cx, cy, r0, width):
    glow = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    for i, c in enumerate(PRISM):
        r = r0 - i * width
        d.arc([cx - r, cy - r, cx + r, cy + r], 180, 360, fill=c + (255,), width=max(1, width - 1))
    blur = glow.filter(ImageFilter.GaussianBlur(width * 1.2))
    im.paste(blur, (0, 0), blur)
    im.paste(glow, (0, 0), glow)
    return im

def save(name, im):
    im.convert("RGB").save(os.path.join(OUT, name), "BMP")

os.makedirs(OUT, exist_ok=True)
save("nsis-header.bmp", arc(sky(150, 57), 118, 64, 30, 5))
save("nsis-sidebar.bmp", arc(sky(164, 314), 82, 250, 66, 9))
save("wix-banner.bmp", arc(sky(493, 58), 450, 66, 32, 5))
save("wix-dialog.bmp", arc(sky(493, 312), 82, 240, 66, 9))
print("ok")
