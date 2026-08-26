"""Regressionstests: leerer Text ist kein Fehler, NUL-Bytes killen kein Dokument.

Gefunden beim Import einer echten 1-GB-Kundenablage (2026-08-18):

* Ein Logo-PNG ohne Schrift, Whiteboard-Fotos, die die OCR nicht lesen konnte,
  und eine 0-Byte-Markdown-Datei sind sauber geparst, nur ohne Text.
  ``parse_document`` muss dann ``''`` liefern, nicht ``None``; ``None`` heisst
  „nicht parsebar".
* NUL-Bytes im extrahierten PDF-Text („A string literal cannot contain NUL
  (0x00) characters") liessen den Schreibversuch scheitern. Der Parser
  bereinigt sie an der einen Stelle, an der alle Parser zusammenlaufen.

Seit Phase B4 lebt beides in ``document_parsers``; die Pipeline, die daran
hing, ist gefallen.
"""

import document_parsers as dp


def test_strip_nul_entfernt_nullbytes():
    assert dp.strip_nul('An\x00ge\x00bot') == 'Angebot'


def test_strip_nul_laesst_sauberen_text_unveraendert():
    assert dp.strip_nul('Angebot') == 'Angebot'
    assert dp.strip_nul('') == ''
    assert dp.strip_nul(None) is None


def test_parse_document_bereinigt_nullbytes_aus_dem_parser(monkeypatch):
    monkeypatch.setattr(dp, 'PARSERS', {'.pdf': lambda fh: 'Sei\x00te 1'})
    assert dp.parse_document(b'', 'angebot.pdf') == 'Seite 1'


def test_parse_document_liefert_none_bei_parser_fehler(monkeypatch):
    def kaputt(fh):
        raise ValueError('kaputt')

    monkeypatch.setattr(dp, 'PARSERS', {'.pdf': kaputt})
    assert dp.parse_document(b'', 'kaputt.pdf') is None


def test_parse_document_liefert_none_bei_unbekannter_endung():
    assert dp.parse_document(b'', 'archiv.zip') is None


def test_parse_document_liefert_leerstring_bei_textlosem_dokument(monkeypatch):
    monkeypatch.setattr(dp, 'PARSERS', {'.jpg': lambda fh: ''})
    # Wichtig: '' und nicht None; die OCR lief, sie fand nur nichts.
    assert dp.parse_document(b'', 'logo.jpg') == ''


def test_parse_txt_laeuft_echt():
    """Der eine Parser ohne schwere Abhaengigkeit laeuft hier ungestubbt."""
    assert dp.parse_document('Hallo Welt\n'.encode('utf-8'), 'notiz.txt') == 'Hallo Welt'
    assert dp.parse_document('Größe'.encode('latin-1'), 'alt.txt') == 'Größe'
