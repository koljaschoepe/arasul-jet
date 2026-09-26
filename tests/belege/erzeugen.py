#!/usr/bin/env python3
"""Fuenf erfundene Belegfotos fuer die Messung der Bildmodelle (J35, 26.09.2026).

Eine Kanzlei fotografiert Belege: eine Tankquittung, eine Rechnung, einen
Kassenbon, eine Bewirtung -- und das meiste davon mit dem Handy, schraeg und
im Schatten. Die fuenf Bilder hier sind erfunden (keine echte Firma, keine
echte Steuernummer) und tragen je sechs Felder, deren Wahrheit in
`wahrheit.json` steht. `scripts/test/bildmodelle-messen.sh` schickt sie an
jedes Bildmodell des Geraets und zaehlt, wie viele Felder stimmen.

Die Bilder sind eingecheckt; dieses Skript braucht nur, wer sie aendert
(Pillow und die Schriften eines Macs: Courier New, Arial).
    python3 tests/belege/erzeugen.py
"""
import json
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HIER = Path(__file__).resolve().parent
SCHRIFTEN = Path("/System/Library/Fonts/Supplemental")


def schrift(name, groesse):
    return ImageFont.truetype(str(SCHRIFTEN / name), groesse)


def euro(wert):
    return f"{wert:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def zettel(breite, zeilen, schriftname="Courier New.ttf", groesse=26, rand=40, papier=(250, 250, 246)):
    """Zeilen untereinander auf ein Blatt. Eine Zeile ist (text, ausrichtung, fett, groesse)."""
    hoehe = rand * 2 + sum(int((z[3] if len(z) > 3 and z[3] else groesse) * 1.45) for z in zeilen)
    bild = Image.new("RGB", (breite, hoehe), papier)
    zeichnen = ImageDraw.Draw(bild)
    y = rand
    for zeile in zeilen:
        text, wo = zeile[0], zeile[1]
        fett = len(zeile) > 2 and zeile[2]
        g = zeile[3] if len(zeile) > 3 and zeile[3] else groesse
        name = schriftname.replace(".ttf", " Bold.ttf") if fett else schriftname
        f = schrift(name, g)
        if isinstance(text, tuple):  # links und rechts in einer Zeile
            zeichnen.text((rand, y), text[0], font=f, fill=(25, 25, 25))
            w = zeichnen.textlength(text[1], font=f)
            zeichnen.text((breite - rand - w, y), text[1], font=f, fill=(25, 25, 25))
        else:
            w = zeichnen.textlength(text, font=f)
            x = {"l": rand, "m": (breite - w) / 2, "r": breite - rand - w}[wo]
            zeichnen.text((x, y), text, font=f, fill=(25, 25, 25))
        y += int(g * 1.45)
    return bild


