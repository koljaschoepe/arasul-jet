#!/usr/bin/env python3
"""Haelt das Designsystem an seiner Quelle (Phase D7, 28.08.2026).

Warum es diesen Waechter gibt
-----------------------------
`packages/marken/` hat zwei Ausgaenge und eine Quelle:

    die Shell   uebersetzt `src/` selbst (Vite-Alias `@marken`)
    eine App    laedt `browser/marken.js`, ein eingechecktes Buendel

Der zweite Ausgang ist der gefaehrliche. Ein Buendel ist eine Kopie, und eine
Kopie veraltet lautlos: wer einen Baustein aendert und nicht neu baut, sieht in
der Shell das Neue und in jeder App das Alte -- also genau die zwei
Erscheinungsbilder, gegen die diese Bibliothek gebaut wurde. Nichts an der
Oberflaeche wuerde davon rot.

Was geprueft wird
-----------------
1. Jeder Name, den `src/index.ts` und `src/browser.ts` ausgeben, steht auch im
   Buendel. Ein neuer Baustein ohne neuen Bau faellt damit auf.
2. Die Fassung aus `src/fassung.ts` steht im Buendel. Wer einen Baustein
   AENDERT, ohne einen neuen hinzuzufuegen, hebt sie -- und baut neu.
3. Jede `ara-`Klasse, die ein Baustein benutzt, steht in `marken.css`. Eine
   Klasse ohne Regel ist ein Baustein ohne Aussehen, und das sieht man erst
   im Browser.
4. Kein Baustein importiert aus der Shell (`@/`). Die Bibliothek gehoert
   beiden Seiten; was von der Shell abhaengt, gehoert nicht hinein.

Was er NICHT kann
-----------------
Er vergleicht nicht Byte fuer Byte, ob das Buendel wirklich aus dieser Quelle
gebaut wurde -- dazu muesste er bauen, und ein Waechter, der einen Buendler
startet, ist keiner mehr. Er faengt die zwei Faelle, die vorkommen: ein neuer
Baustein und eine gehobene Fassung.

Aufruf:  python3 scripts/test/marken.py --wurzel .
Rueckgabe 0, wenn alles stimmt, sonst 1.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Namen, die zwar exportiert werden, aber keine Laufzeit-Werte sind: reine
# Typen verschwinden beim Uebersetzen und koennen im Buendel gar nicht stehen.
TYP_ZEILE = re.compile(r"^export\s+type\s")
EXPORT_ZEILE = re.compile(r"^export\s+(?:const\s+(\w+)|function\s+(\w+)|\{([^}]*)\})")


def namen_aus(quelle: Path) -> set[str]:
    """Alles, was diese Datei als WERT ausgibt."""
    namen: set[str] = set()
    for zeile in quelle.read_text(encoding="utf-8").splitlines():
        zeile = zeile.strip()
        if TYP_ZEILE.match(zeile):
            continue
        treffer = EXPORT_ZEILE.match(zeile)
        if not treffer:
            continue
        einzeln, funktion, gruppe = treffer.groups()
        if einzeln:
            namen.add(einzeln)
        if funktion:
            namen.add(funktion)
        if gruppe:
            for teil in gruppe.split(","):
                teil = teil.strip()
                if not teil or teil.startswith("type "):
                    continue
                namen.add(teil.split(" as ")[-1].strip())
    return namen


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--wurzel", default=".")
    args = p.parse_args()
    wurzel = Path(args.wurzel).resolve()
    ordner = wurzel / "packages" / "marken"
    quelle = ordner / "src"
    buendel = ordner / "browser" / "marken.js"

    befunde: list[str] = []

    if not quelle.is_dir():
        print(f"FEHLER  {quelle} gibt es nicht")
        return 1
    if not buendel.is_file():
        print(f"FEHLER  {buendel} fehlt -- `npm run marken` baut es")
        return 1

    gebuendelt = buendel.read_text(encoding="utf-8")

    # 1. Jeder ausgegebene Name steht im Buendel.
    erwartet = namen_aus(quelle / "index.ts") | namen_aus(quelle / "browser.ts")
    ausgegeben = set()
    for block in re.findall(r"export\s*\{([^}]*)\}", gebuendelt):
        for teil in block.split(","):
            teil = teil.strip()
            if teil:
                ausgegeben.add(teil.split(" as ")[-1].strip())
    for name in sorted(erwartet - ausgegeben):
        befunde.append(f"{name} steht in der Quelle, aber nicht im Buendel -- `npm run marken`")

    # 2. Die Fassung.
    fassung = re.search(
        r"FASSUNG\s*=\s*['\"]([^'\"]+)['\"]", (quelle / "fassung.ts").read_text(encoding="utf-8")
    )
    if not fassung:
        befunde.append("src/fassung.ts nennt keine FASSUNG")
    elif f'"{fassung.group(1)}"' not in gebuendelt and f"'{fassung.group(1)}'" not in gebuendelt:
        befunde.append(
            f"Das Buendel traegt nicht die Fassung {fassung.group(1)} -- `npm run marken`"
        )

    # 3. Jede benutzte Klasse hat eine Regel.
    css = (quelle / "marken.css").read_text(encoding="utf-8")
    for datei in sorted(quelle.glob("*.tsx")):
        text = datei.read_text(encoding="utf-8")
        for klasse in sorted(set(re.findall(r"['\"](ara-[\w-]+(?:__[\w-]+)?)['\"]", text))):
            if f".{klasse}" not in css:
                befunde.append(f"{datei.name}: die Klasse {klasse} hat keine Regel in marken.css")

    # 4. Keine Abhaengigkeit von der Shell.
    for datei in sorted(list(quelle.glob("*.tsx")) + list(quelle.glob("*.ts"))):
        for nr, zeile in enumerate(datei.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"from\s+['\"]@/", zeile):
                befunde.append(
                    f"{datei.name}:{nr} importiert aus der Shell (@/) -- "
                    "die Bibliothek gehoert beiden Seiten"
                )

    print("")
    print("===  Marken (Designsystem)  ===")
    print(f"  Bausteine: {len(sorted(quelle.glob('*.tsx')))}, Ausgaben: {len(erwartet)}")
    if befunde:
        for b in befunde:
            print(f"  FAIL  {b}")
        print("\n  RESULT: FAILED")
        return 1
    print("  PASS  Buendel, Fassung, Klassen und Grenzen stimmen")
    print("\n  RESULT: PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
