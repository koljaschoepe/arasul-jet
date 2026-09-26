"""
Die Selbstheilung schreibt deutsch (J35, 26.09.2026).

`description` und `action_taken` jeder Zeile in `self_healing_events` stehen
in der Oberfläche unter Einstellungen → Selbstheilung vor einem
Administrator. Bis J35 schrieb der Agent sie englisch („Failed to recover
llm-service", „container.restart() + 10s backoff"), und wer an einem
deutschen Gerät englische Sätze liest, zweifelt am ganzen Gerät.

Dieser Test liest jeden Aufruf von `log_event` im Agenten und nimmt aus dem
dritten und vierten Argument jedes feste Textstück (auch aus f-Strings und
aus beiden Zweigen eines `x if y else z`). Gemeldet wird:

  1. ein englisches Wort aus `ENGLISCH`;
  2. ein Wort, das die Begriffsliste der Oberfläche verdrängt hat
     (`statt` in `apps/dashboard-frontend/src/begriffe.ts` — die Liste ist
     die Quelle, sie wird hier gelesen und nicht abgeschrieben);
  3. eine Umschreibung eines Umlauts (Stämme aus `UMSCHRIEBEN` in
     `begriffe.test.ts`, ebenfalls gelesen).

Dazu die Zeile, die `post_reboot_validation.py` von Hand schreibt.
"""

import ast
import re
import unittest
from pathlib import Path

AGENT = Path(__file__).resolve().parent.parent
REPO = AGENT.parent.parent
BEGRIFFE = REPO / 'apps' / 'dashboard-frontend' / 'src' / 'begriffe.ts'
BEGRIFFE_TEST = REPO / 'apps' / 'dashboard-frontend' / 'src' / '__tests__' / 'begriffe.test.ts'

# Wörter, an denen ein englischer Satz zu erkennen ist. Ganze Wörter, ohne
# Rücksicht auf Groß- und Kleinschreibung.
ENGLISCH = [
    'failed', 'failure', 'restart', 'restarted', 'restarts', 'usage', 'error',
    'recovered', 'recovery', 'unhealthy', 'healthy', 'performing', 'triggered',
    'triggering', 'database', 'disk', 'storage', 'connection', 'monitor',
    'started', 'stopped', 'reboot', 'escalating', 'successful', 'successfully',
    'cleanup', 'the', 'with', 'and', 'not', 'at', 'in last', 'expires',
    'manual', 'required', 'applied', 'cleared', 'reset', 'lost', 'detected',
    'running', 'accessible', 'responding', 'available', 'skipped', 'passed',
    'validation', 'service', 'engine', 'backoff', 'threshold',
]

# Was ein Satz nennen darf, ohne englisch zu sein: Befehle der Datenbank und
# Namen von Einstellungen stehen so im Protokoll von Postgres und in der
# `.env`, und eine Übersetzung fände dort niemand wieder.
ERLAUBT = ['VACUUM FREEZE', 'max_connections', 'SELF_HEALING_REBOOT_ENABLED', 'Tailscale']


def _statt_woerter():
    text = BEGRIFFE.read_text(encoding='utf-8')
    woerter = []
    for liste in re.findall(r'statt:\s*\[([^\]]*)\]', text):
        woerter += re.findall(r"'([^']+)'", liste)
    return woerter


def _umschrieben():
    text = BEGRIFFE_TEST.read_text(encoding='utf-8')
    treffer = re.search(r'const UMSCHRIEBEN =\s*/(.+)/i;', text)
    return re.compile(treffer.group(1), re.IGNORECASE)


def _textstuecke(knoten):
    """Jedes feste Textstück eines Ausdrucks, samt Zweigen und f-Strings."""
    if isinstance(knoten, ast.Constant) and isinstance(knoten.value, str):
        yield knoten.value
    elif isinstance(knoten, ast.JoinedStr):
        for teil in knoten.values:
            yield from _textstuecke(teil)
    elif isinstance(knoten, ast.IfExp):
        yield from _textstuecke(knoten.body)
        yield from _textstuecke(knoten.orelse)
    elif isinstance(knoten, ast.BoolOp):
        for wert in knoten.values:
            yield from _textstuecke(wert)
    elif isinstance(knoten, ast.BinOp):
        yield from _textstuecke(knoten.left)
        yield from _textstuecke(knoten.right)
    elif isinstance(knoten, ast.Call) and isinstance(knoten.func, ast.Attribute):
        # 'x'.join(...), f'...'.replace(...): das Stück davor zählt
        yield from _textstuecke(knoten.func.value)


