#!/usr/bin/env python3
"""Haelt die Kurzliste an EINER Stelle (Phase C8, 27.08.2026).

Warum es diesen Waechter gibt
-----------------------------
Der Katalog trug siebzehn Modelle, und die Empfehlung je Geraeteprofil stand
davon unabhaengig in `utils/hardware.js`. Am 21.08.2026 nachgemessen: ACHT der
siebzehn Kennungen dieser Karte gab es im Katalog gar nicht. Auf einem
Xavier NX empfahl der Einrichtungsassistent `phi3:mini`, ein Modell, das
niemand laden kann. Der Grund war nie Nachlaessigkeit, sondern die Zahl der
Stellen: dieselbe Liste stand in einer Migration, in einer JS-Karte, in sechs
Plattform-Profilen und in einem Setup-Skript, und keine wusste von den anderen.

Mit der Kurzliste ist der Katalog eine ZUSAGE ueber vier gemessene Modelle. Eine
Zusage, die an sechs Stellen abgeschrieben ist, ist ab dem naechsten Zug an
einer davon falsch.

Die eine Stelle ist `config/modelle/kurzliste.json`. Geprueft wird:

1. `services/postgres/init/175_kurzliste_c8.sql` nennt jede der vier Kennungen.
2. `apps/dashboard-backend/src/utils/hardware.js` nennt alle vier und keine
   fuenfte mit Tag (siehe die Grenze bei KENNUNG).
3. `config/platforms/*.json`: `models` ist die Liste, `default_model` ihr
   Standard. Jedes Profil, nicht nur Thor und DGX Spark.
4. `scripts/setup/detect-platform.sh`: jeder Wert von `LLM_MODEL=` und
   `RECOMMENDED_MODELS=` besteht ausschliesslich aus Kennungen der Kurzliste.
5. `scripts/util/modelle-aufraeumen.sh` und `scripts/test/modelle-abnahme.sh`
   LESEN die Datei, statt die Liste abzuschreiben.

Was er NICHT kann
-----------------
Er liest Text, keinen Syntaxbaum und kein SQL. Punkt 1 prueft Vorkommen, nicht
die Bedeutung: eine Migration, die alle vier nennt und danach drei davon wieder
loescht, faellt ihm nicht auf. Dafuer gibt es `scripts/test/modelle-abnahme.sh`,
das am laufenden Geraet nachsieht, was `GET /api/models/catalog` wirklich sagt.

Rueckgabe: 0 wenn alle Stellen mit der Kurzliste uebereinstimmen, 1 sonst.
"""
import argparse
import json
import re
import sys
from pathlib import Path

# Was ZWEIFELSFREI eine Modellkennung ist: `hf.co/…` oder `familie:tag`.
# Bewusst eng: `'text'`, `'vision'` und `'thor_128gb'` sollen nicht
# hineinfallen, `'gemma4:e4b-q4'` und `'tinyllama:1.1b'` schon.
#
# Die Grenze, ehrlich benannt: ein Modell OHNE Tag (`llava-phi3`,
# `nomic-embed-text`) ist von einem gewoehnlichen Wort nicht zu unterscheiden.
# Solche Kennungen werden deshalb nur auf VORHANDENSEIN geprueft, nicht auf
# Ueberzaehligkeit. Ein zurueckgebliebenes `'bge-m3'` faellt hier nicht auf --
# ein zurueckgebliebenes `'gemma4:26b-q4'` schon, und das ist die Form, in der
# die alten Kennungen ueberwiegend dastanden.
KENNUNG = re.compile(r'^(?:hf\.co/[\w.\-/]+(?::[\w.\-]+)?|[a-z][\w.\-]*:[\w.\-]+)$')


def kurzliste(wurzel: Path) -> list[str]:
    datei = wurzel / 'config' / 'modelle' / 'kurzliste.json'
    return [m['id'] for m in json.loads(datei.read_text(encoding='utf-8'))['modelle']]


def js_zeichenketten(text: str) -> set[str]:
    """Alle einfach-quotierten Zeichenketten einer JS-Datei."""
    return set(re.findall(r"'([^'\n]+)'", text))


