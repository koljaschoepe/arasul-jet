#!/usr/bin/env python3
"""Zuweisungen, die unter `set -e` und `pipefail` still das Skript beenden.

Der Anlass, 24.08.2026: `pruefstand.sh` bekam eine Vorabpruefung, ob seine
Ports frei sind. Sie sah so aus:

    wer="$(docker ps --format '...' | grep -E ":${wert}->" | cut -f1 | head -1)"

Findet `grep` nichts, ist sein Rueckgabewert 1. Mit `pipefail` schlaegt damit
die ganze Pipe fehl, der Rueckgabewert der Zuweisung ist 1, und `set -e`
beendet das Skript — ohne eine einzige Zeile Ausgabe. Ausgerechnet dann, wenn
alles in Ordnung ist: ein freier Port ist der Normalfall.

Beim Nachsehen, ob das oefter vorkommt, kamen dreizehn weitere Stellen heraus,
darunter im Einrichtungsassistenten und in der Werksinstallation. Bei einer
davon steht die Absicht sogar als Kommentar daneben:

    # Use ADMIN_PASSWORD from .env if available (new install), else generate fresh
    ADMIN_PASSWORD=$(grep "^ADMIN_PASSWORD=" "$ENV_FILE" | cut -d= -f2 | ...)

"else generate fresh" kann nicht passieren. Fehlt die Zeile, ist das Skript
vorher tot.

Gesucht wird deshalb genau diese Verbindung, und nur sie:

  1. Das Skript setzt `set -e` UND `pipefail` (im Kopf, erste 30 Zeilen).
  2. Eine nackte Zuweisung `NAME=$(...)` — `local NAME=$(...)` ist harmlos,
     dort bestimmt `local` den Rueckgabewert.
  3. In der Ersetzung steht `grep`, `ls` oder `find`, also ein Befehl, der
     "nichts gefunden" als Fehler meldet.
  4. Kein Auffangnetz (`|| true`, `|| echo ...`).

Ohne `pipefail` ist dieselbe Zeile harmlos, wenn danach noch `cut`, `awk`,
`head` oder `sed` kommen: die geben 0 zurueck, und ohne `pipefail` zaehlt nur
das letzte Glied. Deshalb steht Bedingung 1 an erster Stelle und nicht als
Beiwerk — sonst meldet die Pruefung siebzig Stellen, von denen sechzig in
Ordnung sind, und wird abgeschaltet.

Warum eine Liste bekannter Stellen und kein sofortiges Rot: die Pruefung fand
am 24.08.2026 dreiundzwanzig Treffer, und sie sind NICHT alle gleich schlimm.
In `restore.sh` etwa steht die Zuweisung in einer Funktion, die ihre Aufrufer
mit `local datei=$(funktion ...)` aufrufen — `local` bestimmt dort den
Rueckgabewert, die Subshell stirbt still, und der leere String, der dabei
herauskommt, ist genau das gewuenschte Signal. Es funktioniert also, aber aus
Versehen.

Diese dreiundzwanzig einzeln zu bewerten ist Arbeit, die Sorgfalt braucht und
nicht in einen Zug gehoert. Bis dahin gilt, was `durchreichung.py` seit
langem vormacht: der Bestand ist eingefroren und benannt, jede NEUE Stelle
ist rot. Wer eine Zeile aus der Liste repariert, streicht sie hier — die
Pruefung meldet auch, wenn eine gelistete Stelle gar nicht mehr existiert,
damit die Liste nicht zum Friedhof wird.

Rueckgabe: 0 wenn keine neue Stelle dazukommt, 1 sonst.
"""
import argparse
import re
import sys
from pathlib import Path

ZUWEISUNG = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*="?\$\(')
FEHLSCHLAEGT = re.compile(r'\b(grep|ls|find)\b')
NETZ = re.compile(r'\|\|')
KOPF_E = re.compile(r'^set -[a-z]*e', re.M)


def kopf_ist_streng(text: str) -> bool:
    kopf = '\n'.join(text.splitlines()[:30])
    return bool(KOPF_E.search(kopf)) and 'pipefail' in kopf


