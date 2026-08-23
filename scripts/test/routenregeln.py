#!/usr/bin/env python3
"""Regel 1 der CLAUDE.md, als Pruefung statt als Vorsatz.

Sie lautet: jede Route benutzt `asyncHandler` und wirft Fehlerklassen aus
`utils/errors.js`, niemals `throw new Error`, und niemals `try/catch` auf
Routen-Ebene.

Am 24.08.2026 nachgemessen, weil ich wissen wollte, ob die 26 Stellen vom
Vortag wirklich alle waren: in `routes/` steht kein einziges
`throw new Error`, und von 386 Routen hat jede ihren `asyncHandler`. Die
Regel ist also eingehalten — und durch nichts gesichert.

Ein `throw new Error` in einer Route wird vom Fehler-Handler zu HTTP 500
"Internal server error". Der Kunde sieht dann einen Serverfehler, wo eine
Eingabe gefehlt hat. Genau diese Sorte Befund hat am 23.08.2026 fuenf
Endpunkte betroffen, und alle fuenf waren von gruenen Unit-Tests gedeckt.

Was NICHT geprueft wird, und warum:

  `async` ohne `asyncHandler` ist der Fehler, nicht `async` an sich. Vier
  Routen stellen einen Multer-Wrapper vor den Handler, der `asyncHandler`
  steht dort erst zwanzig Zeilen spaeter. Drei weitere Handler sind synchron
  und brauchen gar keinen. Eine Pruefung, die diese sieben meldet, wird
  abgeschaltet, bevor sie den ersten echten Fall findet.

  `try/catch` bleibt ungeprueft. In den Routendateien stehen hundert davon,
  die meisten in Hilfsfunktionen, wo sie richtig sind. Sie von den falschen zu
  trennen braucht mehr als ein Muster.

Rueckgabe: 0 wenn beide Regeln eingehalten sind, 1 sonst.
"""
import argparse
import re
import sys
from pathlib import Path

ROUTE = re.compile(r'router\.(get|post|put|patch|delete)\(')
# Ein Routenblock reicht bis zur naechsten Routendefinition. Grosszuegig, weil
# ein Multer-Wrapper zwanzig Zeilen dazwischenschieben kann.
FENSTER = 40


def routenbloecke(zeilen: list[str]):
    """Liefert (Zeilennummer, Text) je Routendefinition."""
    anfaenge = [i for i, z in enumerate(zeilen) if ROUTE.search(z)]
    for stelle, i in enumerate(anfaenge):
        ende = anfaenge[stelle + 1] if stelle + 1 < len(anfaenge) else len(zeilen)
        yield i + 1, '\n'.join(zeilen[i:min(ende, i + FENSTER)])


def pruefe(wurzel: Path) -> tuple[list, list]:
    ordner = wurzel / 'apps' / 'dashboard-backend' / 'src' / 'routes'
    geworfen, ohne_wrapper = [], []
    for datei in sorted(ordner.rglob('*.js')):
        zeilen = datei.read_text(encoding='utf-8').splitlines()
        for nummer, zeile in enumerate(zeilen, 1):
            if 'throw new Error' in zeile and not zeile.strip().startswith('//'):
                geworfen.append((datei.relative_to(wurzel), nummer, zeile.strip()[:90]))
        for nummer, block in routenbloecke(zeilen):
            if 'async' in block and 'asyncHandler' not in block:
                erste = block.splitlines()[0].strip()[:70]
                ohne_wrapper.append((datei.relative_to(wurzel), nummer, erste))
    return geworfen, ohne_wrapper


def main() -> int:
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument('--wurzel', default='.', help='Wurzel des Repos')
    args = zerleger.parse_args()

    wurzel = Path(args.wurzel)
    if not (wurzel / 'apps' / 'dashboard-backend' / 'src' / 'routes').is_dir():
        print('   Routenregeln: keine Routen gefunden, nichts zu pruefen')
        return 0

    geworfen, ohne_wrapper = pruefe(wurzel)
    if not geworfen and not ohne_wrapper:
        print('   Routenregeln: kein `throw new Error`, jede async-Route mit asyncHandler')
        return 0

    if geworfen:
        print(f'   Routenregeln: {len(geworfen)} mal `throw new Error` in einer Route.')
        print('   Das wird zu HTTP 500 "Internal server error", auch wenn nur eine')
        print('   Eingabe gefehlt hat. Fehlerklasse aus utils/errors.js nehmen:')
        for datei, nummer, text in geworfen:
            print(f'     {datei}:{nummer}')
            print(f'       {text}')

    if ohne_wrapper:
        print(f'   Routenregeln: {len(ohne_wrapper)} async-Route(n) ohne asyncHandler.')
        print('   Ein abgelehntes Promise landet dort nicht im Fehler-Handler:')
        for datei, nummer, text in ohne_wrapper:
            print(f'     {datei}:{nummer}  {text}')
    return 1


if __name__ == '__main__':
    sys.exit(main())