def pruefe_migration(wurzel: Path, liste: list[str]) -> list[str]:
    rel = 'services/postgres/init/175_kurzliste_c8.sql'
    pfad = wurzel / rel
    if not pfad.exists():
        return [f'{rel}: fehlt']
    text = pfad.read_text(encoding='utf-8')
    fehlend = [k for k in liste if f"'{k}'" not in text]
    return [f'{rel}: nennt {", ".join(fehlend)} nicht'] if fehlend else []


def pruefe_hardware(wurzel: Path, liste: list[str]) -> list[str]:
    rel = 'apps/dashboard-backend/src/utils/hardware.js'
    pfad = wurzel / rel
    if not pfad.exists():
        return [f'{rel}: fehlt']
    gefunden = js_zeichenketten(pfad.read_text(encoding='utf-8'))
    fehler = []
    fehlend = sorted(set(liste) - gefunden)
    zuviel = sorted(t for t in gefunden - set(liste) if KENNUNG.match(t))
    if fehlend:
        fehler.append(f'{rel}: nennt {", ".join(fehlend)} nicht')
    if zuviel:
        fehler.append(f'{rel}: nennt Modelle ausserhalb der Kurzliste: {", ".join(zuviel)}')
    return fehler


def pruefe_profile(wurzel: Path, liste: list[str]) -> list[str]:
    fehler = []
    for datei in sorted((wurzel / 'config' / 'platforms').glob('*.json')):
        daten = json.loads(datei.read_text(encoding='utf-8'))
        rel = f'config/platforms/{datei.name}'
        if daten.get('models') != liste:
            fehler.append(f'{rel}: `models` ist nicht die Kurzliste ({daten.get("models")})')
        if daten.get('default_model') != liste[0]:
            fehler.append(
                f'{rel}: `default_model` ist nicht der Standard der Kurzliste '
                f'({daten.get("default_model")})'
            )
    return fehler


def pruefe_setup(wurzel: Path, liste: list[str]) -> list[str]:
    rel = 'scripts/setup/detect-platform.sh'
    pfad = wurzel / rel
    if not pfad.exists():
        return [f'{rel}: fehlt']
    fehler = []
    for nummer, zeile in enumerate(pfad.read_text(encoding='utf-8').splitlines(), 1):
        treffer = re.match(r'^(LLM_MODEL|RECOMMENDED_MODELS)="?([^"]*)"?$', zeile)
        if not treffer:
            continue
        werte = [w for w in treffer.group(2).split(',') if w]
        fremd = [w for w in werte if w not in liste]
        if fremd:
            fehler.append(f'{rel}:{nummer}: {treffer.group(1)} nennt {", ".join(fremd)}')
    if not fehler and 'RECOMMENDED_MODELS=' not in pfad.read_text(encoding='utf-8'):
        fehler.append(f'{rel}: kein RECOMMENDED_MODELS mehr vorhanden')
    return fehler


def pruefe_leser(wurzel: Path) -> list[str]:
    """Die beiden Skripte muessen die Datei LESEN, nicht abschreiben."""
    fehler = []
    for rel in ('scripts/util/modelle-aufraeumen.sh', 'scripts/test/modelle-abnahme.sh'):
        pfad = wurzel / rel
        if not pfad.exists():
            fehler.append(f'{rel}: fehlt')
        elif 'config/modelle/kurzliste.json' not in pfad.read_text(encoding='utf-8'):
            fehler.append(f'{rel}: liest die Kurzliste nicht, sondern hat vermutlich eine Kopie')
    return fehler


def main() -> int:
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument('--wurzel', default='.', help='Wurzel des Repos')
    argumente = zerleger.parse_args()
    wurzel = Path(argumente.wurzel).resolve()

    liste = kurzliste(wurzel)
    if len(liste) != len(set(liste)):
        print('Die Kurzliste nennt eine Kennung doppelt.')
        return 1

    fehler = (
        pruefe_migration(wurzel, liste)
        + pruefe_hardware(wurzel, liste)
        + pruefe_profile(wurzel, liste)
        + pruefe_setup(wurzel, liste)
        + pruefe_leser(wurzel)
    )

    if fehler:
        print(f'Die Kurzliste stimmt an {len(fehler)} Stelle(n) nicht ueberein:')
        for zeile in fehler:
            print(f'  {zeile}')
        print()
        print('Die eine Quelle ist config/modelle/kurzliste.json.')
        return 1

    print(f'Kurzliste: {len(liste)} Modelle, alle Stellen einig.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
