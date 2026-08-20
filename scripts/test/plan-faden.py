#!/usr/bin/env python3
"""Genau ein Plan in docs/plans/active/.

Warum es diese Pruefung gibt: am 20.08.2026 lagen dort vier Eintraege, drei
davon aus der Zeit vor dem laufenden Plan. `CLAUDE.md` nannte als "den einen
Faden" eine Roadmap-Seite, die den laufenden Plan gar nicht kennt. Eine frische
Sitzung liest die naechstbeste Datei und arbeitet am falschen Ding. Das ist
keine Theorie, es ist an genau dieser Stelle passiert.

Ein Ordner mit zwei Plaenen darin sagt nicht, welcher gilt. Also darf es ihn
nicht geben. Wer einen neuen Plan anfaengt, raeumt den alten vorher weg:
nach `done/`, wenn er fertig ist, sonst nach `paused/` mit einem Absatz im
dortigen README, warum er ruht und was offen ist.

Rueckgabe: 0 wenn genau ein Plan dort liegt, 1 sonst.
"""
import argparse
import sys
from pathlib import Path


def plaene(ordner: Path) -> list[Path]:
    """Ein Plan ist eine .md- oder .html-Datei oder ein Ordner mit plan.md."""
    gefunden = []
    for eintrag in sorted(ordner.iterdir()):
        if eintrag.name.startswith('.') or eintrag.name == 'README.md':
            continue
        if eintrag.is_dir():
            if (eintrag / 'plan.md').exists():
                gefunden.append(eintrag)
        elif eintrag.suffix in ('.md', '.html'):
            gefunden.append(eintrag)
    return gefunden


def main() -> int:
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument('--pfad', default='.', help='Wurzel des Repos')
    args = zerleger.parse_args()

    ordner = Path(args.pfad) / 'docs' / 'plans' / 'active'
    if not ordner.is_dir():
        print(f'   Der Faden: {ordner} gibt es nicht')
        return 1

    gefunden = plaene(ordner)
    if len(gefunden) == 1:
        print(f'   Der Faden: genau einer, {gefunden[0].name}')
        return 0

    if not gefunden:
        print('   Der Faden: KEINER. docs/plans/active/ ist leer.')
        print('   Entweder ist nichts in Arbeit, dann gehoert das in das')
        print('   Steuer-Repo, oder ein Plan wurde verschoben und nicht ersetzt.')
        return 1

    print(f'   Der Faden: {len(gefunden)} Plaene in docs/plans/active/')
    for eintrag in gefunden:
        print(f'     {eintrag.name}')
    print('   Genau einer darf dort liegen. Die anderen nach docs/plans/done/,')
    print('   wenn sie fertig sind, sonst nach docs/plans/paused/ mit einem')
    print('   Absatz im dortigen README.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
