#!/usr/bin/env python3
"""Haelt den Geruest-Befehl und das Backend zusammen (Plan 023 H2).

Die Wahrheit ueber ein gueltiges Manifest steht im Backend, in
`extensionPackage.validiereManifest`. Der Geruest-Befehl laeuft in der Sandbox
und kommt dort nicht heran; er prueft dieselben Regeln noch einmal.

Zwei Wahrheiten sind ein Fehler, es sei denn, jemand haelt sie zusammen. Das
tut diese Pruefung: weichen die Listen ab, faellt die CI um, statt dass ein
Bauer in der Werkstatt ein Manifest schreibt, das der Watcher still ablehnt.

Genau dieser Fall ist am 22.08.2026 eingetreten: drei neue Faehigkeiten hatten
Routen, Dienste und Tests, standen aber nicht in der Liste des Backends.
"""

import argparse
import re
import sys
from pathlib import Path

BACKEND_REL = 'apps/dashboard-backend/src/services/extensions/extensionPackage.js'
SKRIPT_REL = 'services/sandbox/erweiterung.sh'


def liste_aus_js(quelle: str, name: str) -> list[str]:
    """Eine JS-Konstante als Liste von Zeichenketten lesen."""
    treffer = re.search(rf'const {name} = \[(.*?)\];', quelle, re.S)
    if not treffer:
        raise SystemExit(f'{name} steht nicht mehr in {BACKEND_REL}')
    return re.findall(r"'([^']+)'", treffer.group(1))


def liste_aus_sh(quelle: str, name: str) -> list[str]:
    treffer = re.search(rf'^{name}="([^"]*)"', quelle, re.M)
    if not treffer:
        raise SystemExit(f'{name} steht nicht mehr in {SKRIPT_REL}')
    return treffer.group(1).split()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        '--wurzel',
        default=str(Path(__file__).resolve().parents[2]),
        help='Projektwurzel (fuer den Waechter-Selbsttest)',
    )
    args = p.parse_args()
    wurzel = Path(args.wurzel)
    js = (wurzel / BACKEND_REL).read_text(encoding='utf-8')
    sh = (wurzel / SKRIPT_REL).read_text(encoding='utf-8')
    fehler = []

    faehig_js = liste_aus_js(js, 'BRUECKE_FAEHIGKEITEN')
    faehig_sh = liste_aus_sh(sh, 'FAEHIGKEITEN')
    if sorted(faehig_js) != sorted(faehig_sh):
        fehler.append(
            'Faehigkeiten weichen ab:\n'
            f'  Backend:  {" ".join(sorted(faehig_js))}\n'
            f'  Werkstatt:{" ".join(sorted(faehig_sh))}'
        )

    typen_js = re.search(r"const EXTENSION_TYPES = \[(.*?)\]", js, re.S)
    if typen_js:
        typen = re.findall(r"'([^']+)'", typen_js.group(1))
        if sorted(typen) != sorted(liste_aus_sh(sh, 'TYPEN')):
            fehler.append('Typen weichen ab')

    # Das Id-Muster steht in beiden als regulaerer Ausdruck, aber in
    # verschiedenen Dialekten. Verglichen wird deshalb das VERHALTEN an den
    # Raendern, nicht der Text.
    muster_sh = re.search(r"^ID_MUSTER='([^']+)'", sh, re.M)
    if not muster_sh:
        fehler.append('ID_MUSTER steht nicht mehr im Geruest-Befehl')
    else:
        prueflinge = {
            'a': True, 'ab': True, 'meine-app': True, 'app1': True,
            '-app': False, 'app-': False, 'Meine-App': False, '': False,
            'a' * 50: True, 'a' * 51: False,
        }
        p = re.compile(muster_sh.group(1))
        for wert, erwartet in prueflinge.items():
            if bool(p.match(wert)) != erwartet:
                fehler.append(
                    f'ID_MUSTER: "{wert[:12]}" ist {"nicht " if erwartet else ""}erlaubt, '
                    f'sollte es aber {"" if erwartet else "nicht "}sein'
                )

    if fehler:
        print('Geruest-Regeln: Backend und Werkstatt weichen ab\n')
        for f in fehler:
            print(f'  {f}')
        print(
            '\nDie Wahrheit steht im Backend '
            '(extensionPackage.validiereManifest). Der Geruest-Befehl in '
            'services/sandbox/erweiterung.sh spiegelt sie, damit die Werkstatt '
            'ohne Netz pruefen kann. Bitte nachziehen.'
        )
        return 1

    print(f'   Geruest-Regeln: gleich ({len(faehig_js)} Faehigkeiten)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
