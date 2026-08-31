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
Bausteine. Wer eine Seite baut, soll `Kopf`, `Feldgruppe` und `Tabs` aus
`@marken` benutzen, weil der Weg daran vorbei versperrt ist.

Was gemeldet wird
-----------------
In ALLEM unter `src/`, ohne Ausnahme (siehe „Der Ausnahmeordner ist weg"):

1. `<h1>`                     Der Seitentitel gehoert in `Kopf` (`@marken`).
2. `pb-6 border-b border-border`
   und `mb-8 pb-6 border-b`   Die Trennlinie einer Feldgruppe gehoert in
                              `Feldgruppe` (`@marken`).
3. `border-b-2` an einem Knopf
   in einer Leiste             Eine Tab-Leiste gehoert in `Tabs` (`@marken`).
4. `role="dialog"` von Hand   Ein Dialog gehoert in `Dialogform` (`@marken`,
                              auf Radix).
5. Ein Name, den `@marken` schon ausgibt, noch einmal in der Shell erklaert
   -- oder ein Import aus dem alten `components/ui/shadcn/` (Phase H3).
6. Ein Primitiv ODER Muster ohne Schaustueck auf `/entwickler/bausteine`
   (Phase H3, um die Muster erweitert in H4).
7. Eine Farbe ausserhalb der Palette (Auftrag farben-blau-grau-rot,
   30.08.2026). Die Palette ist Blau, Grau, Rot -- Gruen und Orange sind
   gestrichen, weil jede weitere Farbe von einer App als Freibrief fuer
   eigene gelesen wird. Gemessen wird an DREI Stellen: im TSX der Shell darf
   kein Hex, kein `rgb()` und keine Klasse aus Tailwinds Palette stehen
   (`text-green-500` ist ein Farbliteral in anderer Schreibweise); in jedem
   CSS ausser `theme.css` steht ein Hex nur als Wert eines Tokens (in
   `marken.css` nur als Rueckfall `var(--x, #hex)`); und JEDER Farbwert in
   irgendeinem CSS -- auch in `theme.css` -- hat den Farbton von Blau, Rot
   oder gar keinen. Ein gruener Token, den niemand benutzt, ist morgen der,
   den jemand benutzt.

Der Ausnahmeordner ist weg (Phase H5)
-------------------------------------
Bis H4 war `src/components/ui/` ausgenommen, und das war richtig, solange die
Bausteine DORT standen: ein Waechter, der `FilterBar` meldet, weil `FilterBar`
eine Tab-Leiste ist, meldet die Loesung als Problem.

Seit H5 stehen sie nicht mehr dort. `Modal` und `ConfirmModal` heissen jetzt
`Dialogform` und `Bestaetigung`, `StatTile`/`StatGrid` heissen `Kennzahl` und
`Kennzahlen`, und `FilterBar` ist ganz gefallen -- es war eine zweite
Tab-Leiste neben dem Primitiv `Tabs`. Was in `components/ui/` blieb, weiss
ueber DIESES Geraet Bescheid (`AuthCard` mit dem Maskottchen und dem
Produktnamen, `SkeletonList` mit der Form einer Zeile hier, `ErrorBoundary`,
`NichtGefunden`) -- und keines davon braucht die Ausnahme.

Damit ist der Waechter zum ersten Mal SCHARF: ein `h1`, eine Tab-Leiste, eine
Feldgruppen-Trennlinie oder ein handgebauter Dialog ist ueberall in `src/` ein
Befund. Ein Ordner, in dem die Regel nicht gilt, ist der Ort, an dem der
naechste zweite Baustein entsteht.

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
`packages/marken/`, denn dort stehen die Bausteine: `Tabs` traegt `border-b-2`,
`Kopf` traegt das `h1`, `Feldgruppe` traegt die Trennlinie. Der Waechter liest
nur `apps/dashboard-frontend/src`, also gar nicht erst dorthin. Testdateien,
denn ein Test darf pruefen, was er will. Bis zum 20.08.2026 blieben auch grosse
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
        'Feldgruppen-Trennlinie von Hand. Gehoert in Feldgruppe (@marken).',
    ),
    (
        re.compile(r'border-b-2\b'),
        'Tab-Leiste von Hand. Gehoert in Tabs (@marken).',
    ),
    (
        # Fasst alle vier Schreibweisen: role="dialog", role='dialog',
        # role={'dialog'} und role={"dialog"}. Ein zur Laufzeit berechnetes
        # role bleibt unsichtbar, so wie bei den anderen Regeln auch.
        re.compile(r'''role=(?:['"]dialog['"]|\{\s*['"]dialog['"]\s*\})'''),
        'Dialogmechanik von Hand. Gehoert in Dialogform (@marken, auf Radix).',
    ),
]

