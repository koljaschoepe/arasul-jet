"""Plan 023 G4: erst indexieren, dann anreichern.

Am 22.08.2026 auf dem Orin gemessen, an einer Datei mit wenigen Zeilen:

    15:26:03  Generating summary
    15:26:37  Categorizing          (34 s spaeter)
    15:26:56  Extracting topics     (weitere 19 s)

Jede dieser Zeilen ist ein Aufruf ans Sprachmodell. Das Dokument wurde erst
NACH alldem auf `indexed` gesetzt, war also ueber eine Minute lang nicht
auffindbar, obwohl der Textlayer in rund einer Sekunde fertig gewesen waere.

Die Anreicherung ist Beiwerk; die Auffindbarkeit ist die Zusage.
"""

import inspect

import document_processor as dp  # noqa: E402


def _quelltext():
    return inspect.getsource(dp.run_indexing_pipeline)


def test_status_wird_vor_der_ki_analyse_gesetzt():
    """`indexed` steht, bevor das Sprachmodell ueberhaupt gefragt wird."""
    text = _quelltext()
    status_pos = text.index("update_document_status(doc_id, final_status")
    analyse_pos = text.index("analyzer.analyze_document(")
    assert status_pos < analyse_pos, (
        "Die KI-Analyse laeuft wieder VOR dem Statuswechsel. Damit ist ein "
        "Dokument erst nach mehreren Sprachmodell-Aufrufen auffindbar."
    )


def test_indexierung_laeuft_vor_der_ki_analyse():
    text = _quelltext()
    assert text.index("_index_to_qdrant(") < text.index("analyzer.analyze_document(")


def test_eine_gescheiterte_anreicherung_kippt_den_lauf_nicht():
    """Der Text ist indexiert; eine fehlende Zusammenfassung ist kein Fehlschlag."""
    text = _quelltext()
    analyse_pos = text.index("analyzer.analyze_document(")
    # Der Aufruf liegt in einem try-Block mit einem eigenen except davor/danach.
    davor = text[:analyse_pos]
    assert davor.rstrip().endswith(("try:", "(")) or "try:" in davor.split("Anreicherung")[-1]
    assert "Anreicherung fuer" in text


def test_die_kategorie_in_der_nutzlast_ist_bewusst_allgemein():
    """Sie ist zum Indexzeitpunkt noch nicht bekannt, und das ist in Ordnung.

    Der Wert landet ausschliesslich in der Qdrant-Nutzlast; die echte Kategorie
    steht an der Dokumentzeile, und von dort liest sie auch das Backend.
    """
    text = _quelltext()
    assert "'category_name': 'Allgemein'" in text
