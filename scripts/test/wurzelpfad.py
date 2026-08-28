#!/usr/bin/env python3
"""Skripte, die ihr eigenes Wurzelverzeichnis falsch ausrechnen.

Der Anlass, 28.08.2026: der Bootstrap brach auf einem frisch aufgesetzten Orin
ab, noch bevor irgendetwas startete. Die Stelle war eine einzige Zeile in
`scripts/validate/validate-dependencies.sh`:

    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

Das Skript liegt zwei Ebenen unter der Wurzel (`scripts/validate/`), geht aber
nur eine hoch. `PROJECT_ROOT` zeigte damit auf `scripts/`, gesucht wurde
`scripts/docker-compose.yml`, und die gibt es nicht. Auf einem Arbeitsgeraet
faellt das nie auf: dort ruft niemand den Validator von Hand. Auf JEDEM
frischen Geraet steht er im Weg.

Es war nicht die erste. Dieselbe Rechnung stand am 27.08.2026 schon in
`scripts/setup/preconfigure.sh` falsch -- dort landete eine komplette `.env` in
`scripts/.env`, wo das laufende System sie nie sah. Zwei Vorfaelle mit
demselben Muster in zwei Tagen sind kein Zufall, sondern eine fehlende
Pruefung.

Was hier geprueft wird
----------------------
Fuer jedes Shell-Skript des Repos: wenn es eine Variable mit einem der Namen
`PROJECT_ROOT`, `REPO_ROOT`, `ROOT_DIR` oder `WURZEL` aus seinem eigenen Ort
ableitet, muss die Zahl der Ebenen, die es hochgeht, zur Tiefe der Datei
passen. Ein Skript in `scripts/validate/` geht zwei Ebenen hoch, eines in
`scripts/` eine, eines im Wurzelverzeichnis keine.

Gezaehlt werden beide Schreibweisen, denn beide kommen im Repo vor:

    PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"     zwei `dirname`
    WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"   zwei `..`

Bei `${BASH_SOURCE[0]}` liefert das INNERSTE `dirname` das Verzeichnis der
Datei selbst und zaehlt deshalb nicht mit; bei `$SCRIPT_DIR` zaehlt jedes.

Was er NICHT kann
-----------------
Alles innerhalb eines Here-Dokuments zaehlt nicht: das ist Text, kein Code.
In `waechter-selbsttest.sh` stehen dort mit Absicht falsche Beispiele.

Er liest Text, keinen Syntaxbaum. Ein Skript, das seine Wurzel aus einer
Umgebungsvariablen oder ueber `git rev-parse` holt, kennt er nicht und laesst
er in Ruhe -- solche Zeilen enthalten weder `SCRIPT_DIR` noch `BASH_SOURCE`
und fallen aus dem Muster. Ein Rueckfall der Form
`"${ARASUL_REPO_DIR:-$(cd "${SCRIPT_DIR}/../.." && pwd)}"` wird dagegen
gemessen, denn der Rueckfall ist der Normalfall.

Rueckgabe: 0 wenn jede Rechnung stimmt, 1 sonst.
"""
import argparse
import re
import sys
from pathlib import Path

NAMEN = ('PROJECT_ROOT', 'REPO_ROOT', 'ROOT_DIR', 'WURZEL')
ZUWEISUNG = re.compile(r'^\s*(?:local\s+|export\s+)?(' + '|'.join(NAMEN) + r')=(.*)$')
SELBSTBEZUG = re.compile(r'SCRIPT_DIR|BASH_SOURCE')
# Ein Here-Dokument beginnt: `<<WORT`, `<<'WORT'`, `<<-"WORT"`. Das `(?!<)`
# haelt den Hier-String `<<<"…"` heraus. Was zwischen Anfang und Ende steht,
# ist Text und kein Code -- in `waechter-selbsttest.sh` stehen dort mit Absicht
# falsche Beispiele, und die zu melden hiesse, die Werkbank der Waechter fuer
# kaputt zu erklaeren.
HEREDOC = re.compile(r'<<(?!<)-?\s*[\'"]?([A-Za-z_][A-Za-z0-9_]*)[\'"]?')


def ebenen(ausdruck: str) -> int:
    """Wie viele Ebenen geht dieser Ausdruck vom Ort der Datei aus hoch?"""
    stufen = ausdruck.count('..')
    dirnames = ausdruck.count('dirname')
    if 'BASH_SOURCE' in ausdruck:
        # Das innerste `dirname` macht aus dem Dateinamen ihr Verzeichnis.
        dirnames = max(0, dirnames - 1)
    return stufen + dirnames


def dateien(wurzel: Path) -> list[Path]:
    # `is_file()` und nicht nur der Name: am Orin liegt unter `data/` ein
    # ORDNER namens `healthcheck.sh` -- Docker legt eine fehlende Bind-Quelle
    # als Verzeichnis an, und der Name der Quelle war eine Datei. Ohne diese
    # Zeile endet der Waechter mit einem IsADirectoryError, und die Abnahme des
    # Bootstraps ist rot, weil der PRUEFER stolpert und nicht das Gepruefte.
    gefunden = [
        d for d in wurzel.glob('**/*.sh')
        if d.is_file() and 'node_modules' not in d.parts and '.git' not in d.parts
    ]
    if (wurzel / 'arasul').is_file():
        gefunden.append(wurzel / 'arasul')
    return sorted(gefunden)


def stellen(datei: Path, wurzel: Path) -> list[tuple[int, str, int, int]]:
    tiefe = len(datei.relative_to(wurzel).parts) - 1
    befunde = []
    ende_des_hier_dokuments = None
    for nummer, zeile in enumerate(
        datei.read_text(encoding='utf-8', errors='replace').splitlines(), 1
    ):
        if ende_des_hier_dokuments is not None:
            if zeile.strip() == ende_des_hier_dokuments:
                ende_des_hier_dokuments = None
            continue
        beginn = HEREDOC.search(zeile)
        if beginn:
            ende_des_hier_dokuments = beginn.group(1)
            continue
        if zeile.strip().startswith('#'):
            continue
        treffer = ZUWEISUNG.match(zeile)
        if not treffer:
            continue
        ausdruck = treffer.group(2)
        if not SELBSTBEZUG.search(ausdruck):
            continue
        gerechnet = ebenen(ausdruck)
        if gerechnet != tiefe:
            befunde.append((nummer, zeile.strip()[:110], gerechnet, tiefe))
    return befunde


def main() -> int:
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument('--wurzel', default='.', help='Wurzel des Repos')
    args = zerleger.parse_args()
    wurzel = Path(args.wurzel)

    befunde = []
    for datei in dateien(wurzel):
        for nummer, zeile, gerechnet, tiefe in stellen(datei, wurzel):
            befunde.append((datei.relative_to(wurzel), nummer, zeile, gerechnet, tiefe))

    if not befunde:
        print('   Wurzelpfad: jede Rechnung passt zur Tiefe der Datei')
        return 0

    print(f'   Wurzelpfad: {len(befunde)} Skript(e) rechnen ihr Wurzelverzeichnis falsch aus:')
    for datei, nummer, zeile, gerechnet, tiefe in befunde:
        print(f'     {datei}:{nummer}')
        print(f'       {zeile}')
        print(f'       geht {gerechnet} Ebene(n) hoch, die Datei liegt {tiefe} Ebene(n) tief')
    print('   Eine Ebene zu wenig heisst: das Skript sucht seine Dateien in')
    print('   scripts/ statt im Wurzelverzeichnis und findet keine davon.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
