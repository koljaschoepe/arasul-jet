#!/usr/bin/env python3
"""Rohre, die zerreissen, und `pipefail`, das den Riss als Antwort weitergibt.

Der Anlass, 27.08.2026: der CI-Job "Migrationskette (leere Datenbank)" wartete
drei Minuten und meldete "nein", obwohl die Kette nach sechs Sekunden durch war
(Lauf 33064190628). Die Zeile war

    if docker logs "$B" 2>&1 | grep -q 'database system is ready…'; then

`grep -q` steigt beim ERSTEN Treffer aus. Postgres schreibt diese Zeile frueh —
beim Hochfahren des Init-Servers — und danach noch sehr viel mehr. `docker
logs` schreibt also in ein bereits geschlossenes Rohr, faengt SIGPIPE und endet
mit 141. `set -o pipefail` nimmt den hoechsten Wert der Pipe, der `if` sieht
141, und die Bedingung wird falsch. Sie wird falsch, GERADE WEIL der gesuchte
Text da ist. Nachstellbar in einer Zeile:

    bash -c 'set -o pipefail; seq 1 200000 | grep -q 5'   ->  141

Warum es fast immer trotzdem geht: was in den Rohrpuffer passt (64 KiB), ist
geschrieben, bevor der Verbraucher aussteigt. Deshalb sind solche Zeilen
jahrelang richtig — bis eine Ausgabe waechst. Man sieht ihnen nicht an, ob sie
morgen noch stimmen, und genau deshalb steht hier eine Pruefung und keine
Bitte um Sorgfalt.

Der Schwesterfall steht in `stiller-tod.py`: dort ist es der Rueckgabewert 1
von `grep`/`ls`, wenn nichts gefunden wurde. Beide Male traegt `pipefail` einen
Wert aus der Pipe heraus, den niemand gemeint hat.

Gesucht wird in Skripten, die `pipefail` setzen:

  1. `| grep -q…` und `| grep -m N`, IMMER. Der Ersatz ist immer da und immer
     kuerzer: `grep -q MUSTER <<<"$(ERZEUGER)"` oder, wenn die Quelle schon
     eine Variable ist, `grep -q MUSTER <<<"$var"`. Ein Rohr, das gar nicht
     erst gebaut wird, kann nicht zerreissen.

  2. `| head`, `| sed …q`, `| awk …exit` NUR dort, wo der Wert der Pipe als
     Antwort zaehlt: in einer Bedingung (`if`, `elif`, `while`, `until`, `!`),
     als nackter Befehl unter `set -e`, oder als Zuweisung unter `set -e`.
     Steht daneben ein Netz (`|| true`, `|| echo …`), faengt es die 141 ab;
     steht `local` davor, bestimmt `local` den Rueckgabewert. Beides ist in
     Ordnung und wird nicht gemeldet.

     Wo genau die Pipe steht, entscheidet mit. In

         [ "$(printf '%s\n' "$a" "$b" | sort -V | head -n1)" = "$a" ]

     ist der Rueckgabewert der von `[`, nicht der der Pipe — der 141 kommt gar
     nicht heraus. Fuer diese beiden Regeln werden `$( … )` deshalb erst
     ausgeblendet; nur fuer die Zuweisungsregel wird ausdruecklich DARIN
     gesucht, denn dort traegt die Ersetzung ihren Wert nach draussen.

Was NICHT geprueft wird und warum:

  * `.github/`. Dort steht nirgends `pipefail` und nirgends `shell: bash`;
    GitHub startet `run:` mit `bash -e {0}`. Ohne pipefail ist der Wert der
    Pipe der von `grep`, und ein SIGPIPE beim Erzeuger faellt nicht auf.
    Sollte jemand dort `pipefail` einschalten, meldet sich diese Pruefung —
    sie sieht auch in `.github/` nach, ob das Wort auftaucht.
  * `scripts/test/waechter-selbsttest.sh`. Dort stehen kaputte Beispiele mit
    Absicht; es ist die Werkbank der Waechter.
  * Alles innerhalb eines Here-Dokuments. Das ist Text, kein Code.

Rueckgabe: 0 wenn keine Stelle uebrig ist, 1 sonst.
"""
import argparse
import re
import sys
from pathlib import Path

# `set -o pipefail`, `set -uo pipefail`, `set -euo pipefail`. Nicht nur im
# Kopf: `migrationskette.sh` traegt vierzig Zeilen Begruendung darueber.
PIPEFAIL = re.compile(r'^\s*set\s+-\S*\s*(-o\s+)?pipefail\b', re.M)
SET_E = re.compile(r'^\s*set\s+-[a-z]*e', re.M)

# 1. Immer rot: grep, das frueh aussteigt.
GREP_STUMM = re.compile(r'\|\s*grep\s+(?:-\S+\s+)*-[A-Za-z]*[qm]')
# 2. Nur in Antwortstellung rot: alles andere, was frueh aussteigt.
ABSCHNEIDER = re.compile(
    r"\|\s*(head\b|sed\s+(-n\s*)?['\"][0-9,]*\s*q|awk\b[^|]*\bexit\b)"
)

