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

1. Die Migrationen der Kurzliste nennen zusammen jede der vier Kennungen, und
   die juengste davon nennt den Standard. Das sind `175_kurzliste_c8.sql` und
   jede spaetere Migration mit der Zeile
   `-- Waechter: scripts/test/kurzliste.py liest diese Migration.` -- seit
   J35 (25.09.2026) `186_standardmodell_ollama_bibliothek.sql`, die den
   Standard auf `qwen3.8:27b-q4_K_M` zieht. Eine Migration ist unveraenderlich
   (das Migrationsbuch fuehrt ihre Pruefsumme), also kann 175 die neue Kennung
   nie nennen; der Waechter muss sie dort suchen, wo sie gesetzt wird.
2. `apps/dashboard-backend/src/utils/hardware.js` nennt alle vier und keine
   fuenfte mit Tag (siehe die Grenze bei KENNUNG).
3. `config/platforms/*.json`: `models` ist die Liste, `default_model` ihr
   Standard. Jedes Profil, nicht nur Thor und DGX Spark.
4. `scripts/setup/detect-platform.sh`: jeder Wert von `LLM_MODEL=` und
   `RECOMMENDED_MODELS=` besteht ausschliesslich aus Kennungen der Kurzliste.
5. Jede Stelle, an der ein Rueckfall fuer `LLM_MODEL` von Hand dasteht: die
   beiden `.env`-Vorlagen, die zwei Skripte, die daraus eine `.env` machen
   (`interactive_setup.sh`, `preconfigure.sh`), die drei Dateien des
   LLM-Dienstes (`api_server.py`, `entrypoint.sh`, `healthcheck.sh`) und
   `compose/compose.ai.yaml`. Jede Modellkennung neben `LLM_MODEL` steht in
   der Kurzliste.
6. `scripts/util/modelle-aufraeumen.sh` und `scripts/test/modelle-abnahme.sh`
   LESEN die Datei, statt die Liste abzuschreiben.
7. Jeder Eintrag der Kurzliste traegt `digest` als `sha256:<64 hex>` (seit
   J35, 25.09.2026). Das ist der Wert, gegen den die Installation das geholte
   Modell prueft; eine Kennung ohne ihn ist wieder eine, unter der morgen
   etwas anderes liegen kann -- der Fund am `hf.co/`-Standard.

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


def eintraege(wurzel: Path) -> list[dict]:
    datei = wurzel / 'config' / 'modelle' / 'kurzliste.json'
    return json.loads(datei.read_text(encoding='utf-8'))['modelle']


def kurzliste(wurzel: Path) -> list[str]:
    return [m['id'] for m in eintraege(wurzel)]


DIGEST = re.compile(r'^sha256:[0-9a-f]{64}$')


def pruefe_digest(wurzel: Path) -> list[str]:
    """Jeder Eintrag nennt den sha256 seines Manifests (J35, 25.09.2026)."""
    fehler = []
    for eintrag in eintraege(wurzel):
        wert = eintrag.get('digest')
        if not isinstance(wert, str) or not DIGEST.match(wert):
            fehler.append(
                f'config/modelle/kurzliste.json: {eintrag.get("id")} traegt keinen '
                f'`digest` der Form sha256:<64 hex> ({wert!r})'
            )
    return fehler


def js_zeichenketten(text: str) -> set[str]:
    """Alle einfach-quotierten Zeichenketten einer JS-Datei."""
    return set(re.findall(r"'([^'\n]+)'", text))


BASIS_MIGRATION = '175_kurzliste_c8.sql'
MARKE = 'Waechter: scripts/test/kurzliste.py liest diese Migration.'


def migrationen_der_kurzliste(wurzel: Path) -> list[Path]:
    """175 und jede spaetere Migration mit der Marke, aufsteigend nach Nummer."""
    ordner = wurzel / 'services' / 'postgres' / 'init'
    gefunden = []
    for pfad in ordner.glob('*.sql'):
        nummer = re.match(r'^(\d+)', pfad.name)
        if not nummer:
            continue
        if pfad.name == BASIS_MIGRATION or MARKE in pfad.read_text(encoding='utf-8'):
            gefunden.append((int(nummer.group(1)), pfad))
    return [p for _, p in sorted(gefunden)]


