#!/usr/bin/env python3
"""Hoechstens ein Plan in docs/plans/active/.

Warum es diese Pruefung gibt: am 20.08.2026 lagen dort vier Eintraege, drei
davon aus der Zeit vor dem laufenden Plan. `CLAUDE.md` nannte als "den einen
Faden" eine Roadmap-Seite, die den laufenden Plan gar nicht kennt. Eine frische
Sitzung liest die naechstbeste Datei und arbeitet am falschen Ding. Das ist
keine Theorie, es ist an genau dieser Stelle passiert.

Ein Ordner mit zwei Plaenen darin sagt nicht, welcher gilt. Also darf es ihn
nicht geben. Wer einen neuen Plan anfaengt, raeumt den alten vorher weg:
nach `done/`, wenn er fertig ist, sonst nach `paused/` mit einem Absatz im
dortigen README, warum er ruht und was offen ist.

Seit dem 23.08.2026 prueft dieselbe Datei noch etwas Zweites: dass keine
abgeschriebene Aufgabenzahl im Umlauf ist. An diesem Tag standen drei
verschiedene Zahlen fuer dieselbe Sache im Repo — der Plan sagte 61, CLAUDE.md
sagte 64, und gezaehlt waren es 66. Beide abgeschriebenen Zahlen waren falsch,
und niemand haette es gemerkt, weil eine Zahl in einem Fliesstext nicht
auffaellt.

Die Regel dahinter ist aelter als dieser Fund: nichts abschreiben, was
hergeleitet werden kann. Eine Zahl, die von Hand gepflegt werden muss, ist ab
dem naechsten Zug falsch. Entweder sie wird geprueft, oder sie gehoert nicht
in den Text.

Seit dem 26.08.2026 darf der Ordner leer sein. An diesem Tag hat der
Ueberordner-Plan (`arasul/roadmap/plans/aktiv/`, nicht oeffentlich) den Plan
024 abgeloest; was dieses Repo bis wann koennen muss, steht seither dort und
nicht mehr hier. Ein leerer Ordner heisst: der Faden liegt im Ueberordner.
Zwei Plaene heissen weiterhin: niemand weiss, welcher gilt.

Rueckgabe: 0 wenn hoechstens ein Plan dort liegt und jede Aufgabenzahl stimmt,
1 sonst.
"""
import argparse
import re
import sys
from pathlib import Path


def plaene(ordner: Path) -> tuple[list[Path], list[Path]]:
    """Ein Plan ist eine .md- oder .html-Datei oder ein Ordner mit plan.md.

    Liefert zwei Listen: die Plaene und alles andere. Der zweite Teil ist
    Absicht. Wer nur zaehlt, was er erkennt, meldet gruen, waehrend im Ordner
    ein halb umbenannter Plan ohne plan.md oder ein liegengebliebener
    Anhangsordner steht. Genau diese Sorte blinder Fleck ist der Grund, warum
    es diese Pruefung ueberhaupt gibt.
    """
    gefunden = []
    fremd = []
    for eintrag in sorted(ordner.iterdir()):
        if eintrag.name.startswith('.') or eintrag.name == 'README.md':
            continue
        if eintrag.is_dir():
            if (eintrag / 'plan.md').exists():
                gefunden.append(eintrag)
            else:
                fremd.append(eintrag)
        elif eintrag.suffix in ('.md', '.html'):
            gefunden.append(eintrag)
        else:
            fremd.append(eintrag)
    return gefunden, fremd


AUFGABE = re.compile(r'^## [A-K][0-9]', re.MULTILINE)
GENANNT = re.compile(r'(\d+)\s+Aufgaben')


def aufgabenzahlen(wurzel: Path, plan: Path) -> int:
    """Jede genannte Aufgabenzahl muss der gezaehlten entsprechen.

    Gezaehlt wird so, wie CLAUDE.md es vormacht: Ueberschriften der Form
    `## <Phase><Nummer>`. Steht die Zahl nirgends, ist das in Ordnung — eine
    weggelassene Zahl kann nicht falsch sein.
    """
    plandatei = plan / 'plan.md' if plan.is_dir() else plan
    if not plandatei.exists():
        return 0

    text = plandatei.read_text(encoding='utf-8')
    gezaehlt = len(AUFGABE.findall(text))

    befunde = []
    for datei in (plandatei, wurzel / 'CLAUDE.md'):
        if not datei.exists():
            continue
        for nummer, zeile in enumerate(datei.read_text(encoding='utf-8').splitlines(), 1):
            for treffer in GENANNT.finditer(zeile):
                if int(treffer.group(1)) != gezaehlt:
                    befunde.append((datei, nummer, treffer.group(1)))

    if not befunde:
        print(f'   Aufgabenzahl: {gezaehlt}, ueberall gleich')
        return 0

    print(f'   Aufgabenzahl: gezaehlt sind es {gezaehlt}, im Text steht etwas anderes:')
    for datei, nummer, hat in befunde:
        try:
            zeigepfad = datei.relative_to(wurzel)
        except ValueError:
            zeigepfad = datei
        print(f'     {zeigepfad}:{nummer} sagt {hat}')
    print('   Entweder die Zahl richtigstellen oder sie ganz weglassen und den')
    print("   Zaehlbefehl danebenschreiben. Eine von Hand gepflegte Zahl ist ab")
    print('   dem naechsten Zug falsch.')
    return 1


def main() -> int:
    zerleger = argparse.ArgumentParser(description=__doc__)
    zerleger.add_argument('--pfad', default='.', help='Wurzel des Repos')
    args = zerleger.parse_args()

    ordner = Path(args.pfad) / 'docs' / 'plans' / 'active'
    if not ordner.is_dir():
        print(f'   Der Faden: {ordner} gibt es nicht')
        return 1

    gefunden, fremd = plaene(ordner)
    if fremd:
        print(f'   Der Faden: {len(fremd)} Eintrag/Eintraege in docs/plans/active/,')
        print('   die kein Plan sind:')
        for eintrag in fremd:
            print(f'     {eintrag.name}')
        print('   Ein Ordner ohne plan.md ist entweder ein halb umbenannter Plan')
        print('   oder gehoert nicht hierher. Beides muss aufgeloest werden.')
        return 1

    if len(gefunden) == 1:
        print(f'   Der Faden: genau einer, {gefunden[0].name}')
        return aufgabenzahlen(Path(args.pfad), gefunden[0])

    if not gefunden:
        print('   Der Faden: keiner hier, docs/plans/active/ ist leer.')
        print('   Der laufende Plan liegt im Ueberordner (arasul/roadmap/plans/aktiv/).')
        return 0

    print(f'   Der Faden: {len(gefunden)} Plaene in docs/plans/active/')
    for eintrag in gefunden:
        print(f'     {eintrag.name}')
    print('   Genau einer darf dort liegen. Die anderen nach docs/plans/done/,')
    print('   wenn sie fertig sind, sonst nach docs/plans/paused/ mit einem')
    print('   Absatz im dortigen README.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
