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

Was er NICHT sehen kann
-----------------------
Der Waechter liest Zeile fuer Zeile und kennt keinen Syntaxbaum. Ein ueber zwei
Zeilen umgebrochenes `<h1\n  className=...>` und eine Klasse, die erst zur
Laufzeit aus `cn()` oder einer Zeichenkettenschablone entsteht, rutschen durch.
Das ist bewusst in Kauf genommen: der Fehler, den er abfangen soll, ist das
Kopieren einer fertigen Klassenkette von der vorigen Seite, und die kommt am
Stueck. Wer sich auf ihn verlaesst, soll aber wissen, wo seine Grenze liegt.

Umgekehrt gilt dasselbe: `border-b-2` heisst hier "Tab-Leiste", weil das heute
die einzige Verwendung ist. Wer die Klasse eines Tages fuer eine dicke Linie
benutzt, die keine Leiste ist, wird trotzdem gemeldet. Einen Ausweg fuer eine
einzelne Zeile gibt es nicht, nur den Eintrag der ganzen Datei in AUSNAHMEN.
Das ist die richtige Reibung: eine zweite Bedeutung fuer dieselbe Klasse ist
selbst schon ein Befund.

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
    # Der Einrichtungsassistent ist eine eigene Flaeche ohne Einstellungsrahmen
    # und traegt seinen Titel selbst. Die Begruendung stand hier bis zum
    # 20.08.2026 falsch ("Plan 023 C4 baut ihn neu"): C4 meint den
    # OnboardingWizard im Arbeitsbereich, nicht diese Datei. Sie ist bisher
    # ungeprueft und hat eine eigene Aufgabe verdient, siehe Plan 023 C4,
    # Abschnitt "Was dabei sichtbar wurde".
    'src/features/system/SetupWizard.tsx': 'eigene Flaeche, bisher ungeprueft, eigene Aufgabe offen',
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
