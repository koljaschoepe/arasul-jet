#!/usr/bin/env python3
"""
Waechter fuer README.md und CLAUDE.md (Plan 023 K3).

Die Abnahme verlangt: "Jede Aussage in README und CLAUDE.md ist gegen den Code
geprueft. Kein Verweis auf Entferntes."

Einmal lesen erfuellt das fuer einen Tag. Danach wandert eine Datei, ein Befehl
verschwindet, ein Dienst wird umbenannt, und die Anleitung zeigt wieder ins
Leere. Deshalb ein Waechter statt eines Hakens.

Geprueft wird nur, was WIRKLICH pruefbar ist:

  1. Jeder Markdown-Link auf eine Datei im Repo zeigt auf etwas, das es gibt.
  2. Jeder Pfad in Backticks, der wie ein Repo-Pfad aussieht, existiert.
  3. Jeder `./arasul <befehl>` ist im CLI wirklich ein Unterbefehl.
  4. Jedes `make <ziel>` steht im Makefile.
  5. Jeder Dienst, den die beiden Dateien als LAUFEND beschreiben, steht in
     compose ohne Profil. Ein Dienst hinter einem Profil laeuft nicht von
     selbst, und genau diese Verwechslung hat K3 ausgeloest.

Was der Waechter NICHT kann: beurteilen, ob ein Satz noch stimmt. Prosa bleibt
Handarbeit. Er haelt die Stellen, an denen Doku still falsch wird, ohne dass es
jemand merkt.

Aufruf:  python3 scripts/test/anleitungen.py
"""

import os
import re
import sys

# Wie bei den anderen Waechtern: die Wurzel ist umstellbar, damit der
# Selbsttest den Waechter gegen einen gebauten Baum laufen lassen kann.
WURZEL = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Diese beiden MUESSEN da sein: fehlt eine, ist das ein Befund.
PFLICHT = ['README.md', 'CLAUDE.md']
# Diese kommen dazu, wenn es sie gibt. Sie beschreiben Ablaeufe, und genau dort
# faellt ein abgeschalteter Dienst am wenigsten auf (23.08.2026). Fehlen sie,
# ist das kein Fehler: der Waechter laeuft auch gegen einen Behelfsbaum im
# Selbsttest, und dort gibt es sie nicht.
ZUSAETZLICH = ['docs/features/FLOWS.md', 'docs/ARCHITECTURE.md']
DATEIEN = PFLICHT + ZUSAETZLICH

# Verweise auf Stellen ausserhalb des Repos oder auf Anker sind kein Fund.
UEBERSPRINGEN = ('http://', 'https://', 'mailto:', '#')

# Pfade in Backticks, die keine Repo-Pfade sind: Beispiele, Platzhalter,
# Adressen im Docker-Netz. Sie tragen ein <platzhalter> oder einen Doppelpunkt.
KEIN_REPO_PFAD = re.compile(r'[<>{}$*|]|://|^\.env|\s')

# Nur was HIER beginnt, wird als Repo-Pfad geprueft.
#
# Der erste Entwurf nahm alles mit einem Schraegstrich und meldete daraufhin
# `try/catch`, `Arasul-GmbH/arasul-os` und die Slash-Befehle `/plan`, `/work`
# als fehlende Dateien. Ein Waechter, der falschen Alarm gibt, wird
# abgeschaltet, und dann faengt er auch die echten Faelle nicht mehr.
#
# Die Liste entsteht aus dem Repo selbst, nicht aus einer zweiten Aufzaehlung:
# was oben liegt, ist ein moeglicher Pfadanfang.
def oberste_ebene():
    return {
        n
        for n in os.listdir(WURZEL)
        if not n.startswith('.git') and (os.path.isdir(os.path.join(WURZEL, n)) or '.' in n)
    }

# Ein Satz, der ausdruecklich sagt, dass es etwas NICHT gibt, ist keine
# falsche Angabe, sondern die richtige. CLAUDE.md nennt `.claude/commands/`
# genau so: "nicht als Befehle unter `.claude/commands/` - den Ordner gibt es
# nicht."
VERNEINT = re.compile(r'gibt es nicht|existiert nicht|den Ordner gibt es nicht')


