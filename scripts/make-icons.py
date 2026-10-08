"""Draws the app icon (samurai stick figure under a blood moon) into public/icons/. Run: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw, ImageFilter
import math, os

S = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'icons')


def art(size=S, inset=1.0):
    img = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(img)
    top, bottom = (34, 18, 52), (122, 40, 58)
    for y in range(size):
        t = y / size
        d.line([(0, y), (size, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(top, bottom)))
    # Everything else is drawn in a centred square scaled by `inset` (maskable icons need a safe zone).
    k = size / S * inset
    o = (size - S * k) / 2
    P = lambda x, y: (o + x * k, o + y * k)
    R = lambda r: r * k

    # Blood moon with a glow.
    glow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy = P(730, 270)
    gd.ellipse([cx - R(260), cy - R(260), cx + R(260), cy + R(260)], fill=(255, 80, 60, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(R(60)))
    img.paste(glow, (0, 0), glow)
    d = ImageDraw.Draw(img)
    d.ellipse([cx - R(165), cy - R(165), cx + R(165), cy + R(165)], fill=(214, 52, 42))

    # Floating island.
    d.polygon([P(150, 800), P(874, 800), P(700, 930), P(512, 990), P(330, 930)], fill=(94, 79, 58))
    d.ellipse([*P(130, 740), *P(894, 860)], fill=(214, 200, 160))

    def limb(a, b, w=46, color=(36, 48, 90)):
        d.line([P(*a), P(*b)], fill=color, width=int(R(w)))
        for x, y in (a, b):
            d.ellipse([P(x - w / 2, y - w / 2), P(x + w / 2, y + w / 2)], fill=color)

    # Samurai stick figure, katana raised.
    hip, neck = (512, 600), (512, 430)
    limb((470, 790), (490, 690)); limb((490, 690), hip)          # left leg
    limb((600, 785), (575, 690)); limb((575, 690), hip)          # right leg
    limb(hip, neck, 58)                                          # torso
    d.rounded_rectangle([P(452, 440), P(572, 585)], radius=R(26), fill=(179, 38, 30))   # red breastplate
    for y in (480, 520, 560):
        d.line([P(458, y), P(566, y)], fill=(47, 95, 191), width=int(R(8)))
    limb((500, 450), (430, 520), 40); limb((430, 520), (470, 400), 36)   # left arm up to the hilt
    limb((525, 450), (590, 500), 40); limb((590, 500), (500, 395), 36)   # right arm
    # Katana: silver blade up and back, gold guard, blue hilt.
    d.line([P(485, 395), P(330, 150)], fill=(232, 236, 240), width=int(R(22)))
    d.line([P(485, 395), P(330, 150)], fill=(150, 160, 170), width=int(R(6)))
    d.line([P(470, 410), P(520, 380)], fill=(224, 176, 46), width=int(R(20)))
    d.line([P(492, 398), P(540, 470)], fill=(34, 59, 110), width=int(R(22)))
    # Head with kabuto and golden horns.
    d.ellipse([P(462, 300), P(562, 400)], fill=(36, 48, 90))
    d.pieslice([P(450, 285), P(574, 409)], 180, 360, fill=(28, 27, 34))
    d.rectangle([P(450, 340), P(574, 352)], fill=(224, 176, 46))
    d.line([P(495, 330), P(440, 230)], fill=(224, 176, 46), width=int(R(16)))
    d.line([P(529, 330), P(584, 230)], fill=(224, 176, 46), width=int(R(16)))
    d.ellipse([P(486, 360), P(500, 374)], fill=(255, 210, 80))
    d.ellipse([P(524, 360), P(538, 374)], fill=(255, 210, 80))
    return img


os.makedirs(OUT, exist_ok=True)
full = art()
for size, name in ((512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')):
    full.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))
art(inset=0.78).resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, 'maskable-512.png'))
print('icons written to', os.path.abspath(OUT))
