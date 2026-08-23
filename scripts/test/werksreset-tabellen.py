#!/usr/bin/env python3
"""Jede neue Tabelle ist im Werksreset eingeordnet (23.08.2026).

`services/werksreset/tabellen.js` sagt, was ein Werksreset anfasst. Fehlt dort
eine Tabelle, verweigert der Reset zur Laufzeit den Dienst — richtig so, aber
gemerkt hat es niemand, weil dafuer der Pruefstand hochgefahren werden muss.

Am 23.08.2026 lagen drei Tabellen aus den Tagen davor nicht in der Liste
(`externe_modell_anbieter`, `extension_tabellen`, `extension_zeitplaene`).
Der Werksreset war damit auf jedem Geraet blockiert, und die Abnahme meldete
zwoelf offene Punkte.

Dieser Waechter zieht die Pruefung in die CI: er liest die `CREATE TABLE` aus
den Migrationen und vergleicht sie mit der Liste.

Verglichen wird der NACKTE Tabellenname, ohne Schema. Ab Migration 090 landet
ein unqualifiziertes `CREATE TABLE` in `arasul`, davor in `public`; das im
Waechter nachzubauen waere eine zweite Wahrheit, die irgendwann von der
echten abweicht. Zwei gleichnamige Tabellen in beiden Schemata wuerden hier
durchrutschen. Das ist der bewusste Preis.
"""

import argparse
import re
import sys
from pathlib import Path

MIGRATIONEN = 'services/postgres/init'
LISTE = 'apps/dashboard-backend/src/services/werksreset/tabellen.js'

# `CREATE TABLE IF NOT EXISTS public.foo (` und alle Varianten davon.
CREATE = re.compile(
    r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?'
    r'(?:(?P<schema>[a-z_][a-z0-9_]*)\.)?(?P<name>[a-z_][a-z0-9_]*)',
    re.IGNORECASE,
)
DROP = re.compile(
    r'DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?'
    r'(?:[a-z_][a-z0-9_]*\.)?(?P<name>[a-z_][a-z0-9_]*)',
    re.IGNORECASE,
)
UMBENANNT = re.compile(
    r'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:[a-z_][a-z0-9_]*\.)?(?P<alt>[a-z_][a-z0-9_]*)'
    r'\s+RENAME\s+TO\s+(?:[a-z_][a-z0-9_]*\.)?(?P<neu>[a-z_][a-z0-9_]*)',
    re.IGNORECASE,
)
EINTRAG = re.compile(r"\['(?:public|arasul)\.([a-z0-9_]+)'")

# Tabellen, die es in der Datenbank nicht (mehr) gibt oder die nur temporaer
# angelegt werden. Eine Zeile hier braucht einen Grund.
AUSNAHMEN = {
    # Wird in derselben Migration wieder verworfen.
}


def aus_migrationen(wurzel: Path) -> dict[str, str]:
    """Tabellenname -> Datei, in der sie zuletzt angelegt wurde.

    Die Migrationen werden IN IHRER REIHENFOLGE gelesen, und `DROP TABLE` und
    `ALTER TABLE ... RENAME TO` zaehlen mit. Ohne das meldete der Waechter 24
    Tabellen, die es laengst nicht mehr gibt (die ganze Telegram-Anbindung,
    `skill_runs` vor der Umbenennung in `flow_runs`), und waere damit sofort
    unbrauchbar gewesen.
    """
    gefunden: dict[str, str] = {}
    for datei in sorted((wurzel / MIGRATIONEN).glob('*.sql')):
        text = datei.read_text(encoding='utf-8', errors='replace')
        # Zeilenkommentare weg, sonst zaehlt ein Beispiel im Kommentar mit.
        text = re.sub(r'--[^\n]*', '', text)
        for treffer in CREATE.finditer(text):
            name = treffer.group('name').lower()
            if treffer.group('schema') and treffer.group('schema').lower() == 'pg_temp':
                continue
            gefunden.setdefault(name, datei.name)
        for treffer in UMBENANNT.finditer(text):
            alt_name = treffer.group('alt').lower()
            neu_name = treffer.group('neu').lower()
            if alt_name in gefunden:
                gefunden[neu_name] = gefunden.pop(alt_name)
            else:
                gefunden.setdefault(neu_name, datei.name)
        for treffer in DROP.finditer(text):
            gefunden.pop(treffer.group('name').lower(), None)
    return gefunden


def aus_liste(wurzel: Path) -> set[str]:
    text = (wurzel / LISTE).read_text(encoding='utf-8')
    return {m.group(1) for m in EINTRAG.finditer(text)}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--wurzel', default='.')
    args = p.parse_args()
    wurzel = Path(args.wurzel).resolve()

    migrationen = aus_migrationen(wurzel)
    eingeordnet = aus_liste(wurzel)
    if not migrationen:
        print(f'Keine CREATE TABLE in {MIGRATIONEN} gefunden. Hat sich der Pfad geaendert?')
        return 1
    if not eingeordnet:
        print(f'Keine Eintraege in {LISTE} gefunden. Hat sich das Format geaendert?')
        return 1

    fehlend = sorted(
        name for name in migrationen
        if name not in eingeordnet and name not in AUSNAHMEN
    )
    if fehlend:
        print('Diese Tabellen legt eine Migration an, aber der Werksreset kennt sie nicht.')
        print('Er verweigert dann auf JEDEM Geraet den Dienst, weil er nicht behaupten')
        print('will, vollstaendig aufgeraeumt zu haben.')
        print('')
        for name in fehlend:
            print(f'  {name}  (aus {migrationen[name]})')
        print('')
        print(f'Bitte je eine Zeile in {LISTE} ergaenzen:')
        print('  INHALTE      Nutzerinhalte, weg bei Stufe 1 und 2')
        print('  AUSLIEFERUNG nur bei Stufe 2 (Auslieferungszustand)')
        print('  MODELLE      nur, wenn die Modelle mitgeloescht werden')
        print('  BLEIBT       nie leeren, mit Begruendung')
        return 1

    print(f'   Werksreset: {len(migrationen)} Tabellen aus Migrationen, alle eingeordnet')
    return 0


if __name__ == '__main__':
    sys.exit(main())