BEDINGUNG = re.compile(r'^(if|elif|while|until)\s|^!\s')
ZUWEISUNG = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*\+?="?\$\(')
IRGENDEINE_ZUWEISUNG = re.compile(
    r'^(local\s+|declare\s+|export\s+|readonly\s+)?[A-Za-z_][A-Za-z0-9_]*\+?='
)
NETZ = re.compile(r'\|\|')
# Ein Here-Dokument beginnt: `<<WORT`, `<<'WORT'`, `<<-"WORT"`. Das `(?!<)`
# haelt den Hier-String `<<<"…"` heraus — ausgerechnet die Form, mit der die
# gemeldeten Stellen behoben werden.
HEREDOC = re.compile(r'<<(?!<)-?\s*[\'"]?([A-Za-z_][A-Za-z0-9_]*)[\'"]?')

# Die Werkbank der Waechter. Sie MUSS kaputte Beispiele enthalten.
AUSGENOMMEN = {'waechter-selbsttest.sh'}

# Format: "pfad:zeile|Grund". Leer, und das ist der Punkt: fuer Muster 1 gibt
# es immer einen Ersatz, und Muster 2 meldet sich nur, wo der Wert wirklich
# zaehlt. Wer hier etwas eintraegt, statt es zu beheben, schreibt den Grund
# dazu — sonst wird die Liste zum Friedhof.
BEKANNT: set[str] = set()


def ohne_ersetzung(zeile: str) -> str:
    """Die Zeile mit ausgeblendeten `$( … )`. Was darin steht, gibt seinen
    Rueckgabewert nur ueber die Ersetzung weiter, nicht an die Zeile."""
    aus = list(zeile)
    tiefe = 0
    i = 0
    while i < len(zeile):
        if zeile.startswith('$(', i):
            tiefe += 1
            i += 2
            continue
        if tiefe and zeile[i] == ')':
            tiefe -= 1
            i += 1
            continue
        if tiefe:
            aus[i] = ' '
        i += 1
    return ''.join(aus)


def stellen(datei: Path) -> list[tuple[int, str, str]]:
    """(Zeilennummer, Zeile, Regel) fuer jede Stelle in dieser Datei."""
    text = datei.read_text(encoding='utf-8', errors='replace')
    if not PIPEFAIL.search(text):
        return []
    streng_e = bool(SET_E.search(text))

    gefunden = []
    schluss = None          # offenes Here-Dokument
    for nummer, zeile in enumerate(text.splitlines(), 1):
        schlank = zeile.strip()
        if schluss is not None:
            if schlank == schluss:
                schluss = None
            continue
        # Die eroeffnende Zeile wird selbst noch geprueft: `cat > x <<'E'` ist
        # harmlos, `cmd | head -1 > x <<'E'` waere es nicht.
        marke = HEREDOC.search(zeile)
        if marke:
            schluss = marke.group(1)
        if schlank.startswith('#'):
            continue

        # Regel 1 gilt ueberall, auch in einer Ersetzung: ein `| grep -q` in
        # `$( … )` zerreisst genauso, und sein 141 wird dort zum Wert.
        if GREP_STUMM.search(zeile):
            gefunden.append((nummer, schlank[:110], 'grep'))
            continue
        if NETZ.search(schlank) or schlank.startswith('local '):
            continue
        frei = ohne_ersetzung(schlank)
        if ABSCHNEIDER.search(frei):
            if BEDINGUNG.match(schlank):
                gefunden.append((nummer, schlank[:110], 'bedingung'))
            elif streng_e and not IRGENDEINE_ZUWEISUNG.match(schlank):
                gefunden.append((nummer, schlank[:110], 'nackt'))
        elif streng_e and ZUWEISUNG.match(schlank) and ABSCHNEIDER.search(schlank):
            gefunden.append((nummer, schlank[:110], 'zuweisung'))
    return gefunden


ERKLAERUNG = {
    'grep': ('`| grep -q` / `| grep -m` — der Erzeuger schreibt weiter, waehrend\n'
             '        grep schon aus ist. Ersatz: grep -q MUSTER <<<"$(ERZEUGER)"'),
    'bedingung': ('ein abschneidendes Rohr in einer BEDINGUNG — 141 wird hier zur\n'
                  '        Antwort. Erst in eine Variable lesen, dann darin suchen.'),
    'nackt': ('ein abschneidendes Rohr als nackter Befehl unter `set -e` — 141\n'
              '        beendet das Skript an dieser Zeile, ohne ein Wort.'),
    'zuweisung': ('ein abschneidendes Rohr in einer Zuweisung unter `set -e` — die\n'
                  '        Ersetzung traegt die 141 nach draussen, und das Skript endet.\n'
                  '        Netz anhaengen (`|| true`) oder erst lesen, dann kuerzen.'),
}


