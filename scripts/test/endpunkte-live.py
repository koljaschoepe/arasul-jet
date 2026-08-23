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
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import quote

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

# Woher eine echte Id kommt, mit der ein Pfad mit `:x` aufgerufen werden kann.
# Praefix -> (Listen-Endpunkt, Schluessel der Liste, Schluessel der Id).
#
# Die Liste wird EINMAL geholt und die erste Id verwendet. Sie ist damit so
# aussagekraeftig wie das Geraet gefuellt ist: findet sich nichts, steht der
# Pfad am Ende unter "nicht gemessen" — und zwar sichtbar, nicht als stilles
# Gruen. Am 23.08.2026 gelernt: eine Pruefung, die von zufaellig vorhandenen
# Daten abhaengt, misst den Zufall.
ID_QUELLEN = [
    ('/api/apps/', '/api/apps', 'apps', 'id'),
    ('/api/chats/', '/api/chats', 'chats', 'id'),
    ('/api/documents/', '/api/documents', 'documents', 'id'),
    ('/api/knowledge-graph/document/', '/api/documents', 'documents', 'id'),
    ('/api/extensions/', '/api/extensions', 'data', 'id'),
    ('/api/flows/beispiele/', '/api/flows', 'data', 'name'),
    ('/api/flows/', '/api/flows', 'data', 'name'),
    ('/api/projects/', '/api/projects', 'data', 'id'),
    ('/api/git/', '/api/projects', 'data', 'id'),
    ('/api/spaces/', '/api/spaces', 'spaces', 'id'),
    ('/api/sandbox/projects/', '/api/sandbox/projects', 'projects', 'id'),
    ('/api/llm/jobs/', '/api/llm/jobs', 'jobs', 'id'),
    ('/api/services/llm/models/', '/api/services/llm/models', 'models', 'name'),
    # Am 23.08.2026 dazugekommen: diese drei standen vorher unter "nicht
    # gemessen, keine Quelle hinterlegt". Sie HATTEN eine, es hatte nur niemand
    # nachgesehen. Ein ungemessener Endpunkt ist keine Ruhe, sondern eine
    # offene Frage.
    ('/api/models/', '/api/models/catalog', 'models', 'id'),
    ('/api/knowledge-graph/related/', '/api/knowledge-graph/entities', 'entities', 'name'),
]

# Pfade mit `:x`, die hier nicht gemessen werden, jeweils mit Grund.
NICHT_MESSBAR = {
    '/api/llm/jobs/:x/stream': 'endloser Strom',
    '/api/flows/laeufe/:x/stream': 'endloser Strom',
    '/api/license/check/:x': 'braucht einen Merkmalsnamen, keine Id aus einer Liste',
}


def alle_gets():
    """Die Liste kommt aus dem Code, nicht aus einer Datei."""
    import importlib.util

    spec = importlib.util.spec_from_file_location('e', WURZEL / 'scripts/test/endpunkte.py')
    modul = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modul)
    alle = modul.aus_code(WURZEL)
    return sorted(e[4:] for e in alle if e.startswith('GET ') and '*' not in e)


def endpunkte():
    return [e for e in alle_gets() if ':x' not in e and e not in STROEME]


def mit_parametern():
    return [e for e in alle_gets() if ':x' in e and e not in NICHT_MESSBAR]


def erste_id(pfad: str, kekse: Path, zwischenspeicher: dict):
    """Eine echte Id fuer einen Pfad mit `:x`, oder None mit Grund."""
    for praefix, liste, schluessel, feld in ID_QUELLEN:
        if not pfad.startswith(praefix):
            continue
        if liste not in zwischenspeicher:
            code, rumpf = hole(liste, kekse, kurz=False)
            werte = []
            if code == '200':
                try:
                    daten = json.loads(rumpf)
                    eintraege = daten.get(schluessel) or []
                    werte = [str(e[feld]) for e in eintraege if isinstance(e, dict) and e.get(feld)]
                except Exception:
                    werte = []
            zwischenspeicher[liste] = werte
        werte = zwischenspeicher[liste]
        if werte:
            return werte[0], None
        return None, f'{liste} liefert nichts, woraus eine Id zu nehmen waere'
    return None, 'keine Quelle fuer eine Id hinterlegt'


# Falsche Eingaben, die eine ANTWORT ergeben muessen und keinen Absturz.
#
# Warum das eine eigene Liste ist: die 500er, die dieser Sweep am 23.08.2026
# gefunden hat, waren alle GET ohne Eingabe. Die andere Haelfte derselben
# Krankheit sitzt bei den Eingaben — `throw new Error` fuer eine erwartbare
# Lage wird vom Fehlerbehandler zu HTTP 500 mit "Internal server error", und
# die eigentliche Meldung wird verworfen. Genau so verhielt sich
# `POST /api/alerts/test-webhook` mit einer internen Adresse.
#
# Jeder Fall hier ist bewusst so gewaehlt, dass er NICHTS veraendert: die
# Eingabe wird geprueft und abgelehnt, bevor irgendetwas geschrieben oder
# irgendwohin gesendet wird. Wer einen Fall ergaenzt, prueft das zuerst.
FALSCHE_EINGABEN = [
    ('POST', '/api/alerts/test-webhook', {'webhook_url': 'http://127.0.0.1/x'},
     'interne Adresse, wird vor jeder Anfrage abgelehnt'),
    ('POST', '/api/alerts/test-webhook', {'webhook_url': 'ftp://example.invalid/x'},
     'kein HTTP, wird vor jeder Anfrage abgelehnt'),
    ('POST', '/api/services/llm/models/pull', {'model_name': ''},
     'leerer Modellname, Rumpfpruefung lehnt ab'),
    ('POST', '/api/workflows/execution', {'workflow_name': ''},
     'leerer Workflowname, Rumpfpruefung lehnt ab'),
    ('POST', '/api/apps/gibt-es-nicht/config', {'config': {}},
     'App gibt es nicht, faellt vor dem Schreiben durch'),
    ('GET', '/api/projects/keine-uuid/dateien', None,
     'kaputte Id in der Adresse'),
    ('GET', '/api/logs/search', None,
     'Pflichtangabe query fehlt'),
]


