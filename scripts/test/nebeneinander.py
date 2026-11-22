#!/usr/bin/env python3
"""Vorher und nachher nebeneinander, je Ansicht ein Bild (J53, M7).

Liest `docs/plans/audits/2026-11-22-gemeinsame-linie/{vorher,nachher}/` und
schreibt nach `.../nebeneinander/` je Name ein Bild: links vorher, rechts
nachher, oben die Beschriftung. Bilder bei 390 px (doppelte Dichte) werden auf
die Höhe der 1440er gebracht. Braucht Pillow.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ORDNER = Path(__file__).resolve().parents[2] / "docs/plans/audits/2026-11-22-gemeinsame-linie"
ZIEL = ORDNER / "nebeneinander"
ZIEL.mkdir(exist_ok=True)
try:
    SCHRIFT = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 28)
except OSError:
    SCHRIFT = ImageFont.load_default()

for vorher in sorted((ORDNER / "vorher").glob("*.png")):
    nachher = ORDNER / "nachher" / vorher.name
    if not nachher.exists():
        continue
    a, b = Image.open(vorher).convert("RGB"), Image.open(nachher).convert("RGB")
    hoehe = 900
    a = a.resize((round(a.width * hoehe / a.height), hoehe))
    b = b.resize((round(b.width * hoehe / b.height), hoehe))
    rand, kopf = 24, 56
    bild = Image.new("RGB", (a.width + b.width + 3 * rand, hoehe + kopf + rand), "white")
    zeichne = ImageDraw.Draw(bild)
    zeichne.text((rand, 14), f"vorher · {vorher.stem}", fill="black", font=SCHRIFT)
    zeichne.text((2 * rand + a.width, 14), "nachher", fill="black", font=SCHRIFT)
    bild.paste(a, (rand, kopf))
    bild.paste(b, (2 * rand + a.width, kopf))
    bild.save(ZIEL / vorher.name, optimize=True)
    print(ZIEL / vorher.name)