# Zwei Wege, wie in einem Workflow doch `pipefail` gilt: ein ausdrueckliches
# `set -o pipefail` in einem `run:`-Block, oder `shell: bash` — damit startet
# GitHub `bash --noprofile --norc -eo pipefail {0}` statt des voreingestellten
# `bash -e {0}`. Gesucht wird nach beidem und nicht nach dem blossen Wort:
# sonst meldet sich die Pruefung an dem Kommentar, der sie erklaert.
# Das `-?` ist noetig, weil `shell:` der erste Schluessel eines Schritts sein
# darf und dann `- shell: bash` heisst.
GH_SHELL = re.compile(r'^-?\s*shell:\s*[\'"]?bash')
GH_PIPEFAIL = re.compile(r'\bset\s+-\S*\s*(-o\s+)?pipefail\b')


def github_mit_pipefail(wurzel: Path) -> list[Path]:
    """Dateien in .github/, die ihre `run:`-Bloecke unter pipefail stellen."""
    ordner = wurzel / '.github'
    if not ordner.is_dir():
        return []
    treffer = []
    for datei in sorted(ordner.rglob('*')):
        if not datei.is_file() or datei.suffix not in ('.yml', '.yaml'):
            continue
        for zeile in datei.read_text(encoding='utf-8', errors='replace').splitlines():
            schlank = zeile.strip()
            if schlank.startswith('#'):
                continue
            if GH_SHELL.match(schlank) or GH_PIPEFAIL.search(schlank):
                treffer.append(datei.relative_to(wurzel))
                break
    return treffer


def main() -> int:
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument('--wurzel', default='.', help='Wurzel des Repos')
    args = zerleger.parse_args()
    wurzel = Path(args.wurzel)

    befunde = []
    gesehen = set()
    # `arasul` und die `.sh` im Wurzelverzeichnis stehen mit in der Liste, seit
    # am 28.08.2026 auffiel, dass die ganze Waechter-Familie ausgerechnet die
    # wichtigste Datei des Repos nie gelesen hat: sie heisst `arasul`, hat
    # keine Endung und liegt in keinem der vier Ordner.
    kandidaten = []
    for ordner in ('scripts', 'services', 'config', 'packaging'):
        kandidaten += sorted((wurzel / ordner).rglob('*.sh'))
    kandidaten += sorted(wurzel.glob('*.sh'))
    if (wurzel / 'arasul').is_file():
        kandidaten.append(wurzel / 'arasul')
    for datei in kandidaten:
        if datei.name in AUSGENOMMEN:
            continue
        # `scripts/ops/restore-drill.sh` ist ein Verweis auf die Datei
        # unter `services/`. Zweimal melden hiesse zweimal beheben.
        echt = datei.resolve()
        if echt in gesehen:
            continue
        gesehen.add(echt)
        for nummer, zeile, regel in stellen(datei):
            befunde.append((datei.relative_to(wurzel), nummer, zeile, regel))

    mit_pipefail = github_mit_pipefail(wurzel)

    jetzt = {f'{d}:{n}' for d, n, _, _ in befunde}
    bekannt = {e.split('|', 1)[0] for e in BEKANNT}
    neu = sorted(jetzt - bekannt)
    verschwunden = sorted(
        s for s in bekannt - jetzt if (wurzel / s.rsplit(':', 1)[0]).exists()
    )

    if not neu and not verschwunden and not mit_pipefail:
        print(f'   Rohrbruch: {len(jetzt)} bekannte Stelle(n), keine neue')
        return 0

    fehler = 0
    if neu:
        fehler = 1
        text = {f'{d}:{n}': (z, r) for d, n, z, r in befunde}
        print(f'   Rohrbruch: {len(neu)} Rohr(e) unter `pipefail`, die beim ersten')
        print('   Treffer zerreissen und den Riss als Antwort weitergeben:')
        for stelle in neu:
            zeile, regel = text[stelle]
            print(f'     {stelle}')
            print(f'       {zeile}')
            print(f'        -> {ERKLAERUNG[regel]}')
        print('   Nachstellbar: bash -c \'set -o pipefail; seq 1 200000 | grep -q 5\'')
        print('   gibt 141. Es trifft nur Ausgaben ueber 64 KiB — also die,')
        print('   von denen man es am wenigsten erwartet.')

    if verschwunden:
        fehler = 1
        print(f'   Rohrbruch: {len(verschwunden)} gelistete Stelle(n) gibt es nicht')
        print('   mehr. Bitte aus BEKANNT streichen:')
        for stelle in verschwunden:
            print(f'     {stelle}')

    if mit_pipefail:
        fehler = 1
        print('   Rohrbruch: in .github/ steht jetzt `pipefail`. Dann gilt dort')
        print('   dasselbe wie in den Skripten, und diese Pruefung muss den')
        print('   Ordner mitlesen — bitte hier nachziehen:')
        for datei in mit_pipefail:
            print(f'     {datei}')

    return fehler


if __name__ == '__main__':
    sys.exit(main())
