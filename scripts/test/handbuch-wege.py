#!/usr/bin/env python3
"""Jeder Weg im Admin-Handbuch muss zu einem Ort der Oberfläche führen (M5).

Der Anlass, 05.10.2026: Die Oberfläche war längst umgebaut, das Handbuch
schickte den Administrator aber noch nach „Einstellungen → System → Dienste“,
„Einstellungen → Daten → Sicherung“ und „Einstellungen → Firmenordner“. Diese
Orte gibt es nicht mehr: Einstellungen sind nur persönlich, alles, was das
Gerät betrifft, steht in der Verwaltung. Wer dem Handbuch folgte, suchte.

Was geprüft wird
----------------
Jede Wegangabe der Form `Verwaltung → Bereich → Abschnitt` oder
`Einstellungen → Abschnitt` in `docs/ops/ADMIN_HANDBUCH.md`:

* Der Bereich nach „Verwaltung“ muss einer der Bereiche in `ansichten.mjs`
  sein (Personen, Apps, Läufe, Firmenordner, Modelle, System, Daten, Gerät).
* Der Abschnitt nach „Einstellungen“ muss einer der vier persönlichen sein
  (Profil, Passwort, Angemeldete Rechner, Erscheinungsbild).
* Ein dritter Schritt unter Gerät, Daten oder System muss ein Abschnitt sein,
  den es dort gibt (Tabelle ABSCHNITTE).
* Der Trenner ist immer der Pfeil. Ein `>` als Trenner ist ein alter Weg.
* Jeder der Bereiche kommt im Handbuch vor.

Was NICHT geprüft wird: Wege in Codeblöcken (dort stehen Befehle) und alles
unterhalb des Bereichs bei Personen, Apps, Läufe, Firmenordner und Modelle,
weil dort Seiten und Dialoge stehen, keine festen Abschnitte.

Aufruf
------
    python3 scripts/test/handbuch-wege.py [--wurzel <wurzel>]

Rückgabe 1, wenn ein Weg ins Leere führt.
"""
import argparse
import re
import sys
from pathlib import Path

HANDBUCH = 'docs/ops/ADMIN_HANDBUCH.md'
ANSICHTEN = 'scripts/test/ansichten.mjs'

EINSTELLUNGEN = ('Profil', 'Passwort', 'Angemeldete Rechner', 'Erscheinungsbild')

# Abschnitte, die der Pfeil unter einem Bereich nennen darf. Fehlt ein Bereich
# hier, ist der dritte Schritt dort nicht geprüft.
ABSCHNITTE = {
    'Gerät': ('Unternehmen', 'Aktualisierung', 'Lizenz', 'Fernzugriff', 'Über Arasul'),
    'Daten': ('Sicherung', 'Auskunft und Export', 'Person löschen', 'Werksreset',
              'Löschen und Zurücksetzen'),
    'System': ('Dienste', 'Selbstheilung'),
}

WEG = re.compile(r'\b(Verwaltung|Einstellungen)(\s*[→>]\s*[^→>*,.;:]+)+')
SCHRITT = re.compile(r'\s*[→>]\s*')


def bereiche(wurzel: Path) -> list[str]:
    quelle = (wurzel / ANSICHTEN).read_text(encoding='utf-8')
    namen = re.findall(r"'Verwaltung · ([^']+)'", quelle)
    if not namen:
        sys.exit(f'{ANSICHTEN}: keine Verwaltungsansichten gefunden')
    return namen


def beginnt_mit(text: str, name: str) -> bool:
    """`text` ist `name`, auch wenn Prosa dahinter weiterläuft („Fernzugriff steht“)."""
    return text.startswith(name) and not text[len(name):len(name) + 1].isalpha()


def absaetze(text: str) -> list[tuple[int, str]]:
    """Die Absätze außerhalb von Codeblöcken, je auf einer Zeile (ein Weg darf umbrechen)."""
    absaetze, block, start, im_code = [], [], 0, False

    def abschliessen():
        if block:
            absaetze.append((start, ' '.join(block)))
            block.clear()

    for nr, zeile in enumerate(text.split('\n'), 1):
        if zeile.lstrip().startswith('```'):
            abschliessen()
            im_code = not im_code
        elif im_code or not zeile.strip():
            abschliessen()
        else:
            if not block:
                start = nr
            block.append(zeile.strip())
    abschliessen()
    return absaetze


def pruefe(wurzel: Path) -> list[str]:
    namen = bereiche(wurzel)
    text = (wurzel / HANDBUCH).read_text(encoding='utf-8')
    fehler = []
    for nr, zeile in absaetze(text):
        for treffer in WEG.finditer(zeile):
            weg = treffer.group(0)
            if '>' in weg:
                fehler.append(f'{HANDBUCH}:{nr}: „{weg.strip()}“ trennt mit „>“, der Trenner ist „→“')
            teile = [t for t in SCHRITT.split(weg)[1:] if t]
            teile = [t.strip(' „“"') for t in teile]
            if not teile:
                continue
            if treffer.group(1) == 'Einstellungen':
                if not any(beginnt_mit(teile[0], a) for a in EINSTELLUNGEN):
                    fehler.append(f'{HANDBUCH}:{nr}: „Einstellungen → {teile[0]}“ gibt es nicht; '
                                  f'die Einstellungen kennen {", ".join(EINSTELLUNGEN)}')
                continue
            bereich = next((n for n in namen if beginnt_mit(teile[0], n)), None)
            if bereich is None:
                fehler.append(f'{HANDBUCH}:{nr}: „Verwaltung → {teile[0]}“ ist kein Bereich; '
                              f'es gibt {", ".join(namen)}')
            elif bereich in ABSCHNITTE and len(teile) > 1 and not any(
                    beginnt_mit(teile[1], a) for a in ABSCHNITTE[bereich]):
                fehler.append(f'{HANDBUCH}:{nr}: „{bereich} → {teile[1]}“ gibt es nicht; '
                              f'{bereich} kennt {", ".join(ABSCHNITTE[bereich])}')
    for n in namen:
        if not re.search(rf'\*\*{re.escape(n)}\*\*|Verwaltung\s*→\s*{re.escape(n)}', text):
            fehler.append(f'{HANDBUCH}: der Bereich „{n}“ der Verwaltung kommt nicht vor')
    return fehler


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--wurzel', default='.')
    fehler = pruefe(Path(ap.parse_args().wurzel))
    for f in fehler:
        print(f)
    if fehler:
        print(f'\n{len(fehler)} Weg(e) im Handbuch führen ins Leere.')
        return 1
    print('Handbuch-Wege: jeder Weg führt zu einem Ort der Oberfläche.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