def markdown_links(text):
    """(Anzeige, Ziel) je Markdown-Link."""
    return re.findall(r'\[([^\]]*)\]\(([^)]+)\)', text)


def backtick_pfade(text):
    """
    Was in Backticks steht und wirklich wie ein Repo-Pfad aussieht.

    :returns: (geprueft, uebersprungen) - die zweite Zahl steht am Ende in der
        Ausgabe, damit niemand glaubt, der Waechter habe mehr geprueft, als er
        geprueft hat.
    """
    anfaenge = oberste_ebene()
    treffer, uebersprungen = [], 0
    for roh in re.findall(r'`([^`\n]+)`', text):
        wert = roh.strip()
        if not wert or KEIN_REPO_PFAD.search(wert):
            continue
        rein = wert.lstrip('./').rstrip('/')
        if not rein:
            continue
        kopf = rein.split('/')[0]
        if kopf not in anfaenge:
            uebersprungen += 1
            continue
        # Steht im selben Satz, dass es das NICHT gibt, ist die Aussage richtig.
        stelle = text.find(f'`{roh}`')
        umfeld = text[max(0, stelle - 200) : stelle + 200]
        if VERNEINT.search(umfeld):
            uebersprungen += 1
            continue
        treffer.append(rein)
    return treffer, uebersprungen


def arasul_befehle(text):
    return set(re.findall(r'\./arasul ([a-z][a-z-]*)', text))


def make_ziele(text):
    """Nur `make <ziel>` in Codeschrift, nicht im Fliesstext.

    Ohne diese Einschraenkung las der Waechter jedes "make every" oder "make
    sure" in einem englischen Satz als Makefile-Ziel und meldete es (23.08.2026
    an einem Satz in der README passiert). Ein Befehl steht in dieser
    Dokumentation immer in Backticks oder in einem Codeblock.
    """
    in_code = []
    # Codebloecke mit ``` und Einzeiler mit `...`
    for block in re.findall(r'```[a-z]*\n(.*?)```', text, re.S):
        in_code.append(block)
    in_code.extend(re.findall(r'`([^`\n]+)`', text))
    zusammen = '\n'.join(in_code)
    return set(re.findall(r'\bmake ([a-z][a-z-]*)', zusammen))


def compose_dienste():
    """
    Alle Dienste aus compose/, und welche davon hinter einem Profil stehen.

    Bewusst zeilenweise statt mit einem YAML-Parser: die Dateien enthalten
    `${VAR:-vorgabe}`-Formen, die kein Parser ohne Umgebung aufloest, und
    gebraucht werden nur die Namen.
    """
    alle, mit_profil = set(), set()
    ordner = os.path.join(WURZEL, 'compose')
    if not os.path.isdir(ordner):
        return alle, mit_profil
    for name in sorted(os.listdir(ordner)):
        if not name.endswith(('.yaml', '.yml')):
            continue
        aktuell = None
        in_services = False
        with open(os.path.join(ordner, name), encoding='utf-8') as f:
            for zeile in f:
                if re.match(r'^services:\s*$', zeile):
                    in_services = True
                    continue
                if in_services and re.match(r'^[a-zA-Z]', zeile):
                    in_services = False
                if not in_services:
                    continue
                m = re.match(r'^  ([a-z][a-z0-9_-]*):\s*$', zeile)
                if m:
                    aktuell = m.group(1)
                    alle.add(aktuell)
                elif aktuell and re.match(r'^    profiles:', zeile):
                    mit_profil.add(aktuell)
    return alle, mit_profil


