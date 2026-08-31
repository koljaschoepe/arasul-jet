#!/usr/bin/env python3
"""Das Designsystem als Paket ausliefern (Phase H6, 29.08.2026).

Warum es diesen Bauschritt gibt
-------------------------------
`packages/marken/` ist die Bibliothek dieses Geraets, und sie hat bis H5 nur
EINEN Weg nach draussen gehabt: das eingecheckte Buendel `browser/marken.js`
fuer eine App ohne Bau. Wer eine App MIT Bau schrieb -- die Vorlage des
Ara-Kits --, nahm die Quelle, und "die Quelle" hiess: irgendein Ordner in
irgendeinem Checkout. Das Kit spiegelt sie deshalb heute aus dem
Auslieferungsartefakt (`.ara/mirror/packages/marken/src/`) und liest dort einen
FLACHEN Ordner. Seit H3 liegen die Primitive in `primitive/`, seit H4 die
Muster in `muster/` -- ein Spiegel, der nur die oberste Ebene mitnimmt, traegt
eine `index.ts`, die auf zwei Ordner zeigt, die es bei ihm nicht gibt.

Das Paket beantwortet die Frage, was zur Bibliothek gehoert, EINMAL und
nachpruefbar:

    marken.json    die Fassung, die Abhaengigkeiten und JEDE Datei mit ihrem
                   sha256 -- rekursiv, also mit `primitive/` und `muster/`
    src/           die Quelle (ohne `__tests__/`, ohne `browser.ts`)
    browser/       das Buendel fuer eine App ohne Bau
    README.md      wie man es in ein Projekt einbaut (`EINBAU.md`)

DAS PAKET IST, WAS `marken.json` NENNT. Das ist keine Floskel, sondern der
Grund, warum es zwei Aufrufe gibt und trotzdem keine zwei Wahrheiten:

    --ausgabe <verz>   legt das Paket als eigenen Ordner hin. Das nimmt ein
                       frisches Projekt ausserhalb dieses Repos, und das
                       spiegelt das Kit in seine Vorlage.
    --stempel <datei>  schreibt NUR die `marken.json`. So traegt das
                       Auslieferungsartefakt das Paket, ohne die Bibliothek
                       ein zweites Mal mitzuschleppen: neben `packages/marken/`
                       liegt der Stempel, und was er nennt, liegt darunter.
                       Die drei Dateien, die das Repo daneben hat
                       (`__tests__/`, `browser.ts`, `vite.config.mjs`), nennt
                       er nicht -- also gehoeren sie nicht dazu.
    --pruefen <verz>   liest den Stempel in einem Baum und haelt jede genannte
                       Datei an ihrem Hash fest. Das ist die Messung "traegt
                       dieses Artefakt das Paket".

Die Abhaengigkeiten sind nicht abgeschrieben
--------------------------------------------
Die Bibliothek ist kein npm-Paket (Regel 7 der Wurzel-`CLAUDE.md`): sie haengt
an einem Pfad-Alias, und ihre Abhaengigkeiten stehen in der `package.json` der
Shell, die sie mituebersetzt. Ein Paket muss sie trotzdem nennen -- wer es in
ein fremdes Projekt legt, hat die Shell nicht daneben. Also werden sie
GELESEN, nicht gepflegt: jeder Import aus `src/`, der kein relativer Pfad ist,
muss in der `package.json` der Shell stehen, und von dort kommt die
Versionsangabe. Eine neue Abhaengigkeit der Bibliothek steht damit ohne
Zutun im Paket; eine, die niemand installieren kann, bringt diesen Schritt zum
Stehen.

Aufrufe:
    python3 scripts/deploy/marken-paket.py --ausgabe dist/marken
    python3 scripts/deploy/marken-paket.py --stempel <baum>/packages/marken/marken.json
    python3 scripts/deploy/marken-paket.py --pruefen <baum>
Rueckgabe 0, wenn alles stimmt, sonst 1.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

# Was zur Quelle des Pakets gehoert. Alles andere unter `src/` ist etwas
# anderes: `__tests__/` gehoert der Entwicklung, und `browser.ts` ist der
# Eingang des Buendels -- es bringt React-DOM mit und haengt eine App an einen
# Knoten. In einer App aus einer Vorlage waere das Quelltext, den niemand
# aufruft; das Kit laesst es aus demselben Grund weg (`lib/marken.mjs`,
# NOT_MIRRORED).
ENDUNGEN = ('.ts', '.tsx', '.css')
NICHT_INS_PAKET = ('browser.ts',)
NICHT_INS_PAKET_ORDNER = ('__tests__',)

# Was der Bau des Aufrufers stellt und ein Paket nicht mitbringt. React zweimal
# in einem Baum ist der Fehler, den man erst an einem Hook sieht.
GLEICHLAUF = ('react', 'react-dom')

# Der Werkzeugkasten, den die Stylesheets brauchen -- nicht die Bausteine. Sie
# stehen hier und nicht bei den Abhaengigkeiten, weil sie kein `import` in
# einer `.tsx` sind und der Leser sie sonst nirgends findet: `theme.css`
# schreibt `@theme`, das versteht nur Tailwind, und die Bewegungen der
# Primitive (`animate-in`, `animate-accordion-down`) kommen aus
# `tw-animate-css`.
STYLESHEET_BRAUCHT = ('tailwindcss', 'tw-animate-css')

# Beide Formen eines Imports: `from '...'` UND das dynamische `import('...')`.
# Die zweite kam mit der Dokumentanzeige (Fassung 4.1.0): sie holt
# `pdfjs-dist` erst mit der ersten PDF-Quelle -- ein Leser, der nur `from`
# kennt, liesse die Abhaengigkeit aus dem Stempel, und ein frisches Projekt
# fiele beim Bauen darueber.
IMPORT = re.compile(r"""(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]""")
BLOCK_KOMMENTAR = re.compile(r'/\*.*?\*/', re.S)
ZEILEN_KOMMENTAR = re.compile(r'^\s*//.*$', re.M)


def ohne_kommentare(text: str) -> str:
    """Code ohne seine Kommentare.

    Ohne das zaehlt die Erklaerung als Import: `index.ts` schreibt in seinem
    Kopf `import { Button } from '@marken'` als Beispiel hin, und der
    Abhaengigkeitsleser verlangte daraufhin ein npm-Paket namens `@marken` --
    also genau das, was diese Bibliothek mit Absicht nicht ist.
    """
    return ZEILEN_KOMMENTAR.sub('', BLOCK_KOMMENTAR.sub(' ', text))


def paket_dateien(quelle: Path) -> list[str]:
    """Die Dateien des Pakets, relativ zu seiner Wurzel, in fester Reihenfolge.

    Fest sortiert, weil der Stempel in ein Artefakt geht: zweimal derselbe
    Stand soll zweimal dieselbe Datei ergeben, sonst waere jede Pruefsumme
    darueber wertlos (dieselbe Regel wie `--sort=name` im Tarball).

    `browser/` wird GANZ gelesen und nicht als eine feste Datei: seit der
    Dokumentanzeige (Fassung 4.1.0) liegen dort auch `marken-pdf.js` und der
    Ordner `pdf-dateien/` (Worker, WASM, Schriften, CMaps, ICC), und eine App
    ohne Bau braucht sie alle nebeneinander. Eine Liste von Hand waere die,
    die beim naechsten Brocken auseinanderlaeuft.
    """
    dateien = []
    for pfad in sorted(quelle.rglob('*')):
        if not pfad.is_file() or pfad.suffix not in ENDUNGEN:
            continue
        rel = pfad.relative_to(quelle)
        if rel.name in NICHT_INS_PAKET:
            continue
        if any(teil in NICHT_INS_PAKET_ORDNER for teil in rel.parts):
            continue
        dateien.append(f'src/{rel.as_posix()}')
    browser = quelle.parent / 'browser'
    if browser.is_dir():
        dateien += [
            f'browser/{pfad.relative_to(browser).as_posix()}'
            for pfad in sorted(browser.rglob('*'))
            if pfad.is_file()
        ]
    else:
        dateien.append('browser/marken.js')
    return dateien


def hash_von(pfad: Path) -> str:
    return hashlib.sha256(pfad.read_bytes()).hexdigest()


def paketname(spezifizierer: str) -> str:
    """Der Paketname aus einem Import. `radix-ui/x` und `@scope/paket/x`."""
    teile = spezifizierer.split('/')
    return '/'.join(teile[:2]) if spezifizierer.startswith('@') else teile[0]


def abhaengigkeiten(quelle: Path, shell_paket: Path) -> tuple[dict[str, str], list[str]]:
    """Was das Paket braucht, gelesen aus den Importen und der Shell.

    Zwei Fehler koennen dabei auffallen, und beide sind einer zu viel: ein
    Import auf ein Paket, das die Shell gar nicht installiert (dann uebersetzt
    die Shell es auch nicht, und der Fehler steht nur noch nicht da), und ein
    Import, den bisher niemand als Abhaengigkeit gefuehrt hat (dann faellt ein
    frisches Projekt darueber, dieses Repo nie).
    """
    shell = json.loads(shell_paket.read_text(encoding='utf-8'))
    verfuegbar = {**shell.get('dependencies', {}), **shell.get('devDependencies', {})}

    gebraucht: set[str] = set()
    for pfad in sorted(quelle.rglob('*')):
        if not pfad.is_file() or pfad.suffix not in ('.ts', '.tsx'):
            continue
        rel = pfad.relative_to(quelle)
        if rel.name in NICHT_INS_PAKET or any(t in NICHT_INS_PAKET_ORDNER for t in rel.parts):
            continue
        for treffer in IMPORT.findall(ohne_kommentare(pfad.read_text(encoding='utf-8'))):
            if treffer.startswith('.'):
                continue
            gebraucht.add(paketname(treffer))

    gebraucht |= set(STYLESHEET_BRAUCHT)
    fehlt = sorted(n for n in gebraucht if n not in verfuegbar)
    deps = {
        name: verfuegbar[name]
        for name in sorted(gebraucht)
        if name not in GLEICHLAUF and name in verfuegbar
    }
    return deps, fehlt


def fassung_von(quelle: Path) -> str | None:
    text = (quelle / 'fassung.ts').read_text(encoding='utf-8')
    treffer = re.search(r"FASSUNG\s*=\s*['\"]([^'\"]+)['\"]", text)
    return treffer.group(1) if treffer else None


def stempel(wurzel: Path, produktfassung: str | None, commit: str | None) -> tuple[dict, list[str]]:
    """Der Inhalt der `marken.json` -- und was daran nicht stimmt."""
    ordner = wurzel / 'packages' / 'marken'
    quelle = ordner / 'src'
    buendel = ordner / 'browser' / 'marken.js'

    befunde: list[str] = []
    if not quelle.is_dir():
        return {}, [f'{quelle} gibt es nicht']
    if not buendel.is_file():
        return {}, [f'{buendel} fehlt -- `npm run marken` baut es']

    fassung = fassung_von(quelle)
    if not fassung:
        befunde.append('src/fassung.ts nennt keine FASSUNG')
    else:
        # Dieselbe Frage wie `marken.py` Punkt 2, und hier noch einmal: ein
        # Paket, dessen Buendel aus einer anderen Fassung stammt als seine
        # Quelle, liefert einer App ohne Bau etwas anderes aus als einer App
        # mit Bau -- also genau die zwei Erscheinungsbilder, gegen die die
        # Bibliothek gebaut ist.
        text = buendel.read_text(encoding='utf-8')
        if f'"{fassung}"' not in text and f"'{fassung}'" not in text:
            befunde.append(
                f'browser/marken.js traegt nicht die Fassung {fassung} -- `npm run marken`'
            )

    shell_paket = wurzel / 'apps' / 'dashboard-frontend' / 'package.json'
    if not shell_paket.is_file():
        # Ohne sie gibt es keine Versionsangabe, und ein Paket ohne
        # Abhaengigkeiten waere eines, das nur hier baut.
        return {}, [f'{shell_paket} gibt es nicht -- daher kommen die Versionen']
    deps, fehlt = abhaengigkeiten(quelle, shell_paket)
    for name in fehlt:
        befunde.append(
            f'die Bibliothek braucht `{name}`, und die package.json der Shell '
            'kennt es nicht -- ohne eine Version kann ein fremdes Projekt es nicht holen'
        )

    dateien = {}
    for rel in paket_dateien(quelle):
        pfad = ordner / rel
        if not pfad.is_file():
            befunde.append(f'{rel} fehlt')
            continue
        dateien[rel] = hash_von(pfad)

    inhalt = {
        'fassung': fassung,
        'quelle': 'packages/marken/src',
        'gebaut': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'produktfassung': produktfassung or None,
        'commit': commit or None,
        'abhaengigkeiten': deps,
        'gleichlauf': {name: '*' for name in GLEICHLAUF},
        'dateien': dateien,
    }
    return inhalt, befunde


def schreibe_json(ziel: Path, inhalt: dict) -> None:
    ziel.parent.mkdir(parents=True, exist_ok=True)
    ziel.write_text(json.dumps(inhalt, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def lege_paket(wurzel: Path, ausgabe: Path, inhalt: dict) -> None:
    """Das Paket als eigener Ordner.

    Geraeumt wird zuerst, aus demselben Grund wie im Kit (`writeLibrary`): ein
    Paket wird ERSETZT und nicht fortgeschrieben, sonst bleibt eine Datei, die
    aus der Quelle verschwunden ist, liegen und wird beim naechsten Bau noch
    uebersetzt.
    """
    ordner = wurzel / 'packages' / 'marken'
    if ausgabe.exists():
        shutil.rmtree(ausgabe)
    for rel in inhalt['dateien']:
        ziel = ausgabe / rel
        ziel.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ordner / rel, ziel)
    shutil.copyfile(ordner / 'EINBAU.md', ausgabe / 'README.md')
    schreibe_json(ausgabe / 'marken.json', inhalt)


def pruefen(baum: Path) -> list[str]:
    """Traegt dieser Baum das Paket? Jede genannte Datei an ihrem Hash."""
    stempeldatei = baum / 'packages' / 'marken' / 'marken.json'
    if not stempeldatei.is_file():
        return [f'{stempeldatei} gibt es nicht -- der Baum traegt keinen Stempel']
    try:
        inhalt = json.loads(stempeldatei.read_text(encoding='utf-8'))
    except json.JSONDecodeError as fehler:
        return [f'{stempeldatei} ist kein gueltiges JSON: {fehler}']

    befunde = []
    if not inhalt.get('fassung'):
        befunde.append('der Stempel nennt keine Fassung')
    if not inhalt.get('abhaengigkeiten'):
        befunde.append('der Stempel nennt keine Abhaengigkeiten')
    ordner = stempeldatei.parent
    for rel, erwartet in (inhalt.get('dateien') or {}).items():
        pfad = ordner / rel
        if not pfad.is_file():
            befunde.append(f'{rel} steht im Stempel und liegt nicht im Baum')
        elif hash_von(pfad) != erwartet:
            befunde.append(f'{rel} passt nicht zu ihrem Hash im Stempel')
    return befunde


def main() -> int:
    p = argparse.ArgumentParser(description='Das Designsystem als Paket (Phase H6)')
    p.add_argument('--wurzel', default='.', help='Wurzelverzeichnis dieses Repos')
    p.add_argument('--ausgabe', help='wohin das Paket gelegt wird')
    p.add_argument('--stempel', help='wohin die marken.json geschrieben wird')
    p.add_argument('--pruefen', help='ein ausgepackter Baum: traegt er das Paket?')
    p.add_argument('--produktfassung', default='', help='die Fassung der Auslieferung')
    p.add_argument('--commit', default='', help='der Stand, aus dem gebaut wurde')
    args = p.parse_args()

    print('')
    print('===  Marken-Paket (Phase H6)  ===')

    if args.pruefen:
        befunde = pruefen(Path(args.pruefen).resolve())
        for b in befunde:
            print(f'  FAIL  {b}')
        if befunde:
            print('\n  RESULT: FAILED')
            return 1
        print(f'  PASS  {Path(args.pruefen)} traegt das Paket, jede Datei an ihrem Hash')
        print('\n  RESULT: PASSED')
        return 0

    if not args.ausgabe and not args.stempel:
        p.error('einer von --ausgabe, --stempel oder --pruefen')

    wurzel = Path(args.wurzel).resolve()
    inhalt, befunde = stempel(wurzel, args.produktfassung, args.commit)
    for b in befunde:
        print(f'  FAIL  {b}')
    if befunde:
        print('\n  RESULT: FAILED')
        return 1

    if args.stempel:
        schreibe_json(Path(args.stempel).resolve(), inhalt)
        print(f'  gestempelt  {args.stempel}')
    if args.ausgabe:
        lege_paket(wurzel, Path(args.ausgabe).resolve(), inhalt)
        print(f'  gelegt      {args.ausgabe}')

    print(
        f'  Fassung {inhalt["fassung"]}, {len(inhalt["dateien"])} Dateien, '
        f'{len(inhalt["abhaengigkeiten"])} Abhaengigkeiten'
    )
    print('\n  RESULT: PASSED')
    return 0


if __name__ == '__main__':
    sys.exit(main())
