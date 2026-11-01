"""Draws the Deck Ops icon set: a phosphor '>_' prompt on CRT glass. Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw, ImageFilter
import pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
GLASS = (3, 20, 12, 255); PH = (139, 245, 165, 255); HI = (216, 255, 227, 255); GRID = (121, 210, 224, 9)

def glyph(size, scale=1.0, alpha_bg=False):
    """'>_' prompt centred, drawn at `scale` of the canvas."""
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = size * scale; ox = (size - s) / 2; oy = (size - s) / 2
    w = max(4, int(s * 0.085))
    # chevron
    p1 = (ox + s * 0.16, oy + s * 0.26); p2 = (ox + s * 0.46, oy + s * 0.50); p3 = (ox + s * 0.16, oy + s * 0.74)
    d.line([p1, p2, p3], fill=PH, width=w, joint='curve')
    for p in (p1, p3):
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=PH)
    # block cursor
    d.rectangle([ox + s * 0.54, oy + s * 0.64, ox + s * 0.86, oy + s * 0.74], fill=HI)
    glow = im.filter(ImageFilter.GaussianBlur(size * 0.03))
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.alpha_composite(glow); out.alpha_composite(glow); out.alpha_composite(im)
    return out

def glass(size, rounded=False, grid=True):
    im = Image.new('RGBA', (size, size), GLASS)
    d = ImageDraw.Draw(im, 'RGBA')
    if grid:
        step = max(8, size // 12)
        for x in range(0, size, step): d.line([(x, 0), (x, size)], fill=GRID, width=max(1, size // 512))
        for y in range(0, size, step): d.line([(0, y), (size, y)], fill=GRID, width=max(1, size // 512))
    # scanlines
    for y in range(0, size, max(3, size // 256)):
        d.line([(0, y), (size, y)], fill=(0, 0, 0, 26), width=1)
    # soft centre bloom
    bloom = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(bloom).ellipse([size * .15, size * .1, size * .85, size * .8], fill=(40, 140, 80, 46))
    im.alpha_composite(bloom.filter(ImageFilter.GaussianBlur(size * 0.12)))
    if rounded:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.2), fill=255)
        im.putalpha(mask)
    return im

def full(size, scale=0.72, rounded=False):
    im = glass(size, rounded=rounded)
    g = glyph(size, scale)
    im.alpha_composite(g)
    if rounded:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=int(size * 0.2), fill=255)
        im.putalpha(mask)
    return im

A = ROOT / 'assets'; W = ROOT / 'www' / 'icons'
A.mkdir(exist_ok=True); W.mkdir(parents=True, exist_ok=True)
full(1024, 0.72).save(A / 'icon-only.png')
glyph(1024, 0.5).save(A / 'icon-foreground.png')
glass(1024).save(A / 'icon-background.png')
for name in ('splash.png', 'splash-dark.png'):
    sp = glass(2732); sp.alpha_composite(glyph(2732, 0.22)); sp.save(A / name)
full(192, 0.72, rounded=True).save(W / 'icon-192.png')
full(512, 0.72, rounded=True).save(W / 'icon-512.png')
full(512, 0.5).save(W / 'maskable-512.png')
full(180, 0.72).save(W / 'apple-touch-icon.png')
print('icons written')
