"""Plan 023 G4: die KI-Analyse laesst sich zwischen ihren Aufrufen unterbrechen.

Drei Modellaufrufe je Dokument (Zusammenfassung, Kategorie, Themen), am
22.08.2026 auf dem Orin zusammen rund fuenfzig Sekunden. Solange nur ZWISCHEN
zwei Dokumenten geprueft wurde, wartete eine gerade geschriebene Datei genau
diese fuenfzig Sekunden auf ein fremdes Dokument. Gemessen: hundert Dateien
brauchten 161 Sekunden, davon rund 34 Sekunden Warten auf eine laufende
Anreicherungsrunde.

Ein laufender Modellaufruf wird NICHT abgebrochen. Das Modell rechnet ohnehin
weiter, und ein halbes Ergebnis waere schlechter als gar keins.
"""

import ai_services


class _Modell:
    """Ein Doppel des LLM-Zugangs, das mitzaehlt, was gefragt wurde."""

    def __init__(self):
        self.gefragt = []

    def check_health(self):
        return True

    def generate_summary(self, text, title=None):
        self.gefragt.append('zusammenfassung')
        return 'Eine Zusammenfassung.'

    def categorize_document(self, text, filename, categories):
        self.gefragt.append('kategorie')
        return ('Allgemein', 0.9)

    def extract_topics(self, text):
        self.gefragt.append('themen')
        return ['a', 'b']


def _analysator(modell):
    a = object.__new__(ai_services.DocumentAnalyzer)
    a.ai = modell
    return a


KATEGORIEN = [{'id': '1', 'name': 'Allgemein'}]


def test_ohne_abbruch_laufen_alle_drei():
    m = _Modell()
    res = _analysator(m).analyze_document('Text', 'a.md', categories=KATEGORIEN)
    assert m.gefragt == ['zusammenfassung', 'kategorie', 'themen']
    assert res['analysis_complete'] is True


def test_ein_abbruch_nach_der_zusammenfassung_stoppt_dort():
    m = _Modell()
    res = _analysator(m).analyze_document(
        'Text', 'a.md', categories=KATEGORIEN, abbruch=lambda: True
    )
    assert m.gefragt == ['zusammenfassung'], (
        "Nach dem Abbruch darf kein weiterer Modellaufruf mehr folgen."
    )
    # Was schon da ist, bleibt: die Zusammenfassung allein ist besser als nichts.
    assert res['summary'] == 'Eine Zusammenfassung.'
    assert res['analysis_complete'] is False


def test_ein_abbruch_der_erst_spaeter_wahr_wird():
    m = _Modell()
    zaehler = {'n': 0}

    def abbruch():
        zaehler['n'] += 1
        return zaehler['n'] >= 2

    res = _analysator(m).analyze_document(
        'Text', 'a.md', categories=KATEGORIEN, abbruch=abbruch
    )
    assert m.gefragt == ['zusammenfassung', 'kategorie']
    assert res['category'] == 'Allgemein'
    assert res['analysis_complete'] is False


def test_ohne_kategorien_wird_trotzdem_geprueft():
    # Sonst haette der Fall ohne Kategorien nur EINE Pruefstelle statt zweien.
    m = _Modell()
    res = _analysator(m).analyze_document('Text', 'a.md', abbruch=lambda: True)
    assert m.gefragt == ['zusammenfassung']
    assert res['analysis_complete'] is False