def csrf_aus(kekse: Path) -> str:
    """Das CSRF-Merkmal steht im Keksglas, nicht in der Antwort."""
    try:
        for zeile in kekse.read_text(encoding='utf-8').splitlines():
            teile = zeile.split('\t')
            if len(teile) >= 7 and teile[5] == 'arasul_csrf':
                return teile[6]
    except Exception:
        pass
    return ''


def sende(verb: str, pfad: str, rumpf, kekse: Path):
    befehl = ['curl', '-sk', '-b', str(kekse), '-m', '25', '-w', '\n%{http_code}',
              '-X', verb, f'{URL}{pfad}']
    if rumpf is not None:
        befehl += ['-H', 'Content-Type: application/json',
                   '-H', f'X-CSRF-Token: {csrf_aus(kekse)}',
                   '-d', json.dumps(rumpf)]
    ergebnis = subprocess.run(befehl, capture_output=True, text=True, errors='replace')
    teile = ergebnis.stdout.rsplit('\n', 1)
    return teile[-1].strip(), (teile[0] if len(teile) > 1 else '')[:200]


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


def hole(pfad: str, kekse: Path, kurz: bool = True):
    # Ohne `errors='replace'` stirbt die ganze Messung an der ersten Antwort,
    # die kein UTF-8 ist — ein Download, ein Archiv, ein Bild. Der Antwortcode
    # interessiert hier, nicht der Rumpf.
    ergebnis = subprocess.run(
        ['curl', '-sk', '-b', str(kekse), '-m', '25', '-w', '\n%{http_code}', f'{URL}{pfad}'],
        capture_output=True, text=True, errors='replace',
    )
    teile = ergebnis.stdout.rsplit('\n', 1)
    code = teile[-1].strip()
    rumpf = teile[0] if len(teile) > 1 else ''
    return code, (rumpf[:200] if kurz else rumpf)


def main() -> int:
    import tempfile

    with tempfile.TemporaryDirectory() as ordner:
        kekse = Path(ordner) / 'kekse.txt'
        if not anmelden(kekse):
            print(f'ROT   Anmeldung an {URL} fehlgeschlagen')
            return 1

        rot, gedrosselt, ungemessen = [], [], []
        gruen = 0
        listen = {}

        def messen(pfad: str, anzeige: str):
            nonlocal gruen
            code, rumpf = hole(pfad, kekse)
            # Die eigene Ratenbremse ist kein Befund. Einmal warten, einmal neu.
            if code == '429':
                time.sleep(3)
                code, rumpf = hole(pfad, kekse)
                if code == '429':
                    gedrosselt.append(anzeige)
                    return
            if code == '503' and anzeige in ERWARTET_503:
                gruen += 1
                return
            if code and code[0] == '5':
                rot.append((anzeige, code, rumpf))
                print(f'ROT   {code}  {anzeige}')
            elif code == '000':
                rot.append((anzeige, 'keine Antwort', ''))
                print(f'ROT   ---  {anzeige}  (keine Antwort im Zeitlimit)')
            else:
                gruen += 1

        ohne = endpunkte()
        mit = mit_parametern()
        print(f'{len(ohne)} parameterlose und {len(mit)} parametrisierte '
              f'GET-Endpunkte gegen {URL}\n')

        for pfad in ohne:
            messen(pfad, pfad)

        for muster in mit:
            # Mehrere `:x` in einem Pfad: die erste Id ist die des Objekts,
            # jede weitere gehoert zu einer Unterliste, die es hier nicht gibt.
            if muster.count(':x') > 1:
                ungemessen.append((muster, 'zwei Ids noetig, nur die erste ist zu holen'))
                continue
            wert, grund = erste_id(muster, kekse, listen)
            if wert is None:
                ungemessen.append((muster, grund))
                continue
            messen(muster.replace(':x', quote(str(wert), safe='')), f'{muster}  [{wert}]')

        for muster, grund in NICHT_MESSBAR.items():
            ungemessen.append((muster, grund))

        print(f'\n{len(FALSCHE_EINGABEN)} falsche Eingaben, die eine Antwort '
              f'ergeben muessen\n')
        for verb, pfad, rumpf, warum in FALSCHE_EINGABEN:
            code, text = sende(verb, pfad, rumpf, kekse)
            anzeige = f'{verb} {pfad}'
            if code == '429':
                time.sleep(3)
                code, text = sende(verb, pfad, rumpf, kekse)
            if code and code[0] == '4':
                gruen += 1
            else:
                rot.append((f'{anzeige}  ({warum})', code or '---', text))
                print(f'ROT   {code}  {anzeige}  — erwartet 4xx')

        print(f'\n{gruen} beantwortet, {len(rot)} mit Serverfehler, '
              f'{len(gedrosselt)} gedrosselt, {len(ungemessen)} nicht gemessen')
        for pfad in gedrosselt:
            print(f'  gedrosselt: {pfad}')
        for muster, grund in sorted(ungemessen):
            print(f'  nicht gemessen: {muster}  ({grund})')
        if rot:
            print('\nWas geantwortet hat:')
            for pfad, code, rumpf in rot:
                print(f'  {code}  {pfad}\n        {rumpf}')
            return 1
        return 0


if __name__ == '__main__':
    raise SystemExit(main())
