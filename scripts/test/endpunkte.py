#!/usr/bin/env python3
"""Traegt jeder Endpunkt eine Beschreibung? (Plan 023 K1)

Die Abnahme lautet: „Eine Pruefung im Testlauf meldet neue Endpunkte ohne
Beschreibung." Genau das tut dieses Skript.

Es vergleicht zwei Seiten:

  Code   `router.<verb>('<pfad>'` in apps/dashboard-backend/src/routes/**,
         zusammengesetzt mit dem Praefix aus routes/index.js.
  Doku   die Tabellenzeilen in docs/api/API_REFERENCE.md.

Verglichen wird die FORM, nicht der Text: `/api/projects/:id/dateien` und
`/api/projects/:projectId/dateien` sind derselbe Endpunkt. Jeder Parameter wird
deshalb auf `:x` normalisiert.

Neue Endpunkte fallen auf, alte nicht: `ERLAUBTE_LUECKE` traegt den Bestand vom
22.08.2026. Wer einen davon dokumentiert, nimmt ihn aus der Liste — und das
Skript merkt es, wenn er drinbleibt. Sonst verwahrlost die Liste, und der
Waechter meldet Ruhe ueber Endpunkte, die es laengst gibt.
"""

import argparse
import re
import sys
from pathlib import Path

BACKEND_REL = 'apps/dashboard-backend/src/routes'
INDEX_REL = 'apps/dashboard-backend/src/routes/index.js'
DOKU_REL = 'docs/api/API_REFERENCE.md'

VERBEN = ('get', 'post', 'put', 'patch', 'delete')

#: Dateien, deren Routen NICHT dokumentiert sein muessen.
#:
#: `external/` ist die Aussenschnittstelle mit eigenem Schluessel und eigener
#: Doku; `index.js` haelt nur die Montage.
AUSGENOMMEN = ('index.js',)


def normalisiere(pfad: str) -> str:
    """Parameter auf `:x`, Fragezeichen-Teil weg, Kleinschreibung.

    Der Fragezeichen-Teil MUSS weg: die Doku schreibt
    `/api/projects/:id/dateien/inhalt?pfad=...`, der Code kennt nur den Pfad.
    Ohne diesen Schnitt meldete der Waechter dutzende dokumentierte Endpunkte
    als Luecke, und ein Waechter, der falsch meldet, ist schlechter als keiner.
    """
    p = pfad.strip().split("?", 1)[0].split("#", 1)[0]
    p = re.sub(r":[A-Za-z_][A-Za-z0-9_]*", ":x", p)
    p = re.sub(r"\{[^}]+\}", ":x", p)
    p = p.rstrip("/")
    return p.lower() or "/"


def praefixe(wurzel: Path) -> dict:
    """Datei -> Montagepfad, aus routes/index.js gelesen."""
    quelle = (wurzel / INDEX_REL).read_text(encoding='utf-8')
    gefunden = {}
    for m in re.finditer(r"router\.use\(\s*'([^']+)'\s*,(.*?)\)\s*;", quelle, re.S):
        pfad, rest = m.group(1), m.group(2)
        datei = re.search(r"require\('\./([^']+)'\)", rest)
        if datei:
            gefunden[datei.group(1)] = pfad
    return gefunden


def aus_code(wurzel: Path) -> set:
    """Alle Endpunkte, wie der Code sie montiert."""
    montage = praefixe(wurzel)
    endpunkte = set()
    for datei in sorted((wurzel / BACKEND_REL).rglob('*.js')):
        rel = datei.relative_to(wurzel / BACKEND_REL).as_posix()
        if rel in AUSGENOMMEN:
            continue
        schluessel = rel[:-3] if rel.endswith('.js') else rel
        praefix = montage.get(schluessel)
        if praefix is None:
            # Eine Datei, die index.js nicht montiert, ist entweder tot oder
            # wird von einem anderen Router eingehaengt. Beides ist kein Grund
            # fuer eine Doku-Pflicht.
            continue
        quelle = datei.read_text(encoding='utf-8')
        for m in re.finditer(
            rf"router\.({'|'.join(VERBEN)})\(\s*['\"]([^'\"]*)['\"]", quelle
        ):
            verb, pfad = m.group(1).upper(), m.group(2)
            voll = f"/api{praefix}{pfad}"
            endpunkte.add(f"{verb} {normalisiere(voll)}")
    return endpunkte


def aus_doku(wurzel: Path) -> set:
    """Alle Endpunkte, die in der Doku als Tabellenzeile stehen."""
    text = (wurzel / DOKU_REL).read_text(encoding='utf-8')
    gefunden = set()
    for m in re.finditer(
        r"^\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`]+)`", text, re.M
    ):
        gefunden.add(f"{m.group(1)} {normalisiere(m.group(2))}")
    # Auch Ueberschriften der Form "### POST /api/foo" zaehlen.
    for m in re.finditer(r"^#{2,4}\s+(GET|POST|PUT|PATCH|DELETE)\s+(/\S+)", text, re.M):
        gefunden.add(f"{m.group(1)} {normalisiere(m.group(2))}")
    return gefunden


LUECKE_DATEI = 'scripts/test/endpunkte-luecke.txt'


def erlaubte_luecke(wurzel: Path) -> set:
    """Die Schuldenliste, aus ihrer Datei gelesen.

    Als Datei und nicht als Konstante im Skript: so laesst sich der Waechter
    gegen einen Wegwerf-Baum pruefen (er hat die Datei dann nicht, die Liste ist
    leer), und die Schuld steht diffbar da statt in einem Python-Literal.
    """
    datei = wurzel / LUECKE_DATEI
    if not datei.exists():
        return set()
    return {
        z.strip()
        for z in datei.read_text(encoding='utf-8').splitlines()
        if z.strip() and not z.lstrip().startswith('#')
    }


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--wurzel', default=str(Path(__file__).resolve().parents[2]))
    p.add_argument('--bestand', action='store_true',
                   help='die aktuelle Luecke ausgeben, zum Eintragen')
    args = p.parse_args()
    wurzel = Path(args.wurzel)

    code = aus_code(wurzel)
    doku = aus_doku(wurzel)
    luecke = code - doku

    if args.bestand:
        for e in sorted(luecke):
            print(e)
        return 0

    bekannt = erlaubte_luecke(wurzel)
    neu = sorted(luecke - bekannt)
    verschwunden = sorted(bekannt - luecke)

    if neu:
        print(f'Endpunkte ohne Beschreibung: {len(neu)} neue\n')
        for e in neu:
            print(f'  {e}')
        print(
            f'\nInsgesamt {len(code)} Endpunkte im Code, {len(luecke)} ohne Zeile '
            f'in {DOKU_REL}.\nBitte eine Zeile ergaenzen, oder — wenn der '
            f'Endpunkt bewusst undokumentiert bleibt — in {LUECKE_DATEI} '
            'aufnehmen.'
        )
        return 1

    if verschwunden:
        print(
            f'Endpunkte: {len(verschwunden)} Eintraege in {LUECKE_DATEI} sind '
            'inzwischen dokumentiert oder weg.\nBitte aus der Liste nehmen, '
            'sonst verwahrlost sie:\n'
        )
        for e in verschwunden:
            print(f'  {e}')
        return 1

    print(
        f'   Endpunkte: {len(code)} im Code, {len(luecke)} bekannte Luecken, '
        'keine neue'
    )
    return 0


if __name__ == '__main__':
    sys.exit(main())
