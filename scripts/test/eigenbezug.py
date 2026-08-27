#!/usr/bin/env python3
"""Eine `local`-Zeile, die sich auf ihre eigene Nachbarin bezieht.

Der Anlass, 27.08.2026: die Abnahme des Deploy-Endpunkts (Phase C5) lief am
Orin keinen einzigen Schritt weit. Die Zeile war

    local version="$1" ordner="$ARBEIT/paket-$version"

und die Antwort war `version: unbound variable`. Sie sieht richtig aus, und in
einer gewoehnlichen Zuweisungszeile WAERE sie es auch:

    version="$1" ordner="pfad-$version"      # geht, $version ist gesetzt

Der Unterschied ist `local`. Eine Zeile aus lauter Zuweisungen fuehrt die Shell
eine nach der anderen aus und ersetzt fuer jede erst dann. Steht `local` davor,
ist die Zeile ein BEFEHL mit Argumenten -- und Argumente werden ALLE ersetzt,
bevor der Befehl ueberhaupt laeuft. `$version` wird also aufgeloest, waehrend
`version` weder lokal noch sonstwie existiert. Dasselbe gilt fuer `declare`,
`typeset`, `export` und `readonly`.

Nachstellbar in einer Zeile:

    bash -c 'set -u; f() { local a="$1" b="x-$a"; echo "$b"; }; f eins'
    ->  bash: line 1: a: unbound variable

OHNE `set -u` ist es schlimmer, nicht besser: dann ist `$a` leer, die Funktion
laeuft weiter und arbeitet mit `x-`. Steht in der Umgebung zufaellig ein
globales `a`, nimmt sie dessen Wert. Beides faellt erst weit spaeter auf.

Der Ersatz ist immer derselbe und kostet eine Zeile:

    local version="$1"
    local ordner="$ARBEIT/paket-$version"

Gesucht wird in allen Shell-Skripten des Repos: jede Zeile, die mit `local`,
`declare`, `typeset`, `export` oder `readonly` beginnt und in der eine spaetere
Zuweisung einen Namen benutzt, den dieselbe Zeile vorher zuweist.

Was NICHT geprueft wird und warum:

  * `scripts/test/waechter-selbsttest.sh`. Dort stehen kaputte Beispiele mit
    Absicht; es ist die Werkbank der Waechter. Gleiche Ausnahme wie bei
    `rohrbruch.py` und `stiller-tod.py`.
"""
import argparse
import re
import shlex
import sys
from pathlib import Path

# Die Befehle, bei denen die Zeile ein Befehl mit Argumenten ist und nicht eine
# Folge von Zuweisungen. `local` ist der haeufige Fall; die anderen vier haben
# genau dieselbe Ersetzungsreihenfolge.
#
# Gesucht wird an jeder BEFEHLSSTELLE, nicht nur am Zeilenanfang: eine
# einzeilige Funktion (`f() { local a="$1" b="$a"; }`) traegt den Fehler
# genauso, und gerade sie ist der Ort, an dem er entsteht -- wer eine Funktion
# in eine Zeile schreibt, spart Zeilen.
KOPF = re.compile(
    r'(?:^|[;{}]|\|\||&&|\bthen\b|\bdo\b|\belse\b)\s*'
    r'(local|declare|typeset|export|readonly)\s+'
)

ZUWEISUNG = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)=(.*)$', re.S)


def bis_zum_semikolon(rest: str) -> str:
    """Der Teil bis zum naechsten `;`, `&&`, `||` oder `}` AUSSERHALB von
    Anfuehrungszeichen. Was danach kommt, ist ein anderer Befehl und gehoert
    dieser `local`-Zeile nicht mehr."""
    aus = []
    umschlag = ''
    i = 0
    while i < len(rest):
        z = rest[i]
        if umschlag:
            aus.append(z)
            if z == '\\' and umschlag == '"' and i + 1 < len(rest):
                aus.append(rest[i + 1])
                i += 2
                continue
            if z == umschlag:
                umschlag = ''
            i += 1
            continue
        if z in '"\'':
            umschlag = z
            aus.append(z)
            i += 1
            continue
        if z in ';}' or rest.startswith('&&', i) or rest.startswith('||', i):
            break
        aus.append(z)
        i += 1
    return ''.join(aus)


def bezieht_sich_auf(wert: str, namen: set[str]) -> str | None:
    """Der erste Name aus `namen`, den `wert` als `$name` oder `${name}` nennt."""
    for treffer in re.finditer(r'\$\{?([A-Za-z_][A-Za-z0-9_]*)', wert):
        if treffer.group(1) in namen:
            return treffer.group(1)
    return None