# Geprueft wird ALLES unter src/. Bis zum 20.08.2026 standen hier nur
# `features` und `components/layout`, und genau dadurch war
# `components/editor/tiptap/TipTapEditor.tsx` unsichtbar: ein handgebauter
# Dialog, den derselbe PR in seiner eigenen Beschreibung aufzaehlte. Ein
# Waechter, dessen Suchbereich kleiner ist als sein Anspruch, meldet Ruhe, wo
# keine ist.
#
# Seit H5 gilt das auch fuer `components/ui/`: die Bausteine stehen dort nicht
# mehr, also gibt es keinen Grund mehr, die Regel dort auszusetzen.
WURZELN = ['apps/dashboard-frontend/src']

AUSGENOMMENE_ORDNER = ()

# --------------------------------------------------------------------------
# Die siebte Regel: keine Farbe ausserhalb der Palette (30.08.2026)
# --------------------------------------------------------------------------
# `packages/marken/src/theme.css` ist die eine Quelle aller Farben. Was ein
# Farbwert ausserhalb davon tut, haengt davon ab, wo er steht:
#
#   TSX/TS der Shell      gar nicht. Ein Hex, ein `rgb()` oder eine Klasse aus
#                         Tailwinds Palette ist ein Befund -- dieselbe Regel,
#                         die `marken.py` (Punkt 6) fuer die Bibliothek haelt.
#   CSS ausser theme.css  nur als Wert eines Tokens (`--x: #hex`), in
#                         `marken.css` nur als Rueckfall `var(--x, #hex)`.
#                         Eine Regel `color: #hex` ist ein Befund.
#   JEDES CSS             der Farbton ist Blau, Rot oder keiner (Grau).
#
# Der Farbton wird gerechnet, nicht geraten: ein Hex oder `rgb()` wird zu HSL,
# und was gesaettigt ist und weder im Blau (190 bis 250 Grad) noch im Rot
# (340 bis 20 Grad) liegt, ist gruen, orange, gelb, violett -- und faellt.
# Farbworte (`white`, `black`, `transparent`, `currentColor`) sind keine
# Palette und werden nicht gelesen.
CSS_WURZELN = ['apps/dashboard-frontend/src', 'packages/marken/src']
FARBQUELLE = 'packages/marken/src/theme.css'
HEX = re.compile(r'#([0-9A-Fa-f]{3,8})\b')
RGB = re.compile(r'\brgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)')
FARB_LITERAL = re.compile(r'#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?\b|\b(?:rgba?|hsla?)\(')
TAILWIND_PALETTE = re.compile(
    r'\b(?:bg|text|border|fill|stroke|ring|outline|from|via|to|decoration|divide|'
    r'accent|caret|placeholder|shadow)-'
    r'(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|'
    r'green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)'
    r'(?:-\d{2,3})?\b'
)
TOKEN_DEFINITION = re.compile(r'^\s*--[\w-]+\s*:')
RUECKFALL = re.compile(r'var\(\s*--[\w-]+\s*,\s*(#[0-9A-Fa-f]{3,8}|rgba?\([^)]*\))\s*\)')


def farbton(r: int, g: int, b: int) -> tuple[float, float]:
    """Farbton in Grad und Saettigung (0 bis 1) nach HSL."""
    r_, g_, b_ = r / 255, g / 255, b / 255
    gross, klein = max(r_, g_, b_), min(r_, g_, b_)
    spanne = gross - klein
    licht = (gross + klein) / 2
    if spanne == 0:
        return 0.0, 0.0
    saettigung = spanne / (1 - abs(2 * licht - 1))
    if gross == r_:
        ton = ((g_ - b_) / spanne) % 6
    elif gross == g_:
        ton = (b_ - r_) / spanne + 2
    else:
        ton = (r_ - g_) / spanne + 4
    return ton * 60, saettigung


