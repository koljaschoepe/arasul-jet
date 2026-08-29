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
5. Jeder Rueckfall in `marken.css` ist der Wert, den derselbe Token in
   `theme.css` traegt -- Hell gegen `:root`, Dunkel gegen
   `[data-theme='dark']`. Und kein Token, den `theme.css` im Dunkeln
   ueberschreibt, fehlt im Dunkel-Block der Bibliothek (Phase H2/H3).

Warum Punkt 5 (Phase H2, 29.08.2026)
------------------------------------
`marken.css` schreibt jeden Wert als `var(--token-der-shell, <Rueckfall>)`:
in der Shell gilt der Token, in einer App der Rueckfall. Das ist eine Kopie,
und eine Kopie veraltet lautlos -- dieselbe Klasse wie das Buendel oben, nur
dass es hier NICHT auffaellt, weil in der Shell immer der Token gewinnt. Wer
`--background` in `theme.css` aendert, sieht die Shell sofort nachziehen und
jede App ohne Bau auf dem alten Wert stehenbleiben. Seit H2 hat die Bibliothek zwei
Themen, also gibt es diese Kopie zweimal, und die Frage wird doppelt so
leicht falsch zu beantworten.

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


ARA_MIT_VAR = re.compile(r"^(--ara-[\w-]+)\s*:\s*var\(\s*(--[\w-]+)\s*,(.*)\)$", re.S)


def ohne_kommentare(css: str) -> str:
    """CSS ohne `/* ... */`.

    Zuerst, und nicht nebenbei: ein Kommentar hinter einem Semikolon haengt
    sonst an der NAECHSTEN Deklaration, und die faellt dann lautlos aus der
    Buchfuehrung. In `index.css` steht hinter fast jeder Zeile der
    Dichte-Skala einer.
    """
    return re.sub(r"/\*.*?\*/", " ", css, flags=re.S)


def block(css: str, selektor: str) -> str:
    """Der Inhalt ALLER Bloecke mit diesem Selektor, aneinandergehaengt.

    Klammernzaehlend und nicht mit einem gierigen `.*?`: eine Regel wie
    `@media` in einem Block wuerde den Text sonst mitten im Block enden
    lassen, und die Werte danach fehlten lautlos. Und der Selektor muss
    unmittelbar vor der Klammer stehen -- `@theme` faende sonst auch
    `@theme inline`, und `[data-theme='dark']` faende sich selbst in einem
    Satz und lieferte den naechstbesten Block.
    """
    stuecke: list[str] = []
    for treffer in re.finditer(rf"(?:^|[\s}}]){re.escape(selektor)}\s*\{{", css):
        auf = treffer.end() - 1
        tiefe, i = 1, auf + 1
        while i < len(css) and tiefe:
            if css[i] == "{":
                tiefe += 1
            elif css[i] == "}":
                tiefe -= 1
            i += 1
        stuecke.append(css[auf + 1 : i - 1])
    return "\n".join(stuecke)


def deklarationen(text: str) -> dict[str, str]:
    """`--name: wert` aus einem Blockinhalt, Klammern und Zeilen egal."""
    werte: dict[str, str] = {}
    tiefe, teil = 0, []
    for zeichen in text:
        if zeichen == "(":
            tiefe += 1
        elif zeichen == ")":
            tiefe -= 1
        if zeichen == ";" and tiefe == 0:
            teil_text = "".join(teil).strip()
            teil = []
            if teil_text.startswith("--") and ":" in teil_text:
                name, wert = teil_text.split(":", 1)
                werte[name.strip()] = wert.strip()
            continue
        teil.append(zeichen)
    return werte


def gleich(a: str, b: str) -> bool:
    """Zwei CSS-Werte, ohne Ruecksicht auf Gross-/Kleinschreibung und Weissraum.

    Ein Kommentar zaehlt nicht mit: `marken.css` erklaert seine Rueckfaelle,
    `index.css` erklaert seine Werte, und die zwei Erklaerungen muessen nicht
    dieselben sein.
    """
    def sauber(wert: str) -> str:
        wert = re.sub(r"/\*.*?\*/", " ", wert, flags=re.S)
        return re.sub(r"\s+", " ", wert).strip().lower().rstrip(";")

    return sauber(a) == sauber(b)


