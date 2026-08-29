#!/usr/bin/env python3
"""Haelt das Baustein-Set (Plan 023 C1 und C2).

Warum es diesen Waechter gibt
-----------------------------
Vor Phase C standen zwanzig Kopfstellen mit derselben Klassenkette in elf
Dateien, vier verschieden gebaute Tab-Leisten und fuenf Arten, eine Feldgruppe
zu trennen. Das ist nicht durch Nachlaessigkeit entstanden, sondern dadurch,
dass die naechste Seite die Klassen der vorigen kopiert hat. Einmal von Hand
aufraeumen haelt das nicht auf; morgen kopiert die uebernaechste Seite wieder.

Geprueft wird deshalb die Abwesenheit der Handarbeit, nicht die Anwesenheit der
Bausteine. Wer eine Seite baut, soll `Kopf`, `Section` und `FilterBar`
benutzen, weil der Weg daran vorbei versperrt ist.

Was gemeldet wird
-----------------
In allem unter `src/`, ausser `src/components/ui/`:

1. `<h1>`                     Der Seitentitel gehoert in `Kopf` (`@marken`).
2. `pb-6 border-b border-border`
   und `mb-8 pb-6 border-b`   Die Trennlinie einer Feldgruppe gehoert in `Section`.
3. `border-b-2` an einem Knopf
   in einer Leiste             Eine Tab-Leiste gehoert in `FilterBar`.
4. `role="dialog"` von Hand   Ein Dialog gehoert in `Modal` (auf Radix).
5. Ein Name, den `@marken` schon ausgibt, noch einmal in der Shell erklaert
   -- oder ein Import aus dem alten `components/ui/shadcn/` (Phase H3).
6. Ein Primitiv ODER Muster ohne Schaustueck auf `/entwickler/bausteine`
   (Phase H3, um die Muster erweitert in H4).

Zur vierten Regel: am 20.08.2026 trugen fuenf Dateien `role="dialog"` selbst,
waehrend fuenf andere den gemeinsamen `Modal` benutzen. VIER der fuenf
behaupteten `aria-modal="true"`, und ZWEI davon hatten keine Tabulatorfalle.
Der Fokus lief also aus einem Dialog heraus, der sich als geschlossen ausgibt.
Genau diesen Fehler hat Plan 023 C4 im OnboardingWizard in vier Anlaeufen von
Hand behoben, mitsamt drei Sonderfaellen (erstes Tab, erstes Shift+Tab, und ein
Knopf, der sich selbst entfernt, waehrend er den Fokus haelt). Radix hat das
alles geprueft eingebaut. Eine handgebaute Dialogmechanik ist deshalb kein
Geschmack, sondern eine Wette gegen eine getestete Bibliothek.

Was NICHT gemeldet wird
-----------------------
`src/components/ui/` selbst, denn dort stehen die Bausteine. Testdateien, denn
ein Test darf pruefen, was er will. Bis zum 20.08.2026 blieben auch grosse
Teile von `src/` ungeprueft, weil nur `features/` und `components/layout/`
durchsucht wurden; darin verschwand ein handgebauter Dialog. Und `<h2>` bis `<h4>`: eine Ueberschrift
innerhalb eines Abschnitts ist erlaubt, nur der Seitentitel ist es nicht.

Was er NICHT sehen kann
-----------------------
Der Waechter liest Zeile fuer Zeile und kennt keinen Syntaxbaum. Ein ueber zwei
Zeilen umgebrochenes `<h1\n  className=...>` und eine Klasse, die erst zur
Laufzeit aus `cn()` oder einer Zeichenkettenschablone entsteht, rutschen durch.
Das ist bewusst in Kauf genommen: der Fehler, den er abfangen soll, ist das
Kopieren einer fertigen Klassenkette von der vorigen Seite, und die kommt am
Stueck. Wer sich auf ihn verlaesst, soll aber wissen, wo seine Grenze liegt.

Umgekehrt gilt dasselbe: `border-b-2` heisst hier "Tab-Leiste", weil das heute
die einzige Verwendung ist. Wer die Klasse eines Tages fuer eine dicke Linie
benutzt, die keine Leiste ist, wird trotzdem gemeldet. Einen Ausweg fuer eine
einzelne Zeile gibt es nicht, nur den Eintrag der ganzen Datei in AUSNAHMEN.
Das ist die richtige Reibung: eine zweite Bedeutung fuer dieselbe Klasse ist
selbst schon ein Befund.

Ausnahmen
---------
`AUSNAHMEN` traegt Pfade, die aus einem genannten Grund ausserhalb stehen. Ein
Eintrag ohne Grund ist keiner.

Aufruf
------
    python3 scripts/test/bausteine.py --pfad .
"""

