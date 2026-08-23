#!/usr/bin/env python3
"""Ruft jeden parameterlosen GET-Endpunkt auf einem laufenden Geraet auf.

Warum das ueberhaupt eine eigene Pruefung ist. Am 23.08.2026 habe ich beim
Dokumentieren der Schnittstelle (Plan 023 K1) zwoelf Endpunkte von Hand
abgefragt und dabei DREI gefunden, die auf jedem Geraet mit HTTP 500
antworteten:

  GET /api/self-healing/metrics     Spalte `resolved_at` gibt es nicht
  GET /api/audit/logs               Spalten `username` und `request_method` auch nicht
  GET /api/llm/queue/metrics        `AVG(...)::INTEGER FILTER (...)` ist ein Syntaxfehler

Alle drei waren von Unit-Tests gedeckt, weil die Tests die Datenbank
nachbilden und die erfundenen Spalten brav mitliefern. Kein Test, der ohne
echte Datenbank laeuft, kann diese Klasse finden. Diese Pruefung kann es, und
sie braucht dafuer nur eines: ein laufendes Geraet.

Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
  python3 scripts/test/endpunkte-live.py

Rot ist jeder Antwortcode ab 500, ausser er steht mit Begruendung in
`ERWARTET_503`. Ein 4xx ist gruen: eine fehlende Pflichtangabe oder eine
verweigerte Berechtigung ist eine Antwort, kein Absturz.
"""

import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

WURZEL = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / 'scripts' / 'test'))

URL = os.environ.get('ARASUL_URL', 'https://localhost:8443')
BENUTZER = os.environ.get('ARASUL_BENUTZER', 'admin')
PASSWORT = os.environ.get('ARASUL_PASSWORT', '2309')

# Ein Strom endet nicht von selbst. Ihn hier aufzurufen hiesse, auf das
# Zeitlimit zu warten und es als Befund zu zaehlen.
STROEME = {
    '/api/logs/stream',
}

# Dienste, die seit Plan 021 Schritt 8 nicht mehr von selbst laufen
# (Compose-Profil `classic-rag`). Ihr 503 ist die richtige Antwort, kein Fehler.
ERWARTET_503 = {
    '/api/rag/status': 'qdrant und embedding-service laufen nicht von selbst',
    '/api/services/embedding/info': 'embedding-service laeuft nicht von selbst',
}


def endpunkte():
    """Die Liste kommt aus dem Code, nicht aus einer Datei."""
    import importlib.util

    spec = importlib.util.spec_from_file_location('e', WURZEL / 'scripts/test/endpunkte.py')
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    alle = modul.aus_code(WURZEL)
    return sorted(
        e[4:]
        for e in alle
        if e.startswith('GET ') and ':x' not in e and '*' not in e and e[4:] not in STROEME
    )


def anmelden(kekse: Path) -> bool:
    ergebnis = subprocess.run(
        [
            'curl', '-sk', '-c', str(kekse), '-m', '20',
            '-X', 'POST', f'{URL}/api/auth/login',
            '-H', 'Content-Type: application/json',
            '-d', json.dumps({'username': BENUTZER, 'password': PASSWORT}),
            '-o', '/dev/null', '-w', '%{http_code}',
        ],
        capture_output=True, text=True,
    )
    return ergebnis.stdout.strip() == '200'


def hole(pfad: str, kekse: Path):
    ergebnis = subprocess.run(
        ['curl', '-sk', '-b', str(kekse), '-m', '25', '-w', '\n%{http_code}', f'{URL}{pfad}'],
        capture_output=True, text=True,
    )
    teile = ergebnis.stdout.rsplit('\n', 1)
    code = teile[-1].strip()
    rumpf = teile[0] if len(teile) > 1 else ''
    return code, rumpf[:200]


def main() -> int:
    import tempfile

    with tempfile.TemporaryDirectory() as ordner:
        kekse = Path(ordner) / 'kekse.txt'
        if not anmelden(kekse):
            print(f'ROT   Anmeldung an {URL} fehlgeschlagen')
            return 1

        liste = endpunkte()
        print(f'{len(liste)} parameterlose GET-Endpunkte gegen {URL}\n')

        rot, gedrosselt, gruen = [], [], 0
        for pfad in liste:
            code, rumpf = hole(pfad, kekse)
            # Die eigene Ratenbremse ist kein Befund. Einmal warten, einmal neu.
            if code == '429':
                time.sleep(3)
                code, rumpf = hole(pfad, kekse)
                if code == '429':
                    gedrosselt.append(pfad)
                    continue
            if code == '503' and pfad in ERWARTET_503:
                gruen += 1
                continue
            if code and code[0] == '5':
                rot.append((pfad, code, rumpf))
                print(f'ROT   {code}  {pfad}')
            elif code == '000':
                rot.append((pfad, 'keine Antwort', ''))
                print(f'ROT   ---  {pfad}  (keine Antwort im Zeitlimit)')
            else:
                gruen += 1

        print(f'\n{gruen} beantwortet, {len(rot)} mit Serverfehler, {len(gedrosselt)} gedrosselt')
        for pfad in gedrosselt:
            print(f'  gedrosselt (nicht gemessen): {pfad}')
        if rot:
            print('\nWas geantwortet hat:')
            for pfad, code, rumpf in rot:
                print(f'  {code}  {pfad}\n        {rumpf}')
            return 1
        return 0


if __name__ == '__main__':
    raise SystemExit(main())
