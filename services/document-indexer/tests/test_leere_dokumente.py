"""Regressionstests: leerer Text ist kein Fehler, NUL-Bytes killen kein Dokument.

Gefunden beim Import einer echten 1-GB-Kundenablage (2026-08-18). Fuenf von
1014 Dokumenten landeten auf ``failed``:

* vier davon voellig zu Recht geparst, nur ohne Textinhalt — ein Logo-PNG ohne
  Schrift, zwei Whiteboard-Fotos, die die OCR nicht lesen konnte, und eine
  0-Byte-Markdown-Datei. ``parse_document`` lieferte ``''``, und der Aufrufer
  pruefte mit ``if not text:`` — damit war „kein Text" nicht von „nicht
  parsebar" zu unterscheiden. Folge: Status ``failed``, drei sinnlose
  Wiederholungen, danach dauerhaft ein roter Fehler im Explorer.
* eines an NUL-Bytes im extrahierten PDF-Text („A string literal cannot
  contain NUL (0x00) characters") — Postgres nimmt in ``text`` alles ausser
  0x00 an, der Parser lieferte sie mit.

Die Tests stubben die schweren Geschwister-Module, damit sie ohne PyMuPDF,
spacy & Co. laufen.
"""

import os
import sys

import document_processor as dp  # noqa: E402


# --- Fakes -------------------------------------------------------------------
class _FakeDB:
    """Merkt sich Statuswechsel; alles andere ist fuer diese Tests egal."""

    def __init__(self):
        self.calls = []

    def update_document_status(self, doc_id, status, error=None, chunk_count=None):
        self.calls.append((status, error))
        return True

    def get_document(self, doc_id):
        return {'id': doc_id}

    def get_categories(self):
        return []

    def update_document(self, doc_id, updates):
        return True


def _pipeline(text_return, filename='beispiel.md'):
    """run_indexing_pipeline mit fest verdrahtetem parse_document-Ergebnis."""
    db = _FakeDB()
    original_parse = dp.parse_document
    original_parsers = dp.PARSERS
    dp.parse_document = lambda data, name: text_return
    # PARSERS muss die Endung KENNEN, sonst greift vorher der Zweig
    # „nicht-indexierbarer Typ" und der Test misst etwas anderes.
    endung = os.path.splitext(filename.lower())[1]
    dp.PARSERS = {endung: lambda *a, **k: text_return}
    try:
        ergebnis = dp.run_indexing_pipeline(
            doc_id='11111111-2222-3333-4444-555555555555',
            data=b'',
            filename=filename,
            content_hash='hash',
            db=db,
            analyzer=None,
            graph_store=None,
        )
    finally:
        dp.parse_document = original_parse
        dp.PARSERS = original_parsers
    return ergebnis, db


# --- NUL-Bytes ---------------------------------------------------------------
def test_strip_nul_entfernt_nullbytes():
    assert dp.strip_nul('An\x00ge\x00bot') == 'Angebot'


def test_strip_nul_laesst_sauberen_text_unveraendert():
    assert dp.strip_nul('Angebot') == 'Angebot'
    assert dp.strip_nul('') == ''
    assert dp.strip_nul(None) is None


def test_parse_document_bereinigt_nullbytes_aus_dem_parser():
    original = dp.PARSERS
    dp.PARSERS = {'.pdf': lambda fh: 'Sei\x00te 1'}
    try:
        assert dp.parse_document(b'', 'angebot.pdf') == 'Seite 1'
    finally:
        dp.PARSERS = original


# --- Vertrag von parse_document: None != '' ----------------------------------
def test_parse_document_liefert_none_bei_parser_fehler():
    original = dp.PARSERS

    def kaputt(fh):
        raise ValueError('kaputt')

    dp.PARSERS = {'.pdf': kaputt}
    try:
        assert dp.parse_document(b'', 'kaputt.pdf') is None
    finally:
        dp.PARSERS = original


def test_parse_document_liefert_leerstring_bei_textlosem_dokument():
    original = dp.PARSERS
    dp.PARSERS = {'.jpg': lambda fh: ''}
    try:
        # Wichtig: '' und nicht None — die OCR lief, sie fand nur nichts.
        assert dp.parse_document(b'', 'logo.jpg') == ''
    finally:
        dp.PARSERS = original


# --- Der eigentliche Regressionsfall -----------------------------------------
def test_textloses_dokument_wird_stored_und_nicht_failed():
    ergebnis, db = _pipeline('', filename='logo.jpg')
    assert db.calls == [('stored', None)]
    # 0 (nicht None) => der Aufrufer behandelt es als erledigt, ohne Retry.
    assert ergebnis == 0


def test_nur_whitespace_zaehlt_ebenfalls_als_textlos():
    ergebnis, db = _pipeline('   \n\t  ', filename='leer.md')
    assert db.calls == [('stored', None)]
    assert ergebnis == 0


def test_nicht_parsebares_dokument_bleibt_failed():
    ergebnis, db = _pipeline(None, filename='kaputt.pdf')
    assert db.calls == [('failed', 'Failed to parse document')]
    assert ergebnis is None
