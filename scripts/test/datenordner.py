#!/usr/bin/env python3
"""Jede Bind-Quelle unter data/ wird vorher angelegt (23.08.2026).

Legt Docker eine fehlende Bind-Quelle selbst an, gehoert sie root. Die
Container laufen als uid 1000 und koennen dann nicht hinein schreiben. Das ist
kein hypothetischer Fall: es ist bei `data/skills` passiert (der Kommentar im
`arasul`-Skript steht seitdem dort), und am 23.08.2026 erneut bei
`data/extensions-data` — jede Erweiterung bekam beim ersten Schreibversuch
`EACCES: permission denied, mkdir /arasul/extensions-data/<id>`, und die
Faehigkeit "eigene Dateiablage" war auf jedem Geraet tot.

Der Vergleich laeuft in die Richtung, die zaehlt: von den Bind-Quellen in
compose/ zur Anlege-Liste in `arasul`. Ein Ordner, den compose mountet und
niemand anlegt, ist der Fehler. Umgekehrt ist eine Zeile zu viel harmlos.
"""

import argparse
import re
import sys
from pathlib import Path

BIND = re.compile(r'\$\{DATA_PATH:-\.\./data\}/([A-Za-z0-9_./-]+)\s*:')
# `${BACKUP_PATH:-${DATA_PATH:-../data}/backups}` — die verschachtelte Form.
BIND_VERSCHACHTELT = re.compile(r'\$\{[A-Z_]+:-\$\{DATA_PATH:-\.\./data\}/([A-Za-z0-9_./-]+)\}')


def quellen(wurzel: Path) -> set[str]:
    gefunden = set()
    for datei in sorted((wurzel / 'compose').glob('*.yaml')):
        text = datei.read_text(encoding='utf-8')
        for zeile in text.splitlines():
            nackt = zeile.strip()
            if nackt.startswith('#'):
                continue
            for muster in (BIND, BIND_VERSCHACHTELT):
                for treffer in muster.finditer(nackt):
                    gefunden.add(treffer.group(1))
    return gefunden


def angelegt(wurzel: Path) -> set[str]:
    """Die `mkdir -p data/...`-Zeilen aus dem `arasul`-Skript, Klammern aufgeloest."""
    text = (wurzel / 'arasul').read_text(encoding='utf-8')
    ordner = set()
    for treffer in re.finditer(r'mkdir -p ["\']?data/([A-Za-z0-9_./{},-]+)', text):
        teil = treffer.group(1)
        klammer = re.match(r'^\{([^}]*)\}$', teil)
        if klammer:
            ordner.update(n.strip() for n in klammer.group(1).split(','))
        else:
            ordner.add(teil)
    return ordner


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--wurzel', default='.')
    args = p.parse_args()
    wurzel = Path(args.wurzel).resolve()

    gemountet = quellen(wurzel)
    vorhanden = angelegt(wurzel)
    if not gemountet:
        print('Keine Bind-Quelle unter data/ gefunden. Hat sich compose/ geaendert?')
        return 1

    fehlend = sorted(o for o in gemountet if o not in vorhanden)
    if fehlend:
        print('Diese Ordner mountet compose/, aber das `arasul`-Skript legt sie')
        print('nicht an. Docker legt sie dann als root an, und der Container')
        print('kann nicht hinein schreiben (EACCES).')
        for o in fehlend:
            print(f'  data/{o}')
        print('Bitte je eine `mkdir -p data/<name>`-Zeile in `arasul` ergaenzen.')
        return 1

    print(f'   Datenordner: {len(gemountet)} gemountet, alle vorher angelegt')
    return 0


if __name__ == '__main__':
    sys.exit(main())