def stellen(datei: Path) -> list[tuple[int, str, str, str]]:
    """(Zeilennummer, Zeile, benutzter Name, Variable, die ihn benutzt)."""
    text = datei.read_text(encoding='utf-8', errors='replace')
    gefunden = []
    for nummer, zeile in enumerate(text.splitlines(), 1):
        schlank = zeile.strip()
        if schlank.startswith('#'):
            continue
        for kopf in KOPF.finditer(schlank):
            try:
                # `posix=True` nimmt die Anfuehrungszeichen weg und laesst
                # `$name` stehen -- genau die Sicht, die die Shell beim
                # Ersetzen hat.
                worte = shlex.split(
                    bis_zum_semikolon(schlank[kopf.end():]), posix=True, comments=True
                )
            except ValueError:
                # Eine Zeile, die shlex nicht zerlegen kann (offenes
                # Anfuehrungszeichen, Fortsetzung in der naechsten Zeile). Sie
                # stillschweigend zu uebergehen ist richtig: hier wird
                # gemeldet, was sicher falsch ist, nicht geraten.
                continue
            gesetzt: set[str] = set()
            treffer = None
            for wort in worte:
                if wort.startswith('-'):
                    continue  # `local -a`, `declare -r`
                teil = ZUWEISUNG.match(wort)
                if not teil:
                    continue
                name, wert = teil.group(1), teil.group(2)
                benutzt = bezieht_sich_auf(wert, gesetzt)
                if benutzt:
                    treffer = (nummer, schlank[:100], benutzt, name)
                    break
                gesetzt.add(name)
            if treffer:
                gefunden.append(treffer)
                break
    return gefunden


# Format: "pfad:zeile". Der Bestand vom 27.08.2026 war eine einzige Stelle
# (`deploy-abnahme.sh`), und sie ist behoben. Die Liste bleibt leer. Wer eine
# neue Stelle eintraegt, statt sie zu beheben, schreibt bitte daneben, warum
# sie so bleiben muss -- eine Begruendung dafuer ist schwer vorstellbar, denn
# der Ersatz ist ein Zeilenumbruch.
BEKANNT: set[str] = set()

# Die Werkbank der Waechter: dort stehen kaputte Beispiele mit Absicht.
AUSGENOMMEN = {'scripts/test/waechter-selbsttest.sh'}


def main() -> int:
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument('--wurzel', default='.', help='Wurzel des Repos')
    args = zerleger.parse_args()

    wurzel = Path(args.wurzel)
    befunde = []
    for datei in sorted(wurzel.glob('**/*.sh')):
        if 'node_modules' in datei.parts or '.git' in datei.parts:
            continue
        pfad = datei.relative_to(wurzel)
        if str(pfad) in AUSGENOMMEN:
            continue
        for nummer, zeile, benutzt, name in stellen(datei):
            befunde.append((pfad, nummer, zeile, benutzt, name))

    jetzt = {f'{datei}:{nummer}' for datei, nummer, _, _, _ in befunde}
    neu = sorted(jetzt - BEKANNT)
    verschwunden = sorted(
        stelle for stelle in BEKANNT - jetzt
        if (wurzel / stelle.rsplit(':', 1)[0]).exists()
    )

    if not neu and not verschwunden:
        print(f'   Eigenbezug: {len(jetzt)} bekannte Stellen, keine neue')
        return 0

    fehler = 0
    if neu:
        fehler = 1
        print(f'   Eigenbezug: {len(neu)} NEUE Zeile(n), in denen `local` (oder')
        print('   `declare`/`export`/`readonly`) eine Variable benutzt, die')
        print('   dieselbe Zeile erst anlegt. Sie ist beim Ersetzen noch leer:')
        text = {f'{d}:{n}': (z, b, v) for d, n, z, b, v in befunde}
        for stelle in neu:
            zeile, benutzt, name = text[stelle]
            print(f'     {stelle}')
            print(f'       {zeile}')
            print(f'        -> "{name}" benutzt "${benutzt}", das erst hier entsteht')
        print('   Die Zeile teilen, eine Zuweisung je `local`. Nachstellbar:')
        print("     bash -c 'set -u; f() { local a=\"$1\" b=\"x-$a\"; }; f eins'")

    if verschwunden:
        fehler = 1
        print(f'   Eigenbezug: {len(verschwunden)} gelistete Stelle(n) gibt es')
        print('   nicht mehr. Bitte aus BEKANNT streichen:')
        for stelle in verschwunden:
            print(f'     {stelle}')

    return fehler


if __name__ == '__main__':
    sys.exit(main())
