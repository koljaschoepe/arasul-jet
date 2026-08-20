#!/usr/bin/env python3
"""Haelt das Namensregister (Plan 023 D1).

Warum es diesen Waechter gibt
-----------------------------
Am 20.08.2026 am Geraet gemessen: Katalog, Statusleiste und Auswahlliste sagten
uebereinstimmend "Gemma 4 Kompakt", der Modellknopf im Chat sagte "Gemma". Er
kuerzte auf das erste Wort, `models.find(...)?.name?.split(/[\\s:]/)[0]`. Dieselbe
Datei hatte drei Zeilen tiefer den vollen Namen. Das ist der Normalfall: nicht
Nachlaessigkeit, sondern eine zweite Stelle, die dasselbe noch einmal ableitet.

Dazu kam der Rueckfall auf die rohe Kennung. `modelName || modelId` im
Download- und im Aktivierungs-Kontext schrieb `hf.co/unsloth/Qwen3.8-27B-GGUF:
IQ4_XS` in ein Fortschrittsband, sobald der Aufrufer keinen Namen mitgab.

Einmal aufraeumen haelt das nicht auf. Die naechste Modellflaeche schreibt
wieder `{model.name}`, weil das kuerzer aussieht.

Was gemeldet wird
-----------------
In Dateien, die mit Modellen umgehen (siehe MODELL_DATEI), jede Zeile, die

1. `.name` an einem Modell-Bezeichner liest (`model`, `modell`, `m`, ...),
2. oder auf eine Kennung zurueckfaellt (`modelName || modelId`, `?.name ?? id`),

ohne in derselben Zeile `modellAnzeigeName` zu nennen.

Was NICHT gemeldet wird
-----------------------
`utils/modelDisplay.ts` selbst, das ist das Register. Testdateien. Dateien ohne
Modellbezug, dort heisst `m.name` ein Flow, eine Erweiterung oder eine Datei.

Was er NICHT sehen kann
-----------------------
Er liest Zeile fuer Zeile und kennt keinen Syntaxbaum. Ein ueber zwei Zeilen
umgebrochener Zugriff rutscht durch, und ein Modell, das in einer Variablen
namens `eintrag` steckt, ebenfalls. Das ist bewusst in Kauf genommen: der
Fehler, den er abfangen soll, ist die kopierte Zeile, und die kommt am Stueck.

Ausnahmen
---------
`AUSNAHMEN` traegt Pfade mit Grund. Ein Eintrag ohne Grund ist keiner.

Aufruf
------
    python3 scripts/test/modellnamen.py --pfad .
"""

import argparse
import re
import sys
from pathlib import Path

WURZEL_FRONTEND = 'apps/dashboard-frontend/src'

AUSNAHMEN: dict[str, str] = {}

# Eine Datei gilt als Modellflaeche, wenn sie einen Modelltyp benutzt oder mit
# der Modell-Schnittstelle redet. Das haelt `m.name` eines Flows heraus.
MODELL_DATEI = re.compile(
    r'CatalogModel|InstalledModel|LoadedModel|ComposerModel|KatalogModell'
    r"|ModellAnzeige|['\"`]/models"
)

BEZEICHNER = r'(?:model|modell|m|katalogModell|defaultModel|installedModel|primaryModel|eintrag)'

REGELN = [
    (
        re.compile(rf'\b{BEZEICHNER}\??\.name\b'),
        'Modellname direkt gelesen. Gehoert durch modellAnzeigeName (utils/modelDisplay.ts).',
    ),
    (
        re.compile(r'\bmodelName\s*(?:\|\||\?\?)|\.name\s*(?:\|\||\?\?)\s*\w*[Ii]d\b'),
        'Rueckfall auf die rohe Kennung. Gehoert durch modellAnzeigeName.',
    ),
]

FREISPRUCH = re.compile(r'modellAnzeigeName')


def pruefe(wurzel: Path) -> list[str]:
    befunde = []
    ordner = wurzel / WURZEL_FRONTEND
    if not ordner.is_dir():
        return befunde
    for datei in sorted(list(ordner.rglob('*.tsx')) + list(ordner.rglob('*.ts'))):
        if '__tests__' in datei.parts or re.search(r'\.test\.tsx?$', datei.name):
            continue
        relativ = datei.relative_to(wurzel / 'apps/dashboard-frontend').as_posix()
        if relativ == 'src/utils/modelDisplay.ts' or relativ in AUSNAHMEN:
            continue
        inhalt = datei.read_text(encoding='utf-8')
        if not MODELL_DATEI.search(inhalt):
            continue
        for nr, zeile in enumerate(inhalt.splitlines(), 1):
            if FREISPRUCH.search(zeile):
                continue
            for muster, grund in REGELN:
                if muster.search(zeile):
                    befunde.append(f'{relativ}:{nr}  {grund}')
                    break
    return befunde


def main() -> int:
    zerleger = argparse.ArgumentParser()
    zerleger.add_argument('--pfad', default='.')
    argumente = zerleger.parse_args()
    wurzel = Path(argumente.pfad).resolve()

    befunde = pruefe(wurzel)
    if not befunde:
        print('   Namensregister: eingehalten')
        return 0

    print('Modellname an der Quelle vorbei:')
    for zeile in befunde:
        print(f'  {zeile}')
    print('')
    print('Entweder modellAnzeigeName benutzen, oder mit Grund in AUSNAHMEN eintragen.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
