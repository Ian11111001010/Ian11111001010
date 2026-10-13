#!/usr/bin/env python3
"""Обработка исходников gk-remeslo.ru под нужды лендинга ГК «Ремесло».
Стилистика «Инженерный премиум»: десатурация + холодный сдвиг + виньетка."""
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

SRC = "/workspace/assets/img"
OUT = "/workspace/assets/img"


def load(n):
    return Image.open(f"{SRC}/src_{n}.jpg").convert("RGB")


def grade(img, sat=0.55, contrast=1.06, bright=0.94, cool=8):
    img = ImageEnhance.Color(img).enhance(sat)
    img = ImageEnhance.Contrast(img).enhance(contrast)
    img = ImageEnhance.Brightness(img).enhance(bright)
    r, g, b = img.split()
    b = b.point(lambda p: min(255, p + cool))
    r = r.point(lambda p: max(0, p - int(cool / 2)))
    return Image.merge("RGB", (r, g, b))


def vignette(img, strength=70):
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((-w * 0.25, -h * 0.25, w * 1.25, h * 1.25), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(min(w, h) // 6))
    dark = Image.new("RGB", (w, h), (5, 9, 18))
    inv = ImageOps.invert(mask).point(lambda p: int(p * strength / 100))
    return Image.composite(dark, img, inv)


def crop_resize(img, ratio, width):
    w, h = img.size
    if w / h > ratio:
        nw = int(h * ratio)
        x = (w - nw) // 2
        img = img.crop((x, 0, x + nw, h))
    else:
        nh = int(w / ratio)
        y = (h - nh) // 2
        img = img.crop((0, y, w, y + nh))
    return img.resize((width, int(width / ratio)), Image.LANCZOS)


def save(img, name, q=82):
    img.save(f"{OUT}/{name}", "JPEG", quality=q, optimize=True, progressive=True)
    print("saved", name, img.size)


jobs = [
    dict(src=12, out="hero-facade.jpg", ratio=16/9, w=1920, kw=dict(sat=.5, bright=.8, cool=10)),
    dict(src=12, out="before.jpg", ratio=4/3, w=1400, kw=dict(sat=.25, bright=.62, contrast=1.1, cool=14)),
    dict(src=12, out="after.jpg", ratio=4/3, w=1400, kw=dict(sat=.62, bright=.95, contrast=1.08, cool=4)),
    dict(src=13, out="docs.jpg", ratio=4/3, w=1000, kw=dict(sat=.45, bright=1.0, cool=4)),
    dict(src=1, out="render.jpg", ratio=4/3, w=1200, kw=dict(sat=.7, bright=1.0, cool=0)),
    dict(src=14, out="detail.jpg", ratio=4/3, w=1200, kw=dict(sat=.55, bright=.9, cool=6)),
    dict(src=2, out="prod1.jpg", ratio=3/2, w=900, kw=dict()),
    dict(src=3, out="prod2.jpg", ratio=3/2, w=900, kw=dict()),
    dict(src=4, out="prod3.jpg", ratio=3/2, w=900, kw=dict()),
    dict(src=5, out="mat-metal.jpg", ratio=3/4, w=750, kw=dict()),
    dict(src=6, out="mat-ceramic.jpg", ratio=3/4, w=750, kw=dict()),
    dict(src=7, out="mat-alucobond.jpg", ratio=3/4, w=750, kw=dict()),
    dict(src=8, out="mat-spk.jpg", ratio=3/4, w=750, kw=dict()),
    dict(src=9, out="case1.jpg", ratio=16/10, w=1200, kw=dict()),
    dict(src=10, out="case2.jpg", ratio=16/10, w=1200, kw=dict()),
    dict(src=11, out="case3.jpg", ratio=16/10, w=1200, kw=dict()),
    dict(src=15, out="case4.jpg", ratio=16/10, w=1200, kw=dict()),
    dict(src=13, out="team1.jpg", ratio=4/5, w=640, kw=dict(sat=0.0, bright=.92, contrast=1.12)),
    dict(src=12, out="team2.jpg", ratio=4/5, w=640, kw=dict(sat=0.0, bright=.9, contrast=1.12)),
    dict(src=14, out="team3.jpg", ratio=4/5, w=640, kw=dict(sat=0.0, bright=.95, contrast=1.12)),
]

for j in jobs:
    img = load(j["src"])
    img = crop_resize(img, j["ratio"], j["w"])
    kw = {**dict(sat=.55, contrast=1.05, bright=.95, cool=6), **j.get("kw", {})}
    img = grade(img, **kw)
    img = vignette(img, 60)
    save(img, j["out"])
print("DONE")
