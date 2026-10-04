#!/usr/bin/env python3
"""index.css ohne Ballast (M5, Karte jet-css-ballast).

Am 04.10.2026 waren in `apps/dashboard-frontend/src/index.css` 166 von 231
Klassen, 49 von 115 Custom Properties und 13 Keyframes ohne Verbraucher. Sie
stammten aus der Zeit vor dem Designsystem. Niemand hatte sie entfernt, weil
nichts rot wurde: eine Regel, die nirgends gebraucht wird, kostet Bytes im
Buendel und Zeit beim Lesen, aber keinen Test.

Was geprueft wird
-----------------
In `index.css`:

  - Eine KLASSE ist ungenutzt, wenn kein Verbraucher sie nennt. Verbraucher
    sind die Zeichenketten in jedem `.ts`/`.tsx` unter der Shell und unter
    `packages/marken/src` (ohne Tests: ein Test, der eine tote Klasse sucht,
    haelt sie nicht am Leben) und `index.html`, dazu `marken.css` und
    `theme.css` (Klassen, die dort ein `@apply` oder eine Verschachtelung
    nennt). Eine dynamisch gebaute Klasse (`status-${art}`) zaehlt ueber ihren
    Anfang: jede Klasse, die mit `status-` beginnt, ist dann genutzt.
  - Ein TOKEN (`--name:`) ist ungenutzt, wenn nirgends `var(--name)` oder
    sonst ein Verweis auf ihn steht, ausser seiner eigenen Zeile.
  - Eine KEYFRAME ist ungenutzt, wenn keine `animation` sie nennt, auch nicht
    als Tailwind-Wert `animate-[name_1s_...]` in einer Quelle (der Unterstrich
    trennt dort Name und Dauer).

Ein Selektor mit einer toten Klasse trifft nie etwas; die Regel ist erst
Ballast, wenn jeder Selektor ihrer Liste so einer ist. Klassen in `:not()`,
`:is()`, `:where()`, `:has()` zaehlen nicht als Definition.

Ausnahmen stehen unten, jede mit Grund. Eine Ausnahme, die nichts mehr trifft,
ist selbst ein Befund: die Liste soll nicht zu einem zweiten Ballast werden.

Aufruf
------
    python3 scripts/test/css-ballast.py [--wurzel <wurzel>]

Rueckgabe 1, wenn etwas gefunden wurde. Laeuft in der CI im Job Guards.
"""

import argparse
import os
import re
import sys

CSS = os.path.join('apps', 'dashboard-frontend', 'src', 'index.css')
QUELLEN = [
    os.path.join('apps', 'dashboard-frontend', 'src'),
    os.path.join('packages', 'marken', 'src'),
]
HTML = [os.path.join('apps', 'dashboard-frontend', 'index.html')]

# Tailwind liefert diese Utilities selbst. Eine Kopie in `index.css` (Schicht
# `components`) verliert in jedem Punkt gegen die echte (Schicht `utilities`),
# ist also wirkungslos, und sie verfuehrt dazu, an ihr statt am Token zu
# drehen. Gemeint ist die Regel mit genau diesem einen Selektor; `.sidebar
# .hidden` ist ein Zustand und keine Kopie. `overflow-auto` und seine zwei
# Geschwister fehlen mit Absicht: sie setzen zusaetzlich `position: relative`
# (G2), das Tailwind nicht kennt.
KOPIE = re.compile(
    r'^(flex(-1|-col|-row|-wrap)?|items-(start|center|end)|justify-(start|center|end|between)'
    r'|text-(xs|sm|base|lg|[2-9]?xl|left|center|right|primary|secondary|muted)'
    r'|font-(medium|semibold|bold)|truncate|sr-only|w-full|max-w-(sm|md|lg|xl|2xl|full)'
    r'|overflow-hidden|hidden|visible)$'
)

# Klassen, die nicht aus den Quellen kommen. Jede mit Grund.
AUSNAHME_KLASSEN = {}