def rueckfaelle_pruefen(marken_css: str, wurzel: Path) -> list[str]:
    """Punkt 5: jeder Rueckfall ist der Wert seines Tokens in `theme.css`.

    Bis H2 stand die Quelle in `apps/dashboard-frontend/src/index.css`, und die
    Bibliothek trug die Kopie. Seit H3 ist es umgekehrt: `theme.css` liegt
    NEBEN `marken.css` in derselben Bibliothek, und die Shell holt sie von
    dort. Die Kopie gibt es trotzdem noch -- eine App OHNE Bau laedt nur
    `marken.css` und steht dann auf den Rueckfaellen --, also wird sie weiter
    gehalten, nur eben gegen die Datei nebenan.
    """
    marken_css = ohne_kommentare(marken_css)
    index = wurzel / "packages" / "marken" / "src" / "theme.css"
    if not index.is_file():
        return [f"{index} gibt es nicht -- ohne die Quelle ist kein Rueckfall zu pruefen"]
    quelle = ohne_kommentare(index.read_text(encoding="utf-8"))

    # `@theme` traegt Schrift, Rundungen und die Dichte-Skala, `:root` die
    # Farben und alles andere. Beides ist das helle Thema.
    hell = deklarationen(block(quelle, "@theme")) | deklarationen(block(quelle, ":root"))
    dunkel = deklarationen(block(quelle, "[data-theme='dark']"))

    befunde: list[str] = []
    for name, selektor, quelle_werte in (
        ("Hell", ":root", hell),
        ("Dunkel", "[data-theme='dark']", {**hell, **dunkel}),
    ):
        for ara, wert in deklarationen(block(marken_css, selektor)).items():
            treffer = ARA_MIT_VAR.match(f"{ara}: {wert}")
            if not treffer:
                # Ein Wert ohne Token (`--ara-schmal-bis`) gehoert der
                # Bibliothek allein und hat in `index.css` nichts zu suchen.
                continue
            _, token, rueckfall = treffer.groups()
            if token not in quelle_werte:
                befunde.append(
                    f"marken.css ({name}): {ara} zeigt auf {token}, "
                    f"und den gibt es in theme.css nicht"
                )
            elif not gleich(rueckfall, quelle_werte[token]):
                befunde.append(
                    f"marken.css ({name}): {ara} faellt auf "
                    f"`{re.sub(r'\s+', ' ', rueckfall).strip()}` zurueck, "
                    f"{token} traegt in theme.css `{quelle_werte[token]}`"
                )

    # Die andere Richtung: was `index.css` im Dunkeln ueberschreibt, muss die
    # Bibliothek im Dunkeln auch ueberschreiben. Sonst steht eine App im
    # dunklen Thema auf einem hellen Wert -- und in der Shell faellt es nie
    # auf, weil dort der Token gewinnt.
    im_dunkeln = deklarationen(block(marken_css, "[data-theme='dark']"))
    tokens_im_dunkeln = {
        treffer.group(2)
        for ara, wert in im_dunkeln.items()
        if (treffer := ARA_MIT_VAR.match(f"{ara}: {wert}"))
    }
    for ara, wert in deklarationen(block(marken_css, ":root")).items():
        treffer = ARA_MIT_VAR.match(f"{ara}: {wert}")
        if not treffer:
            continue
        token = treffer.group(2)
        if token in dunkel and token not in tokens_im_dunkeln:
            befunde.append(
                f"marken.css: {ara} zeigt auf {token}, und theme.css gibt dem "
                f"im Dunkeln einen anderen Wert -- der Dunkel-Block der "
                f"Bibliothek laesst ihn aus"
            )
    for ara, wert in im_dunkeln.items():
        treffer = ARA_MIT_VAR.match(f"{ara}: {wert}")
        if treffer and treffer.group(2) not in dunkel:
            befunde.append(
                f"marken.css: {ara} steht im Dunkel-Block, aber "
                f"{treffer.group(2)} weicht in index.css gar nicht ab -- "
                f"eine Farbe, die es nur im Dunkeln gibt, fehlt im Hellen"
            )
    return befunde


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

    # 5. Die Rueckfaelle stehen an ihrem Token in `index.css`.
    befunde.extend(rueckfaelle_pruefen(css, wurzel))

    print("")
    print("===  Marken (Designsystem)  ===")
    print(f"  Bausteine: {len(sorted(quelle.glob('*.tsx')))}, Ausgaben: {len(erwartet)}")
    if befunde:
        for b in befunde:
            print(f"  FAIL  {b}")
        print("\n  RESULT: FAILED")
        return 1
    print("  PASS  Buendel, Fassung, Klassen, Grenzen und Rueckfaelle stimmen")
    print("\n  RESULT: PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
