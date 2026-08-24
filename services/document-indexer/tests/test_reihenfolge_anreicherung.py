"""Plan 023 G4: erst indexieren, dann anreichern.

Am 22.08.2026 auf dem Orin gemessen, an einer Datei mit wenigen Zeilen:

    15:26:03  Generating summary
    15:26:37  Categorizing          (34 s spaeter)
    15:26:56  Extracting topics     (weitere 19 s)

Jede dieser Zeilen ist ein Aufruf ans Sprachmodell. Das Dokument wurde erst
NACH alldem auf `indexed` gesetzt, war also ueber eine Minute lang nicht
auffindbar, obwohl der Textlayer in rund einer Sekunde fertig gewesen waere.

Die Anreicherung ist Beiwerk; die Auffindbarkeit ist die Zusage.

Nachtrag vom selben Tag, nach der Live-Messung: die Reihenfolge INNERHALB eines
Dokuments zu drehen reichte nicht. Der naechste Fund war die Warteschlange.
Eine frisch geschriebene Datei stand hinter 71 offenen Dokumenten, jedes mit
rund fuenfzig Sekunden Modell-Arbeit, also ueber eine Stunde. Deshalb laeuft
die Anreicherung jetzt gar nicht mehr im Indexier-Durchgang, sondern erst
danach und nur dann, wenn nichts Neues wartet.
"""

import inspect

import document_processor as dp  # noqa: E402


def _quelltext():
    return inspect.getsource(dp.run_indexing_pipeline)


def test_status_wird_vor_der_ki_analyse_gesetzt():
    """`indexed` steht, bevor das Sprachmodell ueberhaupt gefragt wird."""
    text = _quelltext()
    status_pos = text.index("update_document_status(doc_id, 'indexed'")
    analyse_pos = text.index("reichere_an(")
    assert status_pos < analyse_pos, (
        "Die KI-Analyse laeuft wieder VOR dem Statuswechsel. Damit ist ein "
        "Dokument erst nach mehreren Sprachmodell-Aufrufen auffindbar."
    )


def test_indexierung_laeuft_vor_der_ki_analyse():
    text = _quelltext()
    assert text.index("schreibe_textlayer(") < text.index("reichere_an(")


def test_eine_gescheiterte_anreicherung_kippt_den_lauf_nicht():
    """Der Text ist indexiert; eine fehlende Zusammenfassung ist kein Fehlschlag."""
    quelle = inspect.getsource(dp.reichere_an)
    assert "except Exception" in quelle
    assert "return False" in quelle
    # Und sie meldet den Fehlschlag, statt ihn zu verschlucken.
    assert "Anreicherung fuer" in quelle


def test_die_kategorie_in_der_nutzlast_ist_bewusst_allgemein():
    """Sie ist zum Indexzeitpunkt noch nicht bekannt, und das ist in Ordnung.

    Der Wert landet ausschliesslich in der Qdrant-Nutzlast; die echte Kategorie
    steht an der Dokumentzeile, und von dort liest sie auch das Backend.
    """
    text = _quelltext()
    assert "'category_name': 'Allgemein'" in text


def test_die_anreicherung_laesst_sich_abschalten():
    """Der Schalter, ohne den die Warteschlange wieder verstopft."""
    unterschrift = inspect.signature(dp.run_indexing_pipeline)
    assert 'anreichern' in unterschrift.parameters
    # Voreinstellung True: ein direkter Aufruf verhaelt sich wie vorher.
    assert unterschrift.parameters['anreichern'].default is True


def test_der_scan_indexiert_ohne_anzureichern():
    """Der eine Aufrufer, auf den es ankommt.

    Wenn der Scan-Zyklus wieder mit anreichern=True indexiert, ist die
    Stunde Wartezeit zurueck, ohne dass ein anderer Test es merkt.
    """
    import enhanced_indexer as ei
    quelle = inspect.getsource(ei.EnhancedDocumentIndexer._zyklus)
    assert "anreichern=False" in quelle, (
        "Der Scan-Zyklus reichert wieder waehrend des Indexierens an."
    )


def test_nachgeholt_wird_nur_ohne_rueckstau():
    """Neue Dateien haben Vorrang vor der Zusammenfassung alter."""
    import enhanced_indexer as ei
    quelle = inspect.getsource(ei.EnhancedDocumentIndexer._zyklus)
    bedingung = quelle.index("if not cap_reached:")
    aufruf = quelle.index("self._anreicherung_nachholen()")
    assert bedingung < aufruf