# Tokens, die nicht ueber `var(--x)` gebraucht werden. Jedes mit Grund.
AUSNAHME_TOKENS = {}

# Keyframes, die nicht ueber `animation:` im CSS gebraucht werden.
AUSNAHME_KEYFRAMES = {}


# ---------------------------------------------------------------------------
# CSS lesen
# ---------------------------------------------------------------------------

def ohne_kommentare(text):
    return re.sub(r'/\*.*?\*/', lambda m: re.sub(r'[^\n]', ' ', m.group(0)), text, flags=re.S)


def parse(text):
    """Teilt CSS in Knoten: {prelude, kinder|None, anfang, ende} (Offsets)."""
    pos = 0
    n = len(text)

    def lies(pos, tief):
        knoten = []
        start = pos
        while pos < n:
            c = text[pos]
            if c == '"' or c == "'":
                ende = pos + 1
                while ende < n and text[ende] != c:
                    ende += 2 if text[ende] == '\\' else 1
                pos = ende + 1
            elif c == '(':
                klammer, pos = 1, pos + 1
                while pos < n and klammer:
                    klammer += {'(': 1, ')': -1}.get(text[pos], 0)
                    pos += 1
            elif c == ';':
                pos += 1
                start = pos
            elif c == '{':
                prelude = text[start:pos].strip()
                innen = pos + 1
                if re.match(r'@(layer|media|supports|container)\b', prelude) or (
                    not prelude.startswith('@') and tief >= 0 and False
                ):
                    kinder, pos = lies(innen, tief + 1)
                    ende = pos
                    knoten.append(
                        {'prelude': prelude, 'kinder': kinder, 'anfang': start, 'ende': ende, 'innen': innen}
                    )
                else:
                    klammer, pos = 1, innen
                    while pos < n and klammer:
                        if text[pos] in '"\'':
                            q = text[pos]
                            pos += 1
                            while pos < n and text[pos] != q:
                                pos += 2 if text[pos] == '\\' else 1
                        else:
                            klammer += {'{': 1, '}': -1}.get(text[pos], 0)
                        pos += 1
                    knoten.append(
                        {
                            'prelude': prelude,
                            'kinder': None,
                            'anfang': start,
                            'ende': pos,
                            'innen': innen,
                            'koerper': text[innen : pos - 1],
                        }
                    )
                start = pos
            elif c == '}':
                return knoten, pos + 1
            else:
                pos += 1
        return knoten, pos

    return lies(0, 0)[0]


def alle_regeln(knoten):
    for k in knoten:
        if k['kinder'] is not None:
            yield from alle_regeln(k['kinder'])
        else:
            yield k


def selektoren(prelude):
    teile, tief, akt = [], 0, ''
    for c in prelude:
        if c in '([':
            tief += 1
        elif c in ')]':
            tief -= 1
        if c == ',' and tief == 0:
            teile.append(akt.strip())
            akt = ''
        else:
            akt += c
    teile.append(akt.strip())
    return [t for t in teile if t]


def klassen_in(selektor):
    """Klassen eines Selektors, ohne die in :not/:is/:where/:has und Attributen."""
    ohne, tief, i = '', 0, 0
    while i < len(selektor):
        c = selektor[i]
        if tief == 0 and selektor.startswith((':not(', ':is(', ':where(', ':has(', ':-webkit-any('), i):
            tief = 1
            i = selektor.index('(', i) + 1
            continue
        if tief and c in '(':
            tief += 1
        elif tief and c == ')':
            tief -= 1
        elif tief == 0 and c == '[':
            i = selektor.index(']', i) + 1
            continue
        elif tief == 0:
            ohne += c
        i += 1
    return re.findall(r'\.(-?[A-Za-z_][\w-]*)', ohne)


# ---------------------------------------------------------------------------
# Verbraucher lesen
# ---------------------------------------------------------------------------

