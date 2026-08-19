#!/usr/bin/env python3
"""Gedankenstriche als Trenner finden (Plan 023 B6).

Arasul schreibt keine Gedankenstriche als Trenner. Nicht in der Oberflaeche,
nicht in Meldungen, nicht im Code. Ein Komma, ein Doppelpunkt oder ein Punkt
sagt dasselbe und liest sich in einer deutschen Zeile ruhiger.

Was geprueft wird
-----------------
Der Quelltext von Frontend und Backend, aber OHNE Kommentare. Ein Kommentar ist
kein Text, den jemand liest, der das Produkt benutzt; er nachtraeglich zu
saeubern haette den Durchgang verdreifacht, ohne dass ein Kunde etwas davon
merkt. Wer beim Schreiben eines Kommentars einen Gedankenstrich setzt, macht
also nichts falsch.

Geprueft wird JEDE Zeichenkette im Quelltext, auch eine englische. Die
Alternative waere, deutsche von englischer Sprache zu erkennen, und das ist
weder zuverlaessig noch den Aufwand wert: die englischen Zeichenketten im
Backend sind Protokollzeilen aus der Zeit vor der Umstellung und werden mit der
Zeit ohnehin deutsch. Eine Regel, die je nach vermuteter Sprache anders gilt,
waere schwerer zu befolgen als eine, die ueberall gilt.

Fuer ganze DOKUMENTE gilt das nicht: docs/integrations/N8N_OVERVIEW.md ist eine
englische Kundenunterlage, dort ist der Gedankenstrich richtig gesetzt. Der
Unterschied ist Prosa gegen Zeichenkette, nicht Deutsch gegen Englisch.

Was NICHT gemeldet wird
-----------------------
Ein alleinstehender Geviertstrich als Platzhalter fuer "kein Wert", wie er in
Tabellenzellen ueblich ist (`wert ?? '—'`). Das ist kein Trenner, sondern ein
Zeichen fuer eine Leerstelle, und die Regel meint ausdruecklich den Trenner.
Erkannt wird das daran, dass links und rechts kein Wort steht.

Aufruf
------
    python3 scripts/test/gedankenstriche.py [--pfad <wurzel>]

Rueckgabe 1, wenn etwas gefunden wurde. Laeuft in jedem Testlauf mit.
"""

import argparse
import glob
import os
import re
import sys

# Ein Wort links oder rechts vom Strich macht ihn zum Trenner. Anfuehrungs- und
# Klammerzeichen dazwischen zaehlen nicht als Trennung, `„Wort" — Wort` ist
# derselbe Fall.
TRENNER = re.compile(r'\w[\s»«„"\')\]]*—|—[\s»«„"\'(\[]*\w')

STRICHE = '—'  # Geviertstrich. Der Halbgeviertstrich (–) ist in Zahlenbereichen
# ("2024–2026") richtig und wird deshalb nicht gemeldet.


def ohne_kommentare(text):
    """Zeilen- und Blockkommentare entfernen, Zeichenketten unangetastet lassen.

    Bewusst ein kleiner Handparser statt einer Bibliothek: er muss nur wissen,
    dass ein `//` innerhalb einer Zeichenkette kein Kommentar ist. Damit die
    Zeilennummern stimmen, wird jeder entfernte Zeilenumbruch behalten.
    """
    aus = []
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if c == '/' and i + 1 < n and text[i + 1] == '/':
            j = text.find('\n', i)
            i = n if j < 0 else j
        elif c == '/' and i + 1 < n and text[i + 1] == '*':
            j = text.find('*/', i + 2)
            ende = n if j < 0 else j + 2
            aus.append('\n' * text.count('\n', i, ende))
            i = ende
        elif c in '"\'`':
            quote = c
            aus.append(c)
            i += 1
            while i < n:
                if text[i] == '\\':
                    aus.append(text[i:i + 2])
                    i += 2
                    continue
                aus.append(text[i])
                if text[i] == quote:
                    i += 1
                    break
                i += 1
        else:
            aus.append(c)
            i += 1
    return ''.join(aus)


def pruefe_datei(pfad):
    """Liste von (zeilennummer, zeile) mit einem Gedankenstrich als Trenner."""
    try:
        text = open(pfad, encoding='utf8').read()
    except (OSError, UnicodeDecodeError):
        return []
    if STRICHE not in text:
        return []

    treffer = []
    for nummer, zeile in enumerate(ohne_kommentare(text).split('\n'), start=1):
        if STRICHE in zeile and TRENNER.search(zeile):
            treffer.append((nummer, zeile.strip()))
    return treffer


def sammle(wurzel):
    muster = [
        'apps/dashboard-frontend/src/**/*.tsx',
        'apps/dashboard-frontend/src/**/*.ts',
        'apps/dashboard-backend/src/**/*.js',
    ]
    dateien = []
    for m in muster:
        for pfad in glob.glob(os.path.join(wurzel, m), recursive=True):
            if 'node_modules' not in pfad:
                dateien.append(pfad)
    return sorted(dateien)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pfad', default=os.path.join(os.path.dirname(__file__), '..', '..'))
    args = parser.parse_args()
    wurzel = os.path.abspath(args.pfad)

    gefunden = 0
    for pfad in sammle(wurzel):
        for nummer, zeile in pruefe_datei(pfad):
            if gefunden == 0:
                print('Gedankenstriche als Trenner:')
            gefunden += 1
            kurz = zeile if len(zeile) <= 100 else zeile[:97] + '...'
            print(f'  {os.path.relpath(pfad, wurzel)}:{nummer}  {kurz}')

    if gefunden == 0:
        print('Gedankenstriche als Trenner: keine')
        return 0

    print('')
    print(f'{gefunden} Stellen. Ersetze den Strich durch Komma, Doppelpunkt oder Punkt.')
    print('Ein alleinstehendes — als Platzhalter fuer "kein Wert" ist erlaubt und wird')
    print('nicht gemeldet; gemeint ist der Trenner mitten im Satz.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