def auf_tisch(beleg, winkel, tisch=(120, 105, 90), rand=90, seed=1):
    """Ein Foto: der Beleg leicht gedreht auf einem Tisch, etwas Rauschen."""
    rnd = random.Random(seed)
    gedreht = beleg.rotate(winkel, expand=True, fillcolor=tisch, resample=Image.BICUBIC)
    foto = Image.new("RGB", (gedreht.width + 2 * rand, gedreht.height + 2 * rand), tisch)
    foto.paste(gedreht, (rand, rand))
    px = foto.load()
    for _ in range(foto.width * foto.height // 40):
        x, y = rnd.randrange(foto.width), rnd.randrange(foto.height)
        r, g, b = px[x, y]
        d = rnd.randint(-12, 12)
        px[x, y] = (max(0, min(255, r + d)), max(0, min(255, g + d)), max(0, min(255, b + d)))
    return foto.filter(ImageFilter.GaussianBlur(0.6))


def schraeg(foto, seed=5):
    """Handyfoto von der Seite: Perspektive, Schatten von links, weich, JPEG."""
    w, h = foto.size
    # Ziel-Viereck -> Quelle: oben schmaler als unten, rechts naeher.
    quelle = [(0, 0), (w, 0), (w, h), (0, h)]
    ziel = [(w * 0.10, h * 0.04), (w * 0.93, 0), (w, h), (0, h * 0.97)]
    koeff = _perspektive(ziel, quelle)
    verzerrt = foto.transform((w, h), Image.PERSPECTIVE, koeff, Image.BICUBIC, fillcolor=(95, 85, 75))
    schatten = Image.linear_gradient("L").rotate(90).resize((w, h))
    dunkel = Image.new("RGB", (w, h), (40, 35, 30))
    maske = schatten.point(lambda v: int(v * 0.45))
    verzerrt = Image.composite(dunkel, verzerrt, maske)
    return verzerrt.filter(ImageFilter.GaussianBlur(1.1))


def _perspektive(ziel, quelle):
    import numpy as np

    a = []
    for (x, y), (u, v) in zip(ziel, quelle):
        a.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        a.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    b = [c for p in quelle for c in p]
    return list(np.linalg.solve(np.array(a, dtype=float), np.array(b, dtype=float)))


def speichern(name, bild, wahrheit, alle):
    bild.convert("RGB").save(HIER / f"{name}.jpg", quality=82)
    alle[name] = wahrheit


def main():
    alle = {}

    # 1. Tankquittung -----------------------------------------------------------
    netto, satz = 58.34, 19
    mwst = round(netto * satz / 100, 2)
    brutto = round(netto + mwst, 2)
    t = zettel(560, [
        ("NORDLICHT TANKSTELLE", "m", True, 30),
        ("Hafenstrasse 12", "m"), ("24103 Kiel", "m"), ("Tel. 0431 000000", "m"), ("", "m"),
        (("Beleg-Nr.", "4711-0815"), "l"), (("Datum", "14.08.2026"), "l"), (("Uhrzeit", "07:42"), "l"),
        ("--------------------------------", "m"),
        (("Saeule 3 Super E10", ""), "l"), (("38,91 l x 1,784", euro(brutto) + " EUR"), "l"),
        ("--------------------------------", "m"),
        (("SUMME EUR", euro(brutto)), "l", True, 30), ("", "m"),
        (("Netto", euro(netto)), "l"), (("MwSt 19%", euro(mwst)), "l"), (("Brutto", euro(brutto)), "l"), ("", "m"),
        (("Bezahlt: girocard", ""), "l"), ("Vielen Dank und gute Fahrt!", "m"),
    ])
    speichern("tankquittung", auf_tisch(t, 3, seed=11), {
        "art": "Tankquittung", "haendler": "Nordlicht Tankstelle", "datum": "14.08.2026",
        "brutto": brutto, "netto": netto, "mwst_satz": satz, "mwst_betrag": mwst}, alle)

    # 2. Rechnung ---------------------------------------------------------------
    netto, satz = 1250.00, 19
    mwst = round(netto * satz / 100, 2)
    brutto = round(netto + mwst, 2)
    r = zettel(1100, [
        ("Bergmann & Soehne Buerotechnik GmbH", "l", True, 34),
        ("Lindenallee 7 · 50667 Koeln · USt-IdNr. DE000000000", "l", False, 20), ("", "l"),
        ("Kanzlei Weber Steuerberatung", "l"), ("Marktplatz 3", "l"), ("53111 Bonn", "l"), ("", "l"),
        ("RECHNUNG", "l", True, 36),
        (("Rechnungsnummer: RE-2026-0342", "Rechnungsdatum: 02.09.2026"), "l"),
        (("Kundennummer: 10087", "Leistungsdatum: 29.08.2026"), "l"), ("", "l"),
        (("Pos. Beschreibung", "Betrag"), "l", True),
        (("1  Multifunktionsdrucker MX-400", "990,00 EUR"), "l"),
        (("2  Einrichtung und Einweisung, 2 Std.", "260,00 EUR"), "l"), ("", "l"),
        (("Nettobetrag", euro(netto) + " EUR"), "l"),
        (("Umsatzsteuer 19 %", euro(mwst) + " EUR"), "l"),
        (("Rechnungsbetrag", euro(brutto) + " EUR"), "l", True, 30), ("", "l"),
        ("Zahlbar innerhalb von 14 Tagen ohne Abzug.", "l", False, 22),
        ("IBAN DE00 0000 0000 0000 0000 00 · Sparkasse KoelnBonn", "l", False, 22),
    ], schriftname="Arial.ttf", groesse=26, rand=70, papier=(252, 252, 252))
    speichern("rechnung", auf_tisch(r, -1.5, tisch=(200, 200, 205), seed=12), {
        "art": "Rechnung", "haendler": "Bergmann & Soehne Buerotechnik GmbH", "datum": "02.09.2026",
        "brutto": brutto, "netto": netto, "mwst_satz": satz, "mwst_betrag": mwst}, alle)

    # 3. Kassenbon (7 %, Schreibwaren und Lebensmittel gemischt waere unfair: nur 7 %)
    posten = [("Kaffee Bohnen 1kg", 14.99), ("Milch 1,5% 1l", 1.19), ("Kekse Butter", 2.49),
              ("Zucker 500g", 0.99), ("Wasser 6x1,5l", 3.54)]
    brutto = round(sum(p for _, p in posten), 2)
    satz = 7
    netto = round(brutto / 1.07, 2)
    mwst = round(brutto - netto, 2)
    k = zettel(500, [
        ("FRISCHMARKT", "m", True, 34), ("Filiale 118", "m"), ("Bahnhofplatz 4, 79098 Freiburg", "m", False, 20),
        ("", "m"), *[((n, euro(p) + " B"), "l") for n, p in posten],
        ("------------------------------", "m"),
        (("SUMME", euro(brutto)), "l", True, 32),
        (("Gegeben BAR", "30,00"), "l"), (("Rueckgeld", euro(30 - brutto)), "l"), ("", "m"),
        (("MwSt  %    Netto   Steuer", ""), "l", False, 22),
        ((f"B    7%   {euro(netto)}", euro(mwst)), "l", False, 22), ("", "m"),
        (("21.09.2026  18:03", "Bon 5521"), "l", False, 22), ("Danke fuer Ihren Einkauf", "m"),
    ], groesse=24, papier=(247, 246, 240))
    speichern("kassenbon", auf_tisch(k, -4, tisch=(60, 70, 85), seed=13), {
        "art": "Kassenbon", "haendler": "Frischmarkt", "datum": "21.09.2026",
        "brutto": brutto, "netto": netto, "mwst_satz": satz, "mwst_betrag": mwst}, alle)

    # 4. Bewirtung --------------------------------------------------------------
    posten = [("2x Tagesmenue", 37.80), ("1x Apfelschorle 0,4", 3.90), ("1x Mineralwasser 0,75", 5.50),
              ("2x Espresso", 5.20)]
    brutto = round(sum(p for _, p in posten), 2)
    satz = 19
    netto = round(brutto / 1.19, 2)
    mwst = round(brutto - netto, 2)
    b = zettel(560, [
        ("Gasthaus Zur Linde", "m", True, 32), ("Dorfstrasse 21 · 93047 Regensburg", "m", False, 20),
        ("St.-Nr. 000/000/00000", "m", False, 20), ("", "m"),
        (("Tisch 7", "Bed. Maria"), "l"), (("Datum 11.09.2026", "12:58"), "l"),
        ("--------------------------------", "m"),
        *[((n, euro(p)), "l") for n, p in posten],
        ("--------------------------------", "m"),
        (("Gesamt EUR", euro(brutto)), "l", True, 30),
        (("enth. MwSt 19%", euro(mwst)), "l"), (("Netto", euro(netto)), "l"), ("", "m"),
        ("Bewirtungsaufwand-Angaben", "l", True, 22),
        ("Bewirtete Personen: ________", "l", False, 22),
        ("Anlass: ______________________", "l", False, 22),
        ("", "m"), ("Vielen Dank fuer Ihren Besuch", "m"),
    ])
    speichern("bewirtung", auf_tisch(b, 2, tisch=(150, 110, 80), seed=14), {
        "art": "Bewirtung", "haendler": "Gasthaus Zur Linde", "datum": "11.09.2026",
        "brutto": brutto, "netto": netto, "mwst_satz": satz, "mwst_betrag": mwst}, alle)

    # 5. Handyfoto schraeg: ein Baumarkt-Bon, von der Seite und im Schatten ----
    netto, satz = 36.97, 19
    mwst = round(netto * satz / 100, 2)
    brutto = round(netto + mwst, 2)
    h = zettel(540, [
        ("HOLZ + HAMMER Baumarkt", "m", True, 30), ("Industriestr. 55, 04109 Leipzig", "m", False, 20), ("", "m"),
        (("Schrauben 4x40 200St", "8,99"), "l"), (("Duebel 8mm 50St", "4,49"), "l"),
        (("Silikon weiss", "6,79"), "l"), (("Pinselset", "11,99"), "l"), (("Klebeband", euro(brutto - 32.26)), "l"),
        ("------------------------------", "m"),
        (("ZU ZAHLEN EUR", euro(brutto)), "l", True, 30), ("", "m"),
        (("Netto 19%", euro(netto)), "l"), (("MwSt 19%", euro(mwst)), "l"), ("", "m"),
        (("EC-Karte", euro(brutto)), "l"), (("16.09.2026", "15:27"), "l"),
    ])
    speichern("handyfoto-schraeg", schraeg(auf_tisch(h, -6, tisch=(170, 160, 150), seed=15)), {
        "art": "Handyfoto schraeg", "haendler": "Holz + Hammer Baumarkt", "datum": "16.09.2026",
        "brutto": brutto, "netto": netto, "mwst_satz": satz, "mwst_betrag": mwst}, alle)

    (HIER / "wahrheit.json").write_text(json.dumps(alle, ensure_ascii=False, indent=2) + "\n")
    for n, w in alle.items():
        print(n, w)


if __name__ == "__main__":
    main()