def dateien(wurzel):
    for q in QUELLEN:
        for ordner, unter, namen in os.walk(os.path.join(wurzel, q)):
            unter[:] = [u for u in unter if u not in ('node_modules', '__tests__', 'dist')]
            for name in namen:
                if re.search(r'\.test\.|\.spec\.', name):
                    continue
                yield os.path.join(ordner, name)
    for h in HTML:
        yield os.path.join(wurzel, h)


STRING = re.compile(
    r"""(?P<k>//[^\n]*|/\*.*?\*/)|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`""",
    re.S,
)


def prosa(s):
    """Pfad, Importpfad, Logzeile oder Satz: kein Klassenwerk."""
    innen = s[1:-1].strip()
    return bool(
        re.match(r'^[/.?<\[]', innen) and not re.match(r'^\[[\w-]+:', innen)
        or re.search(r'[:.!?…]$', innen)
        or re.search(r'[A-Za-zÄÖÜäöü]{3,} [A-Za-zÄÖÜäöü]{3,}, ', innen)
        or re.match(r'^[A-Z][a-z]+ [a-z]+', innen)
        or re.search(r'\s[=?&]|[=?&]\w+=', innen)
        or '.json' in innen
        or re.search(r'\w@\w', innen)
    )


def einzelklasse(text, start):
    davor = text[max(0, start - 160) : start]
    if re.search(r'(className=\{?|class=|cn\(|clsx\(|classList\.\w+\(|querySelector\w*\()\s*$', davor):
        return True
    if re.search(r'(\?|[\'"`]\s*:|&&|\|\||,|\()\s*$', davor) and re.search(r'className|class=|cn\(|clsx\(|cva\(', davor):
        return True
    return False


def verbraucher(wurzel):
    """Gibt (klassen, praefixe, text) zurueck: Klassen-Tokens aus Zeichenketten."""
    klassen, praefixe, css_text = set(), set(), []
    # (Die Tokens einer Zeichenkette sind durch Leerraum getrennt; `md:flex`
    # nennt also nicht `flex`.)
    css_pfad = os.path.join(wurzel, CSS)
    for pfad in dateien(wurzel):
        if os.path.abspath(pfad) == os.path.abspath(css_pfad):
            continue
        try:
            text = open(pfad, encoding='utf-8').read()
        except (UnicodeDecodeError, FileNotFoundError):
            continue
        if pfad.endswith('.css'):
            css_text.append(text)
            text = ohne_kommentare(text)
            klassen.update(re.findall(r'\.(-?[A-Za-z_][\w-]*)', text))
            continue
        if pfad.endswith(('.ts', '.tsx', '.html', '.js', '.mjs')):
            for m in STRING.finditer(text):
                s = m.group(0)
                if m.group('k') is not None or prosa(s):
                    continue
                for pm in re.finditer(r'([\w-]+-)\$\{', s):
                    praefixe.add(pm.group(1))
                s = re.sub(r'\$\{[^}]*\}', ' ', s)
                inner = s[1:-1]
                tokens = [t for t in re.split(r'\s+', inner) if t]
                tokens += re.findall(r'\.(-?[A-Za-z_][\w-]*)', inner)
                # Ein einzelnes Wort in Anfuehrungszeichen (`'error'`, `"card"`)
                # ist meist ein Zustand, ein Importpfad oder ein data-slot und
                # keine Klasse. Es zaehlt nur an einer Stelle, an der eine
                # Klasse stehen kann.
                if len(tokens) == 1 and not einzelklasse(text, m.start()):
                    continue
                klassen.update(tokens)
            if pfad.endswith('.html'):
                for s in re.findall(r'class="([^"]*)"', text):
                    klassen.update(t for t in re.split(r"[^\w-]+", s) if t)
            css_text.append(text)
    return klassen, praefixe, '\n'.join(css_text)


# ---------------------------------------------------------------------------
# Befunde
# ---------------------------------------------------------------------------

LETZTE = {}