import argparse
import re
import sys
from pathlib import Path

AUSNAHMEN = {
    # Die Detailseite im Store traegt eine feste Kopfleiste mit Zurueck-Knopf,
    # Symbol und Abzeichen. Das ist eine andere Form als der Seitenkopf einer
    # Einstellungsseite, und den Kopf dafuer aufzubohren hiesse, einen
    # Baustein fuer einen einzigen Aufrufer zu verbiegen.
    'src/features/store/StoreDetailPage.tsx': 'feste Kopfleiste mit Zurueck-Knopf, andere Form',
    # Bis Phase B4 (26.08.2026) standen hier vier handgebaute Dialoge aus der
    # Zeit vor der vierten Regel (OnboardingWizard, KiZugangDialog, QuickOpen,
    # TipTapEditor) und der ArgumentPicker der Flows. Alle fuenf Dateien sind
    # mit B2 bis B4 gefallen; ein Eintrag fuer eine Datei, die es nicht gibt,
    # haelt den Waechter gruen, ohne etwas zu pruefen.
}

# --------------------------------------------------------------------------
# Die fuenfte Regel: kein Primitiv doppelt (Phase H3, 29.08.2026)
# --------------------------------------------------------------------------
# Seit H3 stehen die Primitive in `packages/marken/src/primitive/` und die
# Shell holt sie ueber `@marken`. Der Rueckweg ist das Risiko: wer morgen
# einen Knopf braucht und die Bibliothek nicht kennt, schreibt sich einen --
# und dann gibt es zwei Knoepfe, von denen einer dem Thema folgt und der
# andere nicht. Genau so sind vor Plan 023 zwanzig Kopfstellen entstanden.
#
# Geprueft wird die ANWESENHEIT eines zweiten Bausteins mit demselben Namen,
# nicht die Abwesenheit von Handarbeit -- ein Name ist das, was ein Aufrufer
# tippt, und zwei Dinge unter einem Namen sind die Verwechslung selbst.
PRIMITIV_BARREL = 'packages/marken/src/primitive/index.ts'
SHELL_DEKLARATION = re.compile(
    r'^export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)\b'
)
ALTER_SHADCN_PFAD = re.compile(r"""from\s+['"][^'"]*components/ui/shadcn/""")


def primitivnamen(wurzel: Path) -> set[str]:
    """Die Namen, die `packages/marken/src/primitive/index.ts` ausgibt."""
    datei = wurzel / PRIMITIV_BARREL
    if not datei.is_file():
        return set()
    namen: set[str] = set()
    for gruppe in re.findall(r'export\s+(?:type\s+)?\{([^}]*)\}', datei.read_text(encoding='utf-8')):
        for teil in gruppe.split(','):
            teil = teil.strip()
            if teil and not teil.startswith('type '):
                namen.add(teil.split(' as ')[-1].strip())
    return namen


