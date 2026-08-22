"""Plan 023 G4: es laeuft immer nur ein Zyklus.

Am 22.08.2026 auf dem Orin im Protokoll gesehen, waehrend 45 Dokumente auf
`pending` standen:

    15:55:36.285  Running AI analysis for prd-workflow.md
    15:55:36.289  Running AI analysis for prd-workflow.md
    15:56:16.487  Categorizing prd-workflow.md
    15:56:21.559  Categorizing prd-workflow.md

Jede Zeile doppelt, mit Millisekunden Abstand. Zwei Zyklen liefen nebeneinander:
die eigene Schleife und der Thread aus `POST /scan`, das der Ordner-Sync seit
dem Weckruf-Umbau bei jeder Aenderung ruft.

Zwei Folgen, beide schlecht:

1. Beide teilen sich die wartenden Dokumente, jeder sieht weniger als den
   Deckel und meldet `cap_reached = False`. Beide gehen daraufhin in die
   Nachhol-Anreicherung, obwohl der Rueckstau genau das verbieten sollte.
2. Beide holen dieselben Dokumente aus der Anreicherungs-Abfrage und fassen sie
   doppelt zusammen. Doppelte GPU-Arbeit fuer dasselbe Ergebnis.
"""

import threading

import enhanced_indexer as ei


def _indexer():
    ix = object.__new__(ei.EnhancedDocumentIndexer)
    ix._zyklus_lock = threading.Lock()
    ix._weckruf_offen = False
    ix._nacharbeit_offen = False
    return ix


def test_ein_zweiter_aufruf_laeuft_nicht_daneben(monkeypatch):
    ix = _indexer()
    drin = threading.Event()
    weiter = threading.Event()
    laeufe = []

    def langsam():
        laeufe.append(1)
        drin.set()
        weiter.wait(timeout=5)

    monkeypatch.setattr(ei.EnhancedDocumentIndexer, '_zyklus', lambda self: langsam())

    t = threading.Thread(target=ix.scan_and_index)
    t.start()
    assert drin.wait(timeout=5)

    # Waehrend der erste noch laeuft: der zweite Aufruf kehrt sofort zurueck.
    ix.scan_and_index()
    assert len(laeufe) == 1

    weiter.set()
    t.join(timeout=5)


def test_der_abgewiesene_weckruf_geht_nicht_verloren(monkeypatch):
    """Sonst wartete eine gerade geschriebene Datei bis zum naechsten Takt."""
    ix = _indexer()
    drin = threading.Event()
    weiter = threading.Event()

    def langsam():
        drin.set()
        weiter.wait(timeout=5)

    monkeypatch.setattr(ei.EnhancedDocumentIndexer, '_zyklus', lambda self: langsam())
    t = threading.Thread(target=ix.scan_and_index)
    t.start()
    assert drin.wait(timeout=5)
    ix.scan_and_index()
    assert ix._weckruf_offen is True
    weiter.set()
    t.join(timeout=5)


def test_der_weckruf_ueberschreibt_den_rueckstau_merker_nicht(monkeypatch):
    """Der laufende Zyklus setzt `_nacharbeit_offen` am Ende auf seinen Stand.

    Schriebe der abgewiesene Weckruf in dieselbe Variable, wuerde er dabei
    stillschweigend geloescht. Deshalb ein eigener Merker.
    """
    ix = _indexer()

    def zyklus_der_aufraeumt(self):
        # So endet der echte Zyklus: der Merker bekommt den eigenen Stand.
        self._nacharbeit_offen = False

    monkeypatch.setattr(ei.EnhancedDocumentIndexer, '_zyklus', zyklus_der_aufraeumt)
    ix._weckruf_offen = True
    ix.scan_and_index()
    assert ix._weckruf_offen is True


def test_die_sperre_wird_auch_nach_einem_fehler_frei(monkeypatch):
    ix = _indexer()

    def kracht(self):
        raise RuntimeError('Postgres weg')

    monkeypatch.setattr(ei.EnhancedDocumentIndexer, '_zyklus', kracht)
    try:
        ix.scan_and_index()
    except RuntimeError:
        pass
    assert ix._zyklus_lock.acquire(blocking=False), (
        "Nach einem Fehler bliebe der Indexer sonst fuer immer stehen."
    )