def main():
    fehler = []
    nicht_geprueft = 0

    for datei in DATEIEN:
        pfad = os.path.join(WURZEL, datei)
        if not os.path.exists(pfad):
            if datei in PFLICHT:
                fehler.append(f'{datei}: gibt es nicht')
            continue
        text = open(pfad, encoding='utf-8').read()

        # Ein Link in einer Datei zeigt relativ zu IHREM Ordner, nicht zur
        # Wurzel. Solange nur README.md und CLAUDE.md geprueft wurden, war das
        # dasselbe; seit docs/ dazukam, ist es das nicht mehr (23.08.2026).
        ordner = os.path.dirname(pfad) or WURZEL

        # 1. Markdown-Links
        for anzeige, ziel in markdown_links(text):
            if ziel.startswith(UEBERSPRINGEN):
                continue
            ohne_anker = ziel.split('#')[0]
            if not ohne_anker:
                continue
            relativ = os.path.join(ordner, ohne_anker)
            absolut = os.path.join(WURZEL, ohne_anker)
            if not os.path.exists(relativ) and not os.path.exists(absolut):
                fehler.append(f'{datei}: Link "{anzeige}" zeigt auf {ziel}, das es nicht gibt')

        # 2. Pfade in Backticks
        pfade, uebersprungen = backtick_pfade(text)
        nicht_geprueft += uebersprungen
        for p in pfade:
            if '*' in p:
                continue
            # `data/` entsteht zur Laufzeit auf dem Geraet und liegt nicht im
            # Repo. Ein Verweis darauf ist richtig, auch wenn die Datei hier
            # fehlt.
            if p.startswith('data/'):
                continue
            if not os.path.exists(os.path.join(WURZEL, p)) and not os.path.exists(
                os.path.join(ordner, p)
            ):
                fehler.append(f'{datei}: `{p}` gibt es nicht')

        # 3. CLI-Unterbefehle
        cli = os.path.join(WURZEL, 'arasul')
        if os.path.exists(cli):
            cli_text = open(cli, encoding='utf-8', errors='replace').read()
            for befehl in sorted(arasul_befehle(text)):
                if not re.search(rf'\b{re.escape(befehl)}\b', cli_text):
                    fehler.append(f'{datei}: `./arasul {befehl}` kennt das CLI nicht')

        # 4. Make-Ziele
        makefile = os.path.join(WURZEL, 'Makefile')
        if os.path.exists(makefile):
            mk = open(makefile, encoding='utf-8').read()
            for ziel in sorted(make_ziele(text)):
                if not re.search(rf'^{re.escape(ziel)}:', mk, re.M):
                    fehler.append(f'{datei}: `make {ziel}` steht nicht im Makefile')

    # 5. Dienste, die als laufend beschrieben werden
    alle, mit_profil = compose_dienste()
    # Der Abschnitt, der ausdruecklich sagt, was NICHT laeuft, wird
    # ausgeklammert: dort duerfen Profil-Dienste stehen, das ist der Punkt.
    def ohne_ausnahme(text):
        return re.sub(
            # Drei Schreibweisen, weil drei Dateien es unterschiedlich sagen.
            # `laufen NICHT von selbst` steht in ARCHITECTURE.md mitten im
            # Fettsatz, nicht als Ueberschrift.
            r'(\*\*Not running by default:\*\*|\*\*Läuft NICHT von selbst:\*\*'
            r'|\*\*`[^`]+`[^*]*lauf(?:en|t) NICHT von selbst).*?(?=\n\n)',
            '',
            text,
            flags=re.S,
        )

    # Fuer ALLE geprueften Dateien, nicht nur die beiden im Wurzelordner. Die
    # Feature-Doku beschreibt Ablaeufe ("MinIO -> Indexer -> Textlayer"), und genau
    # dort faellt ein abgeschalteter Dienst am wenigsten auf (23.08.2026).
    for datei in DATEIEN:
        pfad = os.path.join(WURZEL, datei)
        if not os.path.exists(pfad):
            continue
        text = ohne_ausnahme(open(pfad, encoding='utf-8').read())
        for dienst in sorted(mit_profil):
            if re.search(rf'`{re.escape(dienst)}`', text):
                fehler.append(
                    f'{datei}: nennt `{dienst}` ausserhalb der Ausnahme, '
                    f'der Dienst steht aber hinter einem compose-Profil und laeuft nicht von selbst'
                )

    if fehler:
        print('Anleitungen: Befunde')
        for f in fehler:
            print(f'  {f}')
        return 1

    print(
        f'   Anleitungen: {len(DATEIEN)} Dateien geprueft, {len(alle)} Dienste bekannt, '
        f'{nicht_geprueft} Angaben nicht als Pfad gewertet, keine Befunde'
    )
    return 0


if __name__ == '__main__':
    if '--wurzel' in sys.argv:
        WURZEL = os.path.abspath(sys.argv[sys.argv.index('--wurzel') + 1])
    sys.exit(main())
