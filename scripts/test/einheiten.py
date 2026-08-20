#!/usr/bin/env python3
"""Haelt die Einheiten zusammen (Plan 023 D4).

Warum es diesen Waechter gibt
-----------------------------
Am 21.08.2026 zeigte EINE Kachel im Store zwei Zahlen fuer dieselbe Datei: in
der Kopfzeile "261 MB", im Text darunter "~274 MB". Der Katalogwert ist
274000000 Bytes, und das sind 274 MB. Die 261 entstanden, weil durch 1024³
geteilt und trotzdem "MB" darueber geschrieben wurde.

Das war kein Einzelfall. Im Produkt standen FUENF Rechnungen fuer Bytegroessen:
`formatModelSize` und `formatFileSize` in utils/formatting.ts (die zweite ohne
jeden Aufrufer), eine eigene in UpdatePage.tsx, eine in SetupWizard.tsx und
eine in ProjectFileTab.tsx. Dazu zwei Kopien von `toGb` fuer den KI-RAM. Jede
davon ist entstanden, weil die Rechnung kuerzer aussah als der Import.

Es gibt jetzt zwei Zaehlweisen, und welche gilt, haengt daran, womit der Kunde
die Zahl vergleicht:

- Tausenderschritte (`formatBytes`) fuer alles, was jemand anderes ausgedruckt
  hat: Modellgroessen, Downloads, Aktualisierungsdateien.
- 1024er-Schritte (`formatBytesBinaer`, `zuGb`) fuer alles, was das
  Betriebssystem sagt: Platte, Arbeitsspeicher, Docker-Grenzwerte.

Zwei sind eine mehr, als der Plan verlangt. Eine waere aber falsch: mit
Tausenderschritten hiesse dieselbe Platte 2,0 TB statt 1,8, und derselbe
Docker-Grenzwert 34,4 GB statt 32.

Was gemeldet wird
-----------------
Jede Zeile ausserhalb der beiden Quellen, die eine Groessenangabe (B, KB, MB,
GB, TB) und im selben Atemzug einen Teiler aus der 1024er- oder
1000er-Familie enthaelt.

Was NICHT gemeldet wird
-----------------------
`utils/formatting.ts` und `utils/modellZustand.ts`, dort stehen die Quellen.
Testdateien, die duerfen pruefen, was sie wollen. Und eine Grenze ohne
Beschriftung (`MAX_FILE_SIZE = 50 * 1024 * 1024`) ist keine Anzeige.

Was er NICHT sehen kann
-----------------------
Eine ueber zwei Zeilen verteilte Rechnung, und eine Einheit, die erst zur
Laufzeit entsteht. Wie bei den anderen Waechtern bewusst in Kauf genommen: der
Fehler, den er abfangen soll, ist die kopierte Zeile.

Aufruf
------
    python3 scripts/test/einheiten.py --pfad .
"""

import argparse
import re
import sys
from pathlib import Path

WURZEL = 'apps/dashboard-frontend/src'

QUELLEN = {
    'src/utils/formatting.ts',
    'src/utils/modellZustand.ts',
}

AUSNAHMEN: dict[str, str] = {}

# Eine Einheit in Anfuehrungszeichen, als eigenes Wort. `GB` in einem
# Bezeichner (RAM_LIMIT_GB) faellt nicht darunter.
EINHEIT = re.compile(r'''['"`][^'"`]*\b(?:B|KB|kB|MB|GB|TB|MiB|GiB)\b''')

TEILER = re.compile(r'\b1024\b|\b1_000\b|\b1_000_000\b|\b1_000_000_000\b|\b1e[369]\b|\b1000\b')


def pruefe(wurzel: Path) -> list[str]:
    befunde = []
    ordner = wurzel / WURZEL
    if not ordner.is_dir():
        return befunde
    for datei in sorted(list(ordner.rglob('*.tsx')) + list(ordner.rglob('*.ts'))):
        if '__tests__' in datei.parts or re.search(r'\.test\.tsx?$', datei.name):
            continue
        relativ = datei.relative_to(wurzel / 'apps/dashboard-frontend').as_posix()
        if relativ in QUELLEN or relativ in AUSNAHMEN:
            continue
        for nr, zeile in enumerate(datei.read_text(encoding='utf-8').splitlines(), 1):
            if EINHEIT.search(zeile) and TEILER.search(zeile):
                befunde.append(
                    f'{relativ}:{nr}  Eigene Groessenrechnung. '
                    'Gehoert in formatBytes / formatBytesBinaer (utils/formatting.ts).'
                )
    return befunde


def main() -> int:
    zerleger = argparse.ArgumentParser()
    zerleger.add_argument('--pfad', default='.')
    argumente = zerleger.parse_args()
    wurzel = Path(argumente.pfad).resolve()

    befunde = pruefe(wurzel)
    if not befunde:
        print('   Einheiten: eine Rechnung je Zaehlweise')
        return 0

    print('Groesse an der Quelle vorbei gerechnet:')
    for zeile in befunde:
        print(f'  {zeile}')
    print('')
    print('Entweder die gemeinsame Funktion benutzen, oder mit Grund in AUSNAHMEN eintragen.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