def primitive_doppelt(wurzel: Path) -> list[str]:
    befunde: list[str] = []
    namen = primitivnamen(wurzel)
    ordner = wurzel / 'apps/dashboard-frontend/src'
    if not namen or not ordner.is_dir():
        return befunde
    for datei in sorted(list(ordner.rglob('*.tsx')) + list(ordner.rglob('*.ts'))):
        if '__tests__' in datei.parts or datei.name.endswith(('.test.tsx', '.test.ts')):
            continue
        relativ = datei.relative_to(wurzel / 'apps/dashboard-frontend').as_posix()
        for nr, zeile in enumerate(datei.read_text(encoding='utf-8').splitlines(), 1):
            treffer = SHELL_DEKLARATION.match(zeile)
            if treffer and treffer.group(1) in namen:
                befunde.append(
                    f'{relativ}:{nr}  {treffer.group(1)} gibt es schon in @marken -- '
                    'zwei Bausteine unter einem Namen sind die Verwechslung selbst.'
                )
            if ALTER_SHADCN_PFAD.search(zeile):
                befunde.append(
                    f'{relativ}:{nr}  Import aus components/ui/shadcn/ -- '
                    'die Primitive stehen seit H3 in @marken.'
                )
    return befunde


SCHAUSEITE = 'apps/dashboard-frontend/src/features/entwickler/'

# Wo die Bausteine liegen, die ein Schaustueck brauchen -- und wie das Stueck
# in der Meldung heisst. Seit H4 sind es zwei Saetze: die Primitive und die
# MUSTER (`Datenliste`, `Suchauswahl`, …), die aus ihnen zusammengesetzt sind.
# Ein Muster hat mehr Zustaende als ein Primitiv, nicht weniger -- leer,
# gefuellt, gefiltert-und-leer, ladend, und unter 900 px eine andere Form --,
# und genau die sieht sonst niemand an.
SCHAU_ORDNER = [
    ('packages/marken/src/primitive', 'Primitiv'),
    ('packages/marken/src/muster', 'Muster'),
]


def schauseite_vollstaendig(wurzel: Path) -> list[str]:
    """Jedes Primitiv und jedes Muster steht auf der Schauseite (H3, H4).

    Die Schauseite ist der einzige Ort, an dem ein Baustein, den heute niemand
    benutzt, ueberhaupt zu sehen ist -- und genau der ist der gefaehrliche: er
    sieht in einem der beiden Themes falsch aus, und es merkt erst der, der ihn
    in einem halben Jahr zum ersten Mal einsetzt. Ein neuer Baustein ohne
    Schaustueck faellt sonst durch jede Abnahme dieses Repos.

    Verglichen werden DATEINAMEN und nicht Ausgaben: `dialog.tsx` gibt zehn
    Namen aus, ist aber ein Stueck. Aus `alert-dialog` wird `AlertDialog`.

    OHNE RUECKSICHT AUF GROSS- UND KLEINSCHREIBUNG. Der Dateiname sagt nicht,
    wie der Baustein geschrieben wird: aus `input-otp.tsx` wuerde `InputOtp`,
    und der Aufrufer tippt `InputOTP`. Das Schaustueck soll den Namen tragen,
    den ein Mensch tippt; verglichen werden deshalb die Buchstaben, nicht ihre
    Groesse.

    GELESEN WIRD DER GANZE ORDNER `entwickler/` und nicht mehr die eine Datei:
    seit H4 verteilt sich die Seite auf drei (Rahmen, H4-Stuecke, Muster),
    weil dreiundfuenfzig Stuecke in einer Datei niemand mehr findet.
    """
    seiten = wurzel / SCHAUSEITE
    if not seiten.is_dir():
        return []
    text = '\n'.join(
        datei.read_text(encoding='utf-8') for datei in sorted(seiten.rglob('*.tsx'))
    )
    gezeigt = {name.lower() for name in re.findall(r'name="([A-Z]\w+)"', text)}

    befunde: list[str] = []
    for pfad, art in SCHAU_ORDNER:
        ordner = wurzel / pfad
        if not ordner.is_dir():
            continue
        for datei in sorted(ordner.glob('*.tsx')):
            name = ''.join(teil.capitalize() for teil in datei.stem.split('-'))
            if name.lower() not in gezeigt:
                befunde.append(
                    f'{SCHAUSEITE}  {name} hat kein Schaustueck -- ein {art}, das '
                    'niemand ansieht, ist eines, dessen Fehler niemand findet.'
                )
    return befunde


