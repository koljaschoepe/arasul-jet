#!/usr/bin/env python3
"""Sind zwei Erweiterungs-Pakete dasselbe Paket? (Plan 023 H3)

Die Abnahme lautet: „Dieselbe Anwendung, einmal über ara-kit und einmal im
Terminal gebaut, ergibt dasselbe Paket." Ohne ein Werkzeug, das „dasselbe"
entscheidet, ist das eine Meinung.

**Dasselbe heißt nicht byte-gleich.** Zwei gzip-Archive derselben Dateien
unterscheiden sich schon durch den Zeitstempel im Kopf. Verglichen wird
deshalb, was ein Paket AUSMACHT:

  1. das Manifest, normalisiert (Reihenfolge der Schlüssel egal, Fähigkeiten
     als Menge, Einrückung egal)
  2. die Dateiliste, ohne Ordner
  3. der Inhalt jeder Datei, als SHA-256

Nicht verglichen wird die `version`: sie darf sich unterscheiden, und zwei
Pakete derselben Anwendung in verschiedenen Fassungen sind für diese Frage
dasselbe Paket. Wer auch das prüfen will, nimmt `--streng`.

Aufruf:
    paket-vergleich.py <ordner-oder-archiv-a> <ordner-oder-archiv-b> [--streng]
"""

import argparse
import hashlib
import json
import sys
import tarfile
import tempfile
from pathlib import Path

MANIFEST = 'manifest.json'
#: Felder, die den Vergleich nicht entscheiden. `version` steht hier, weil
#: zwei Fassungen derselben Anwendung dieselbe Anwendung sind.
WEICHE_FELDER = {'version'}

#: Dateien, die kein Mensch gemeint hat. Sie werden NICHT verschwiegen, aber
#: benannt: das Backend entpackt sie mit, also sind sie Teil des Pakets, und
#: wer sie im Vergleich sieht, soll nicht eine Stunde suchen, was `._index.html`
#: bedeutet.
def ist_artefakt(pfad: str) -> bool:
    name = pfad.rsplit('/', 1)[-1]
    return (
        name == '.DS_Store'
        or name.startswith('._')
        or pfad.startswith('__MACOSX/')
        or '/__MACOSX/' in pfad
    )


def entpacke(pfad: Path, ziel: Path) -> Path:
    """Ein Archiv auspacken, einen Ordner unverändert zurückgeben."""
    if pfad.is_dir():
        return pfad
    with tarfile.open(pfad, 'r:*') as t:
        # Wie der Import im Backend: nur einfache relative Einträge.
        sicher = [
            m for m in t.getmembers()
            if (m.isfile() or m.isdir())
            and not m.name.startswith('/')
            and '..' not in Path(m.name).parts
        ]
        t.extractall(ziel, members=sicher)
    return ziel


def lies_manifest(ordner: Path, streng: bool) -> dict:
    datei = ordner / MANIFEST
    if not datei.exists():
        raise SystemExit(f'{ordner}: kein {MANIFEST}')
    roh = json.loads(datei.read_text(encoding='utf-8'))
    if not streng:
        for feld in WEICHE_FELDER:
            roh.pop(feld, None)
    # Fähigkeiten sind eine MENGE: die Reihenfolge im Manifest sagt nichts.
    if isinstance(roh.get('faehigkeiten'), list):
        roh['faehigkeiten'] = sorted(set(roh['faehigkeiten']))
    return roh


def dateien(ordner: Path) -> dict:
    """Pfad -> SHA-256, ohne das Manifest (das wird getrennt verglichen)."""
    ergebnis = {}
    for p in sorted(ordner.rglob('*')):
        if not p.is_file():
            continue
        rel = p.relative_to(ordner).as_posix()
        if rel in (MANIFEST, f'./{MANIFEST}'):
            continue
        rel = rel[2:] if rel.startswith('./') else rel
        ergebnis[rel] = hashlib.sha256(p.read_bytes()).hexdigest()
    return ergebnis


def vergleiche(a: Path, b: Path, streng: bool) -> list[str]:
    unterschiede = []

    ma, mb = lies_manifest(a, streng), lies_manifest(b, streng)
    for schluessel in sorted(set(ma) | set(mb)):
        wa, wb = ma.get(schluessel), mb.get(schluessel)
        if wa != wb:
            unterschiede.append(f'Manifest "{schluessel}": {wa!r} gegen {wb!r}')

    da, db = dateien(a), dateien(b)
    nur_a = sorted(set(da) - set(db))
    nur_b = sorted(set(db) - set(da))
    for f in nur_a:
        unterschiede.append(f'nur in A: {f}{" (Artefakt des Betriebssystems)" if ist_artefakt(f) else ""}')
    for f in nur_b:
        unterschiede.append(f'nur in B: {f}{" (Artefakt des Betriebssystems)" if ist_artefakt(f) else ""}')
    for f in sorted(set(da) & set(db)):
        if da[f] != db[f]:
            unterschiede.append(f'Inhalt weicht ab: {f}')

    return unterschiede


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('a', help='Ordner oder .tar.gz')
    p.add_argument('b', help='Ordner oder .tar.gz')
    p.add_argument('--streng', action='store_true',
                   help='auch die version vergleichen')
    args = p.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        ta, tb = Path(tmp) / 'a', Path(tmp) / 'b'
        ta.mkdir()
        tb.mkdir()
        oa = entpacke(Path(args.a), ta)
        ob = entpacke(Path(args.b), tb)
        unterschiede = vergleiche(oa, ob, args.streng)

    if unterschiede:
        print(f'Nicht dasselbe Paket ({len(unterschiede)} Unterschied(e)):\n')
        for u in unterschiede:
            print(f'  {u}')
        if any('Artefakt' in u for u in unterschiede):
            print(
                '\nArtefakte des Betriebssystems (._*, .DS_Store, __MACOSX/) '
                'entstehen beim Packen auf macOS.\nSie werden mit entpackt und '
                'zaehlen deshalb, auch wenn niemand sie gemeint hat.\n'
                'Mit GNU tar: --exclude=\'._*\' --exclude=.DS_Store, oder '
                'COPYFILE_DISABLE=1 vor bsdtar.'
            )
        return 1
    print('Dasselbe Paket.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