def pruefe_migration(wurzel: Path, liste: list[str], standards: list[str]) -> list[str]:
    basis = f'services/postgres/init/{BASIS_MIGRATION}'
    if not (wurzel / basis).exists():
        return [f'{basis}: fehlt']
    dateien = migrationen_der_kurzliste(wurzel)
    texte = {p: p.read_text(encoding='utf-8') for p in dateien}
    fehler = []
    fehlend = [k for k in liste if not any(f"'{k}'" in t for t in texte.values())]
    if fehlend:
        namen = ', '.join(p.name for p in dateien)
        fehler.append(f'Migrationen der Kurzliste ({namen}): nennen {", ".join(fehlend)} nicht')
    # Die juengste setzt den Standard zuletzt; nennt sie ihn nicht, gilt am
    # Geraet ein anderer als in der Liste.
    juengste = dateien[-1]
    ohne = [k for k in standards if f"'{k}'" not in texte[juengste]]
    if ohne and juengste.name != BASIS_MIGRATION:
        fehler.append(
            f'services/postgres/init/{juengste.name}: die juengste Migration der '
            f'Kurzliste nennt den Standard {", ".join(ohne)} nicht'
        )
    return fehler


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


# Wo eine Modellkennung noch von Hand dasteht und nicht aus einem Profil kommt:
# die beiden .env-Vorlagen und die zwei Skripte, die daraus eine .env machen.
VORLAGEN = (
    '.env.example',
    '.env.template',
    'scripts/interactive_setup.sh',
    'scripts/setup/preconfigure.sh',
    'services/llm-service/api_server.py',
    'services/llm-service/entrypoint.sh',
    'services/llm-service/healthcheck.sh',
    'compose/compose.ai.yaml',
)
# Eine Modellkennung in einer dieser Dateien steht immer neben `LLM_MODEL`.
# Beide Formen kommen vor:
#   LLM_MODEL=gemma4:e4b
#   DEFAULT_LLM_MODEL="${DEFAULT_LLM_MODEL:-gemma4:e4b}"
MODELLWORT = re.compile(r'(?:hf\.co/[\w.\-/]+(?::[\w.\-]+)?|[a-z][\w.\-]*:[\w.\-]+)')


def pruefe_vorlagen(wurzel: Path, liste: list[str]) -> list[str]:
    """Die .env-Vorlagen nennen nur Modelle der Kurzliste.

    Der Anlass, 28.08.2026: in `.env.example` stand `LLM_MODEL=qwen3:14b`, in
    `.env.template` `qwen3:14b-q8`. Beide gibt es seit der Kurzliste nicht
    mehr. Der Werksreset schrieb daraus eine `.env` und zog das Modell dann --
    dreissig Minuten gegen einen Dienst, der noch startete. Die Kurzliste hielt
    fuenf Stellen zusammen und ausgerechnet die, aus der ein frisches Geraet
    seine erste `.env` bekommt, nicht.
    """
    fehler = []
    for rel in VORLAGEN:
        pfad = wurzel / rel
        if not pfad.exists():
            fehler.append(f'{rel}: fehlt')
            continue
        for nummer, zeile in enumerate(
            pfad.read_text(encoding='utf-8').splitlines(), 1
        ):
            schlank = zeile.strip()
            if schlank.startswith('#') or 'LLM_MODEL' not in schlank:
                continue
            fremd = [
                w for w in MODELLWORT.findall(schlank)
                if w not in liste and not w.startswith('LLM_MODEL')
            ]
            if fremd:
                fehler.append(f'{rel}:{nummer}: nennt {", ".join(sorted(set(fremd)))}')
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

    # Der Standard fuer `text` ist der, um den es in einer spaeteren Migration
    # geht; die Standards der anderen Aufgaben setzt 175 und keiner hat sie
    # seither bewegt.
    standard_text = [
        m['id'] for m in eintraege(wurzel) if m.get('standard') and m.get('aufgabe') == 'text'
    ]

    fehler = (
        pruefe_digest(wurzel)
        + pruefe_migration(wurzel, liste, standard_text)
        + pruefe_hardware(wurzel, liste)
        + pruefe_profile(wurzel, liste)
        + pruefe_setup(wurzel, liste)
        + pruefe_vorlagen(wurzel, liste)
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