REGELN = [
    (
        re.compile(r'<h1[\s>]'),
        'Seitentitel von Hand. Gehoert in Kopf (packages/marken/src/Kopf.tsx).',
    ),
    (
        re.compile(r'pb-6 border-b border-border'),
        'Feldgruppen-Trennlinie von Hand. Gehoert in Section (components/ui/Section.tsx).',
    ),
    (
        re.compile(r'border-b-2\b'),
        'Tab-Leiste von Hand. Gehoert in FilterBar (components/ui/FilterBar.tsx).',
    ),
    (
        # Fasst alle vier Schreibweisen: role="dialog", role='dialog',
        # role={'dialog'} und role={"dialog"}. Ein zur Laufzeit berechnetes
        # role bleibt unsichtbar, so wie bei den anderen Regeln auch.
        re.compile(r'''role=(?:['"]dialog['"]|\{\s*['"]dialog['"]\s*\})'''),
        'Dialogmechanik von Hand. Gehoert in Modal (components/ui/Modal.tsx, auf Radix).',
    ),
]

# Geprueft wird alles unter src/, ausser den Bausteinen selbst und den
# generierten shadcn-Teilen. Bis zum 20.08.2026 standen hier nur `features` und
# `components/layout`, und genau dadurch war `components/editor/tiptap/
# TipTapEditor.tsx` unsichtbar: ein handgebauter Dialog, den derselbe PR in
# seiner eigenen Beschreibung aufzaehlte. Ein Waechter, dessen Suchbereich
# kleiner ist als sein Anspruch, meldet Ruhe, wo keine ist.
WURZELN = ['apps/dashboard-frontend/src']

AUSGENOMMENE_ORDNER = (
    'apps/dashboard-frontend/src/components/ui',  # dort stehen die Bausteine selbst
)


def pruefe(wurzel: Path) -> list[str]:
    befunde = []
    for basis in WURZELN:
        ordner = wurzel / basis
        if not ordner.is_dir():
            continue
        for datei in sorted(ordner.rglob('*.tsx')):
            voll = datei.relative_to(wurzel).as_posix()
            if any(voll.startswith(a + '/') for a in AUSGENOMMENE_ORDNER):
                continue
            relativ = datei.relative_to(wurzel / 'apps/dashboard-frontend').as_posix()
            if '__tests__' in datei.parts or datei.name.endswith('.test.tsx'):
                continue
            if relativ in AUSNAHMEN:
                continue
            for nr, zeile in enumerate(datei.read_text(encoding='utf-8').splitlines(), 1):
                for muster, grund in REGELN:
                    if muster.search(zeile):
                        befunde.append(f'{relativ}:{nr}  {grund}')
    return befunde


def main() -> int:
    zerleger = argparse.ArgumentParser()
    zerleger.add_argument('--pfad', default='.')
    argumente = zerleger.parse_args()
    wurzel = Path(argumente.pfad).resolve()

    befunde = pruefe(wurzel) + primitive_doppelt(wurzel) + schauseite_vollstaendig(wurzel)
    if not befunde:
        print('   Baustein-Set: eingehalten')
        return 0

    print('Handarbeit statt Baustein:')
    for zeile in befunde:
        print(f'  {zeile}')
    print('')
    print('Entweder den Baustein benutzen, oder mit Grund in AUSNAHMEN eintragen.')
    return 1


if __name__ == '__main__':
    sys.exit(main())
