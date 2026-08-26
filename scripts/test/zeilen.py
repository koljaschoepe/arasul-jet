#!/usr/bin/env python3
"""Zeilenzaehler: die Messregel der Rueckbau-Phasen B2 bis B6.

Warum es dieses Skript gibt
---------------------------
Die Loeschliste aus Phase B1 (docs/plans/audits/2026-08-26-loeschliste-b1.md)
nennt fuer jeden Bereich eine Zeilenzahl. Die Phasen danach werden an "Zeilen
vorher und nachher" gemessen. Zwei Messungen sind nur vergleichbar, wenn beide
mit derselben Regel zaehlen; deshalb steht die Regel hier als Code und nicht
als Satz in einer Liste.

Die Regel (Wortlaut der Loeschliste)
------------------------------------
Gezaehlt wird mit `wc -l` je Datei. Frontend `.ts .tsx .css`, Backend
`.js .md .json` (die Schriftdateien unter `flows/rechnung/fonts/` zaehlen
nicht), Dienste und Skripte jede Textdatei, `package-lock.json` und
`node_modules` nie.

Was der Selbsttest belegt
-------------------------
`--selbsttest` baut einen Wegwerfbaum mit bekannten Zeilenzahlen und prueft,
dass jede Regel greift: Endungsfilter, Schriftdateien, `package-lock.json`,
`node_modules`, Binaerdateien, die Abgrenzung von Routen, Diensten und Rest im
Backend. Dazu prueft er die Zahlen aus der Loeschliste gegen das, was die Regel
auf dem Stand `94989235` ergab. Diese Zahlen stehen unten fest, sie sind das
Protokoll der ersten Messung, nicht ein Wert, der mitwandert.

Aufruf
------
    python3 scripts/test/zeilen.py [--wurzel <pfad>] [--bereich <name>] [--json]
    python3 scripts/test/zeilen.py --selbsttest

Rueckgabe 0 bei Erfolg, 1 wenn der Selbsttest etwas findet.
"""
import argparse
import json
import os
import pathlib
import sys
import tempfile

FRONTEND_ENDUNGEN = ('.ts', '.tsx', '.css')
BACKEND_ENDUNGEN = ('.js', '.md', '.json')
NIE = {'package-lock.json'}
NIE_ORDNER = {'node_modules'}


def ist_text(pfad: pathlib.Path) -> bool:
    """Textdatei wie `grep -I`: kein Nullbyte in den ersten 8 KB."""
    try:
        with pfad.open('rb') as f:
            return b'\0' not in f.read(8192)
    except OSError:
        return False


def zeilen(pfad: pathlib.Path) -> int:
    """`wc -l`: Anzahl der Zeilenumbrueche."""
    with pfad.open('rb') as f:
        return f.read().count(b'\n')


def dateien(ordner: pathlib.Path):
    for wurzel, unterordner, namen in os.walk(ordner):
        unterordner[:] = sorted(u for u in unterordner if u not in NIE_ORDNER)
        for name in sorted(namen):
            if name in NIE:
                continue
            yield pathlib.Path(wurzel) / name


def zaehle(ordner: pathlib.Path, endungen=None, ausser=(), nur_text=False) -> int:
    """Zeilen aller Dateien unter `ordner`, gefiltert nach Endung und Ausnahmen.

    `ausser` sind Pfadteile relativ zu `ordner`; eine Datei, deren relativer
    Pfad mit einem davon beginnt, zaehlt nicht.
    """
    if not ordner.is_dir():
        return 0
    summe = 0
    for datei in dateien(ordner):
        rel = datei.relative_to(ordner).as_posix()
        if any(rel == a or rel.startswith(a.rstrip('/') + '/') for a in ausser):
            continue
        if endungen is not None and datei.suffix not in endungen:
            continue
        if nur_text and not ist_text(datei):
            continue
        summe += zeilen(datei)
    return summe


# Die Bereiche der Loeschliste, in ihrer Reihenfolge.
def messung(wurzel: pathlib.Path) -> dict:
    backend = wurzel / 'apps/dashboard-backend'
    return {
        'frontend': zaehle(wurzel / 'apps/dashboard-frontend/src', FRONTEND_ENDUNGEN),
        'backend-routen': zaehle(backend / 'src/routes', BACKEND_ENDUNGEN),
        'backend-services': zaehle(
            backend / 'src/services', BACKEND_ENDUNGEN, ausser=('flows/rechnung/fonts',)
        ),
        'backend-rest': zaehle(backend / 'src', BACKEND_ENDUNGEN, ausser=('routes', 'services')),
        'backend-tests': zaehle(backend / '__tests__', BACKEND_ENDUNGEN),
        'dienste': zaehle(wurzel / 'services', nur_text=True)
        + zaehle(wurzel / 'config', nur_text=True),
        'skripte': zaehle(wurzel / 'scripts', nur_text=True),
    }