def _meldungen():
    """(datei, zeile, text) je festem Textstück in description/action_taken."""
    for datei in sorted(AGENT.glob('*.py')):
        baum = ast.parse(datei.read_text(encoding='utf-8'))
        for knoten in ast.walk(baum):
            if not isinstance(knoten, ast.Call):
                continue
            name = getattr(knoten.func, 'attr', None) or getattr(knoten.func, 'id', None)
            if name != 'log_event':
                continue
            for arg in knoten.args[2:4]:
                for text in _textstuecke(arg):
                    yield datei.name, arg.lineno, text


def _post_reboot_zeilen():
    """Die Zeilen, die post_reboot_validation.py in `action_taken` sammelt."""
    datei = AGENT / 'post_reboot_validation.py'
    baum = ast.parse(datei.read_text(encoding='utf-8'))
    for knoten in ast.walk(baum):
        if (isinstance(knoten, ast.Call) and getattr(knoten.func, 'attr', None) == 'append'
                and getattr(knoten.func.value, 'id', None) == 'validation_results'):
            for text in _textstuecke(knoten.args[0]):
                yield datei.name, knoten.lineno, text
        if isinstance(knoten, ast.FunctionDef) and knoten.name == 'log_validation_event':
            for innen in ast.walk(knoten):
                if isinstance(innen, ast.Tuple) and len(innen.elts) == 5:
                    for text in _textstuecke(innen.elts[2]):
                        yield datei.name, innen.lineno, text


def _befunde(meldungen):
    statt = _statt_woerter()
    umschrieben = _umschrieben()
    befunde = []
    for datei, zeile, text in meldungen:
        pruefen = text
        for wort in ERLAUBT:
            pruefen = pruefen.replace(wort, ' ')
        for wort in ENGLISCH:
            if re.search(rf'(?<![\w-]){re.escape(wort)}(?![\w-])', pruefen, re.IGNORECASE):
                befunde.append(f'{datei}:{zeile} englisch „{wort}": {text!r}')
        for wort in statt:
            if re.search(rf'(?<![\w-]){re.escape(wort)}(?![\w-])', pruefen):
                befunde.append(f'{datei}:{zeile} „{wort}" statt Begriffsliste: {text!r}')
        if umschrieben.search(pruefen):
            befunde.append(f'{datei}:{zeile} Umlaut umschrieben: {text!r}')
    return befunde


class TestMeldungenDeutsch(unittest.TestCase):
    def test_es_gibt_etwas_zu_lesen(self):
        """Ein Wächter, der nichts findet, misst nichts."""
        self.assertGreater(len(list(_meldungen())), 60)
        self.assertGreater(len(list(_post_reboot_zeilen())), 10)
        self.assertTrue(_statt_woerter())

    def test_log_event_schreibt_deutsch(self):
        befunde = _befunde(_meldungen())
        self.assertEqual(befunde, [], '\n' + '\n'.join(befunde))

    def test_pruefung_nach_dem_neustart_schreibt_deutsch(self):
        befunde = _befunde(_post_reboot_zeilen())
        self.assertEqual(befunde, [], '\n' + '\n'.join(befunde))

    def test_waechter_schlaegt_an(self):
        """Gegenprobe: die alten Sätze wären drei Befunde gewesen."""
        alt = [
            ('x.py', 1, 'Failed to recover llm-service'),
            ('x.py', 2, 'Protokoll im Log'),
            ('x.py', 3, 'Dienst laeuft wieder'),
        ]
        self.assertEqual(len(_befunde(alt)), 3)


if __name__ == '__main__':
    unittest.main()
