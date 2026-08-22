"""Plan 023 G4: nach einem vollen Zyklus wird nicht dreissig Sekunden geschlafen.

Am 22.08.2026 auf dem Orin gemessen: 93 Dokumente lagen auf `pending`, der
Indexer stand bei 0,01 Prozent CPU. Er hatte seine zehn abgearbeitet und
schlief. Ein Dokument braucht rund eine Sekunde; die gemeldeten 1:53 Minuten
fuer eine Datei mit 739 Byte waren fast vollstaendig Wartezeit.

Der Deckel je Zyklus hat seinen Sinn (ein Zyklus bleibt ueberschaubar, der
Wachhund sieht regelmaessig Leben). Das lange Schlafen danach hat keinen.
"""

import enhanced_indexer as ei  # noqa: E402


def test_pause_ist_kurz_wenn_arbeit_liegen_blieb():
    """Bleibt Arbeit liegen, geht es nach dem Nachbrenner weiter."""
    indexer = ei.EnhancedDocumentIndexer.__new__(ei.EnhancedDocumentIndexer)
    indexer._nacharbeit_offen = True
    pause = ei.INDEXER_NACHBRENNER if indexer._nacharbeit_offen else ei.INDEXER_INTERVAL
    assert pause == ei.INDEXER_NACHBRENNER
    assert pause < ei.INDEXER_INTERVAL


def test_pause_ist_lang_wenn_nichts_mehr_wartet():
    """Ohne offene Arbeit bleibt es beim gewohnten Takt."""
    indexer = ei.EnhancedDocumentIndexer.__new__(ei.EnhancedDocumentIndexer)
    indexer._nacharbeit_offen = False
    pause = ei.INDEXER_NACHBRENNER if indexer._nacharbeit_offen else ei.INDEXER_INTERVAL
    assert pause == ei.INDEXER_INTERVAL


def test_nachbrenner_ist_deutlich_kuerzer_als_der_takt():
    """Sonst waere die Aenderung wirkungslos.

    Bei hundert Dateien und zehn je Zyklus sind es zehn Runden. Mit dreissig
    Sekunden Pause macht das fuenf Minuten, mit zwei Sekunden zwanzig.
    """
    assert ei.INDEXER_NACHBRENNER <= ei.INDEXER_INTERVAL / 5