def befunde(wurzel):
    css_pfad = os.path.join(wurzel, CSS)
    roh = open(css_pfad, encoding='utf-8').read()
    text = ohne_kommentare(roh)
    knoten = parse(text)
    genutzt, praefixe, fremd = verbraucher(wurzel)

    def klasse_tot(k):  # noqa
        if k in AUSNAHME_KLASSEN:
            return False
        if k in genutzt:
            return False
        return not any(k.startswith(p) for p in praefixe)

    tote_klassen = {}
    definiert = set()
    kopien = set()
    for r in alle_regeln(knoten):
        if r['prelude'].startswith('@'):
            continue
        for sel in selektoren(r['prelude']):
            m = re.fullmatch(r'\.([\w-]+)', sel)
            if m and KOPIE.match(m.group(1)):
                kopien.add(m.group(1))
            for k in klassen_in(sel):
                definiert.add(k)
                if klasse_tot(k):
                    tote_klassen.setdefault(k, 0)
                    tote_klassen[k] += 1

    # Tokens: Definitionen (`--x:`) in index.css gegen jeden anderen Verweis.
    definierte = set(re.findall(r'(?<![\w-])(--[A-Za-z][\w-]*)\s*:', text))
    verweise = set(re.findall(r'(?<![\w-])(--[A-Za-z][\w-]*)(?!\s*:)(?![\w-])', text))
    verweise |= set(re.findall(r'(?<![\w-])(--[A-Za-z][\w-]*)(?![\w-])', fremd))
    # `var(--${name})` und `'--' + name` lassen sich nicht aufloesen; ein
    # Praefix vor `${` zaehlt wie bei den Klassen.
    tote_tokens = sorted(t for t in definierte if t not in verweise and t not in AUSNAHME_TOKENS)

    # Keyframes
    keyframes = set(re.findall(r'@keyframes\s+([\w-]+)', text))
    ausser = re.sub(r'@keyframes\s+[\w-]+', '', text)
    tote_keyframes = sorted(
        k
        for k in keyframes
        if k not in AUSNAHME_KEYFRAMES
        and not re.search(r'(?<![A-Za-z0-9-])' + re.escape(k) + r'(?![A-Za-z0-9-])', ausser + '\n' + fremd)
    )

    # Ausnahmen, die nichts mehr treffen
    ueberfluessig = [
        f'Klasse {k} ({g})' for k, g in AUSNAHME_KLASSEN.items() if k not in definiert
    ] + [f'Token {k} ({g})' for k, g in AUSNAHME_TOKENS.items() if k not in definierte] + [
        f'Keyframe {k} ({g})' for k, g in AUSNAHME_KEYFRAMES.items() if k not in keyframes
    ]
    LETZTE['roh'] = set(tote_klassen)
    LETZTE['kopien'] = kopien
    LETZTE['knoten'] = knoten
    LETZTE['text'] = text
    tote_klassen.update({k: 0 for k in kopien})
    return sorted(tote_klassen), tote_tokens, tote_keyframes, ueberfluessig, definiert, definierte, keyframes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--wurzel', default=os.path.join(os.path.dirname(__file__), '..', '..'))
    args = ap.parse_args()
    wurzel = os.path.abspath(args.wurzel)
    klassen, tokens, keyframes, ueberfluessig, d_k, d_t, d_f = befunde(wurzel)

    for k in klassen:
        print(f'  Klasse ohne Verbraucher: .{k}')
    for t in tokens:
        print(f'  Token ohne Verbraucher: {t}')
    for k in keyframes:
        print(f'  Keyframe ohne Verbraucher: {k}')
    for u in ueberfluessig:
        print(f'  Ausnahme trifft nichts mehr: {u}')

    summe = len(klassen) + len(tokens) + len(keyframes) + len(ueberfluessig)
    print(
        f'index.css: {len(klassen)} von {len(d_k)} Klassen, {len(tokens)} von {len(d_t)} Tokens, '
        f'{len(keyframes)} von {len(d_f)} Keyframes ohne Verbraucher.'
    )
    if summe:
        print('ROT: index.css traegt Ballast. Entfernen, oder mit Grund in AUSNAHME_* eintragen.')
        return 1
    print('OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