# Protokoll der ersten Messung: Stand 94989235 (main, 26.08.2026), gezaehlt mit
# dieser Regel. Die Loeschliste nennt fuer das Frontend 67 790; die Regel ergibt
# 67 924, weil die Liste die drei Wurzeldateien `index.tsx`, `setupTests.ts` und
# `vite-env.d.ts` (134 Zeilen) nicht aufgefuehrt hat. Fuer Dienste und Skripte
# hat die Liste nur benannte Pfade summiert (29 191 und 9 352), nicht den ganzen
# Ordner; die Regel zaehlt den Ordner. Beides ist hier festgehalten, damit
# niemand die Differenz fuer eine Regression haelt.
ERSTE_MESSUNG = {
    'frontend': 67_924,
    'backend-routen': 17_437,
    'backend-services': 41_718,
    'backend-rest': 8_133,
    'backend-tests': 42_586,
}
LOESCHLISTE_FRONTEND = 67_790
LOESCHLISTE_FRONTEND_NICHT_GELISTET = 134


def selbsttest() -> int:
    fehler = []

    def pruefe(was, ist, soll):
        if ist == soll:
            print(f'   ok    {was}')
        else:
            print(f'   FEHLT {was} (erwartet {soll}, bekommen {ist})')
            fehler.append(was)

    with tempfile.TemporaryDirectory(prefix='arasul-zeilen.') as tmp:
        w = pathlib.Path(tmp)

        def schreibe(rel, inhalt):
            p = w / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(inhalt, bytes):
                p.write_bytes(inhalt)
            else:
                p.write_text(inhalt)

        # Frontend: nur .ts .tsx .css; eine .json und ein Bild zaehlen nicht.
        schreibe('apps/dashboard-frontend/src/App.tsx', 'a\nb\nc\n')
        schreibe('apps/dashboard-frontend/src/index.css', 'x\n')
        schreibe('apps/dashboard-frontend/src/hooks/useApi.ts', '1\n2\n')
        schreibe('apps/dashboard-frontend/src/daten.json', '{}\n')
        schreibe('apps/dashboard-frontend/src/bild.svg', '<svg/>\n')
        schreibe('apps/dashboard-frontend/src/node_modules/x/index.ts', 'nein\n' * 50)
        # Backend: Routen, Dienste (mit Schriftdateien), Rest, Tests.
        schreibe('apps/dashboard-backend/src/routes/a.js', 'r\n' * 4)
        schreibe('apps/dashboard-backend/src/routes/README.md', 'm\n')
        schreibe('apps/dashboard-backend/src/services/s.js', 's\n' * 6)
        schreibe('apps/dashboard-backend/src/services/flows/rechnung/fonts/f.js', 'f\n' * 100)
        schreibe('apps/dashboard-backend/src/index.js', 'i\n' * 2)
        schreibe('apps/dashboard-backend/src/schemas/x.json', '{\n}\n')
        schreibe('apps/dashboard-backend/src/package-lock.json', '{\n' * 30)
        schreibe('apps/dashboard-backend/__tests__/t.js', 't\n' * 5)
        # Dienste und Skripte: jede Textdatei, keine Binaerdatei.
        schreibe('services/x/Dockerfile', 'FROM a\nRUN b\n')
        schreibe('services/x/bin.dat', b'\0\0\n\n\n')
        schreibe('config/traefik/t.yml', 'y\n' * 3)
        schreibe('scripts/test/z.sh', '#!\n' * 7)
        schreibe('scripts/util/package-lock.json', '{\n' * 9)

        m = messung(w)
        pruefe('Frontend zaehlt nur .ts .tsx .css, nie node_modules', m['frontend'], 6)
        pruefe('Backend-Routen zaehlen .js und .md', m['backend-routen'], 5)
        pruefe('Backend-Dienste lassen die Schriftdateien aus', m['backend-services'], 6)
        pruefe('Backend-Rest ohne Routen, Dienste, package-lock', m['backend-rest'], 4)
        pruefe('Backend-Tests liegen neben src', m['backend-tests'], 5)
        pruefe('Dienste und config: jede Textdatei, keine Binaerdatei', m['dienste'], 5)
        pruefe('Skripte: jede Textdatei, nie package-lock', m['skripte'], 7)

        # Bereich, den es nicht gibt, ist null und kein Absturz.
        pruefe('fehlender Ordner zaehlt null', zaehle(w / 'gibt-es-nicht'), 0)

    pruefe(
        'die Frontend-Zahl der Loeschliste ist die Regel minus die drei ungelisteten Dateien',
        LOESCHLISTE_FRONTEND + LOESCHLISTE_FRONTEND_NICHT_GELISTET,
        ERSTE_MESSUNG['frontend'],
    )
    return 1 if fehler else 0


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--wurzel', default=pathlib.Path(__file__).resolve().parents[2])
    p.add_argument('--bereich', choices=sorted(messung(pathlib.Path('/nirgends')).keys()))
    p.add_argument('--json', action='store_true')
    p.add_argument('--selbsttest', action='store_true')
    args = p.parse_args()

    if args.selbsttest:
        print('\n-> Selbsttest des Zeilenzaehlers...')
        return selbsttest()

    m = messung(pathlib.Path(args.wurzel))
    if args.bereich:
        print(m[args.bereich])
        return 0
    if args.json:
        print(json.dumps(m, indent=2))
        return 0
    breite = max(len(k) for k in m)
    for k, v in m.items():
        print(f'{k:<{breite}}  {v:>8,}'.replace(',', ' '))
    print(f'{"gesamt":<{breite}}  {sum(m.values()):>8,}'.replace(',', ' '))
    return 0


if __name__ == '__main__':
    sys.exit(main())