def in_der_palette(r: int, g: int, b: int) -> bool:
    ton, saettigung = farbton(r, g, b)
    if saettigung < 0.15:
        return True  # Grau, Schwarz, Weiss
    return 190 <= ton <= 250 or ton >= 340 or ton <= 20  # Blau oder Rot


def rgb_aus(wert: str) -> tuple[int, int, int] | None:
    hexe = HEX.fullmatch(wert)
    if hexe:
        h = hexe.group(1)
        if len(h) in (3, 4):
            h = ''.join(z * 2 for z in h[:3])
        elif len(h) == 8:
            h = h[:6]
        elif len(h) != 6:
            return None
        return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    rgb = RGB.match(wert)
    if rgb:
        return tuple(int(x) for x in rgb.groups())  # type: ignore[return-value]
    return None


def ohne_kommentare(text: str) -> str:
    """CSS ohne `/* ... */`, aber mit denselben Zeilennummern.

    Ein Kommentar wird durch seine Zeilenumbrueche ersetzt und nicht durch
    ein Leerzeichen -- sonst nennt der Befund eine Zeile, die es so nicht
    gibt, und wer ihn liest, sucht an der falschen Stelle.
    """
    return re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), text, flags=re.S)


def farben_pruefen(wurzel: Path) -> list[str]:
    befunde: list[str] = []

    # a) Das TSX der Shell: kein Farbliteral, keine Palette-Klasse.
    for basis in WURZELN:
        ordner = wurzel / basis
        if not ordner.is_dir():
            continue
        for datei in sorted(list(ordner.rglob('*.tsx')) + list(ordner.rglob('*.ts'))):
            if '__tests__' in datei.parts or datei.name.endswith(('.test.tsx', '.test.ts')):
                continue
            relativ = datei.relative_to(wurzel).as_posix()
            for nr, zeile in enumerate(datei.read_text(encoding='utf-8').splitlines(), 1):
                ohne_var = re.sub(r'var\(--[\w-]+', ' ', zeile)
                for treffer in FARB_LITERAL.findall(ohne_var):
                    befunde.append(
                        f'{relativ}:{nr}  Farbe `{treffer}` im Code. Eine Farbe steht in '
                        'theme.css und wird als Token benutzt.'
                    )
                for treffer in TAILWIND_PALETTE.findall(ohne_var):
                    befunde.append(
                        f'{relativ}:{nr}  `{treffer}` aus Tailwinds Palette folgt keinem '
                        'Thema. Nimm den Token.'
                    )

    # b) und c) Jedes CSS: Hex nur als Token, jeder Farbwert in der Palette.
    for basis in CSS_WURZELN:
        ordner = wurzel / basis
        if not ordner.is_dir():
            continue
        for datei in sorted(ordner.rglob('*.css')):
            relativ = datei.relative_to(wurzel).as_posix()
            ist_quelle = relativ == FARBQUELLE
            ist_marken = datei.name == 'marken.css'
            text = ohne_kommentare(datei.read_text(encoding='utf-8'))
            for nr, zeile in enumerate(text.splitlines(), 1):
                literale = HEX.findall(zeile)
                if literale and not ist_quelle:
                    erlaubt = (
                        len(RUECKFALL.findall(zeile)) >= len(literale)
                        if ist_marken
                        else bool(TOKEN_DEFINITION.match(zeile))
                    )
                    if not erlaubt:
                        befunde.append(
                            f'{relativ}:{nr}  Hex ausserhalb von theme.css. Eine Farbe steht '
                            'dort und wird hier als Token benutzt.'
                        )
                werte = [f'#{h}' for h in literale] + [
                    m.group(0) for m in RGB.finditer(zeile)
                ]
                for wert in werte:
                    rgb = rgb_aus(wert)
                    if rgb and not in_der_palette(*rgb):
                        ton, _ = farbton(*rgb)
                        befunde.append(
                            f'{relativ}:{nr}  `{wert}` (Farbton {ton:.0f} Grad) ist weder '
                            'Blau noch Rot noch Grau. Die Palette kennt kein Gruen und '
                            'kein Orange.'
                        )
    return befunde


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

    befunde = (
        pruefe(wurzel)
        + primitive_doppelt(wurzel)
        + schauseite_vollstaendig(wurzel)
        + farben_pruefen(wurzel)
    )
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
