#!/usr/bin/env python3
"""Was der Werksreset loescht, traegt die Uebernahme mit (29.08.2026).

Ein Geraet hat sein PROGRAMM und seinen ZUSTAND im selben Verzeichnis. Zwei
Stellen im Repo muessen deshalb wissen, was davon der Zustand ist, und sie
sehen ihn von entgegengesetzten Seiten:

  * `scripts/setup/factory-reset.sh` LOESCHT ihn, um aus einem benutzten
    Geraet ein leeres zu machen.
  * `scripts/lib/installation.sh` (`ARASUL_ZUSTAND`) TRAEGT ihn mit, wenn ein
    neues Artefakt die Installation uebernimmt.

Faellt ein Pfad aus der zweiten Liste, laesst ein Update ihn im alten
Verzeichnis liegen -- und weil der Projektname fest ist, uebernimmt das neue
Verzeichnis trotzdem die Volumes. Das Ergebnis ist die halbe Migration vom
28.08.2026: Datenbank da, Geraete-CA weg, `data/apps` weg, Sicherungen weg.

Genau so eine Luecke gab es schon einmal in der ANDEREN Liste: bis zum
27.08.2026 fehlte `config/traefik/certs/` im Werksreset, und ein
zurueckgesetztes Geraet behielt den privaten Schluessel der CA des vorigen
Kunden. Eine Liste, zwei Leser, ein Begriff von "Zustand" -- oder eben eine
Falle, die beim naechsten Mal auf der anderen Seite zuschlaegt.

Die Richtung, die zaehlt: vom Werksreset zur Uebernahme. Ein Pfad, den die
Uebernahme zusaetzlich traegt, ist harmlos (er zieht mit um und faellt
niemandem auf); ein Pfad, den nur der Reset kennt, ist Datenverlust beim
Update.
"""

import argparse
import re
import sys
from pathlib import Path

# Der Abschnitt, in dem der Reset die Kundendaten loescht. Nur dort gesucht:
# weiter oben sichert er die Modell-Volumes in ein `mktemp`-Verzeichnis und
# raeumt das mit `rm -rf "$BACKUP_DIR"` wieder weg -- das ist sein eigener
# Arbeitsplatz und kein Zustand des Geraets.
MARKE = 'Loesche Kundendaten und Konfiguration'
RM = re.compile(r'^\s*rm\s+-[rf]{1,2}\s+(.+)$')


def reset_loescht(wurzel: Path) -> set[str]:
    text = (wurzel / 'scripts' / 'setup' / 'factory-reset.sh').read_text(encoding='utf-8')
    if MARKE not in text:
        raise SystemExit(
            f'In factory-reset.sh steht "{MARKE}" nicht mehr. '
            'Hat der Reset seinen Abschnitt umbenannt? Dann gehoert diese '
            'Pruefung nachgezogen, nicht der Marker entfernt.'
        )
    pfade = set()
    for zeile in text.split(MARKE, 1)[1].splitlines():
        nackt = zeile.strip()
        if nackt.startswith('#'):
            continue
        # Der Abschnitt endet beim naechsten Ueberschriftsblock.
        if nackt.startswith('# ------'):
            break
        treffer = RM.match(zeile)
        if not treffer:
            continue
        for wort in treffer.group(1).split():
            if wort.startswith('"') or wort.startswith('$'):
                continue
            pfade.add(wort.rstrip('/'))
    return pfade


def uebernahme_traegt(wurzel: Path) -> set[str]:
    text = (wurzel / 'scripts' / 'lib' / 'installation.sh').read_text(encoding='utf-8')
    block = re.search(r'ARASUL_ZUSTAND=\((.*?)\n\)', text, re.S)
    if not block:
        raise SystemExit('In scripts/lib/installation.sh fehlt ARASUL_ZUSTAND=( ... ).')
    return {
        zeile.strip().strip("'\"").rstrip('/')
        for zeile in block.group(1).splitlines()
        if zeile.strip() and not zeile.strip().startswith('#')
    }


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--wurzel', default='.')
    args = p.parse_args()
    wurzel = Path(args.wurzel).resolve()

    geloescht = reset_loescht(wurzel)
    getragen = uebernahme_traegt(wurzel)

    if not geloescht:
        print('Der Werksreset loescht laut factory-reset.sh nichts. Das kann nicht sein.')
        return 1

    fehlend = sorted(p for p in geloescht if p not in getragen)
    if fehlend:
        print('Diese Pfade loescht der Werksreset als Zustand des Geraets, aber')
        print('die Uebernahme in scripts/lib/installation.sh traegt sie nicht mit.')
        print('Ein Update wuerde sie im alten Verzeichnis liegen lassen, waehrend')
        print('die Datenbank ueber den festen Projektnamen mitkommt:')
        for pfad in fehlend:
            print(f'  {pfad}')
        print('Bitte in ARASUL_ZUSTAND ergaenzen.')
        return 1

    print(f'   Zustand: {len(geloescht)} Pfade, alle in der Uebernahme')
    return 0


if __name__ == '__main__':
    sys.exit(main())