def stellen(datei: Path) -> list[tuple[int, str]]:
    text = datei.read_text(encoding='utf-8', errors='replace')
    if not kopf_ist_streng(text):
        return []
    gefunden = []
    for nummer, zeile in enumerate(text.splitlines(), 1):
        schlank = zeile.strip()
        if schlank.startswith('#') or schlank.startswith('local '):
            continue
        if not ZUWEISUNG.match(schlank):
            continue
        if NETZ.search(schlank) or not FEHLSCHLAEGT.search(schlank):
            continue
        gefunden.append((nummer, schlank[:100]))
    return gefunden


# Bestand vom 24.08.2026. Format: "pfad:zeile". Wer eine Stelle repariert,
# streicht ihre Zeile. Nichts hier ist als "in Ordnung" markiert — nur als
# "war schon da und ist noch nicht bewertet".
BEKANNT = {
    'scripts/backup/restore.sh:360',
    'scripts/backup/restore.sh:472',
    'scripts/backup/restore.sh:475',
    'scripts/backup/restore.sh:478',
    'scripts/backup/restore.sh:481',
    'scripts/backup/restore.sh:484',
    'scripts/deploy/create-deployment-image.sh:199',
    'scripts/deploy/create-factory-image.sh:154',
    'scripts/deploy/create-update-package.sh:203',
    'scripts/deploy/create-update-package.sh:225',
    'scripts/deploy/create-update-package.sh:230',
    'scripts/deploy/factory-install.sh:82',
    'scripts/deploy/factory-install.sh:83',
    'scripts/deploy/factory-install.sh:108',
    'scripts/deploy/factory-install.sh:227',
    'scripts/interactive_setup.sh:324',
    'scripts/interactive_setup.sh:325',
    'scripts/interactive_setup.sh:543',
    'scripts/setup/preconfigure.sh:227',
    'scripts/setup/preconfigure.sh:422',
    'scripts/setup/preconfigure.sh:534',
    'scripts/util/auto-restart-service.sh:30',
    'scripts/util/auto-restart-service.sh:32',
}


def main() -> int:
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument('--wurzel', default='.', help='Wurzel des Repos')
    args = zerleger.parse_args()

    wurzel = Path(args.wurzel)
    befunde = []
    for datei in sorted(wurzel.glob('scripts/**/*.sh')):
        for nummer, zeile in stellen(datei):
            befunde.append((datei.relative_to(wurzel), nummer, zeile))

    jetzt = {f'{datei}:{nummer}' for datei, nummer, _ in befunde}
    neu = sorted(jetzt - BEKANNT)
    # Nur Stellen als verschwunden melden, deren Datei es im geprueften Baum
    # ueberhaupt gibt. Sonst ist die Pruefung in jedem anderen Verzeichnis rot
    # — auch im Wegwerfordner des Waechter-Selbsttests, wo sie ausgerechnet
    # ihre gruenen Faelle beweisen soll.
    verschwunden = sorted(
        stelle for stelle in BEKANNT - jetzt
        if (wurzel / stelle.rsplit(':', 1)[0]).exists()
    )

    if not neu and not verschwunden:
        print(f'   Stiller Tod: {len(jetzt)} bekannte Stellen, keine neue')
        return 0

    fehler = 0
    if neu:
        fehler = 1
        print(f'   Stiller Tod: {len(neu)} NEUE Zuweisung(en), die unter `set -e`')
        print('   und `pipefail` das Skript wortlos beenden, sobald der Befehl')
        print('   nichts findet:')
        text = {f'{d}:{n}': z for d, n, z in befunde}
        for stelle in neu:
            print(f'     {stelle}')
            print(f'       {text[stelle]}')
        print('   Auffangnetz anhaengen (`|| true`) und den Leerfall danach')
        print('   behandeln. "Nichts gefunden" ist meistens der Normalfall.')

    if verschwunden:
        # Kein Fehler, sondern eine Aufraeumbitte: sonst waechst die Liste zu
        # und niemand traut sich mehr, eine Zeile daraus zu streichen.
        print(f'   Stiller Tod: {len(verschwunden)} gelistete Stelle(n) gibt es')
        print('   nicht mehr. Bitte aus BEKANNT streichen:')
        for stelle in verschwunden:
            print(f'     {stelle}')
        fehler = 1

    return fehler


if __name__ == '__main__':
    sys.exit(main())
