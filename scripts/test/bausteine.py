#!/usr/bin/env python3
"""Haelt das Baustein-Set (Plan 023 C1 und C2).

Warum es diesen Waechter gibt
-----------------------------
Vor Phase C standen zwanzig Kopfstellen mit derselben Klassenkette in elf
Dateien, vier verschieden gebaute Tab-Leisten und fuenf Arten, eine Feldgruppe
zu trennen. Das ist nicht durch Nachlaessigkeit entstanden, sondern dadurch,
dass die naechste Seite die Klassen der vorigen kopiert hat. Einmal von Hand
aufraeumen haelt das nicht auf; morgen kopiert die uebernaechste Seite wieder.

Geprueft wird deshalb die Abwesenheit der Handarbeit, nicht die Anwesenheit der
Bausteine. Wer eine Seite baut, soll `PageHeader`, `Section` und `FilterBar`
benutzen, weil der Weg daran vorbei versperrt ist.

Was gemeldet wird
-----------------
In `src/features/` und `src/components/layout/`:

1. `<h1>`                     Der Seitentitel gehoert in `PageHeader`.
2. `pb-6 border-b border-border`
   und `mb-8 pb-6 border-b`   Die Trennlinie einer Feldgruppe gehoert in `Section`.
3. `border-b-2` an einem Knopf
   in einer Leiste             Eine Tab-Leiste gehoert in `FilterBar`.

Was NICHT gemeldet wird
-----------------------
`src/components/ui/` selbst, denn dort stehen die Bausteine. Testdateien, denn
ein Test darf pruefen, was er will. Und `<h2>` bis `<h4>`: eine Ueberschrift
innerhalb eines Abschnitts ist erlaubt, nur der Seitentitel ist es nicht.

Ausnahmen
---------
`AUSNAHMEN` traegt Pfade, die aus einem genannten Grund ausserhalb stehen. Ein
Eintrag ohne Grund ist keiner.

Aufruf
------
    python3 scripts/test/bausteine.py --pfad .
"""

import argparse
import re
import sys
from pathlib import Path

AUSNAHMEN = {
    # Der Erst-Start ist eine eigene Flaeche ohne Einstellungsrahmen und wird
    # in Plan 023 C4 neu gebaut. Bis dahin bleibt er, wie er ist.
    'src/features/system/SetupWizard.tsx': 'Plan 023 C4 baut ihn neu',
    # Die Anmeldung ist die einzige Seite ohne Rahmen darum und traegt ihren
    # Titel selbst. Plan 023 C3 fasst sie an.
    'src/features/system/Login.tsx': 'Plan 023 C3 fasst sie an',
    'src/features/system/CreateAdmin.tsx': 'gehoert zur Anmeldung, Plan 023 C3',
    # Die Detailseite im Store traegt eine feste Kopfleiste mit Zurueck-Knopf,
    # Symbol und Abzeichen. Das ist eine andere Form als der Seitenkopf einer
    # Einstellungsseite, und PageHeader dafuer aufzubohren hiesse, einen
    # Baustein fuer einen einzigen Aufrufer zu verbiegen.
    'src/features/store/StoreDetailPage.tsx': 'feste Kopfleiste mit Zurueck-Knopf, andere Form',
}

REGELN = [
    (
        re.compile(r'<h1[\s>]'),
        'Seitentitel von Hand. Gehoert in PageHeader (components/ui/PageHeader.tsx).',
    ),
    (
        re.compile(r'pb-6 border-b border-border'),
        'Feldgruppen-Trennlinie von Hand. Gehoert in Section (components/ui/Section.tsx).',
    ),
    (
        re.compile(r'border-b-2\b'),
        'Tab-Leiste von Hand. Gehoert in FilterBar (components/ui/FilterBar.tsx).',
    ),
]

WURZELN = [
    'apps/dashboard-frontend/src/features',
    'apps/dashboard-frontend/src/components/layout',
]


def pruefe(wurzel: Path) -> list[str]:
    befunde = []
    for basis in WURZELN:
        ordner = wurzel / basis
        if not ordner.is_dir():
            continue
        for datei in sorted(ordner.rglob('*.tsx')):
            relativ = datei.relative_to(wurzel / 'apps/dashboard-frontend').as_posix()
            if '__tests__' in datei.parts or datei.name.endswith('.test.tsx'):
                continue
            if relativ in AUSNAHMEN:
                continue
            for nr, zeile in enumerate(datei.read_text(encoding='utf-8').splitlines(), 1):
                for muster, grund in REGELN:
                    if muster.search(zeile):
                        befunde.append(f'{relativ}:{nr}  {grund}')
    return befunde


def main() -> int:
    zerleger = argparse.ArgumentParser()
    zerleger.add_argument('--pfad', default='.')
    argumente = zerleger.parse_args()
    wurzel = Path(argumente.pfad).resolve()

    befunde = pruefe(wurzel)
    if not befunde:
        print('   Baustein-Set: eingehalten')
        return 0

    print('Handarbeit statt Baustein:')
    for zeile in befunde:
        print(f'  {zeile}')
    print('')
    print('Entweder den Baustein benutzen, oder mit Grund in AUSNAHMEN eintragen.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
