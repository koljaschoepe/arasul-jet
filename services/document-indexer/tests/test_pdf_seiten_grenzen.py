"""Grenzen von `/pdf-seiten` gegen eine PDF-Bombe (06.10.2026).

Echte PDFs, erzeugt mit PyMuPDF: eines mit einem eingebetteten Bild ueber der
Pixelgrenze, eines, das normal durchgeht, und dasselbe mit einer Zeitgrenze,
die kein Rendern schafft.
"""

# `pymupdf` statt `fitz`: test_pdf_open_once ersetzt `fitz` in sys.modules durch
# eine Attrappe, und die gilt fuer alle Tests danach.
import pymupdf as fitz
import pytest

import document_parsers


def _pdf_mit_bild(breite, hoehe):
    pix = fitz.Pixmap(fitz.csGRAY, fitz.IRect(0, 0, breite, hoehe), False)
    pix.clear_with(255)
    doc = fitz.open()
    seite = doc.new_page(width=595, height=842)
    seite.insert_image(seite.rect, pixmap=pix)
    daten = doc.tobytes()
    doc.close()
    return daten


def test_ein_normales_pdf_wird_gerendert():
    bilder, gesamt = document_parsers.render_pdf_pages(_pdf_mit_bild(200, 300), 4)
    assert gesamt == 1
    assert len(bilder) == 1
    assert bilder[0].startswith(b'\x89PNG')


def test_ein_bild_ueber_der_pixelgrenze_wird_abgewiesen(monkeypatch):
    # Die Grenze gilt im Kindprozess; dort wirkt kein monkeypatch. Also ein
    # Bild, das wirklich darueber liegt, aber als Graustufe mit einer Farbe
    # klein komprimiert: 8000 x 7000 = 56 Megapixel.
    daten = _pdf_mit_bild(8000, 7000)
    with pytest.raises(ValueError, match='Megapixel'):
        document_parsers.render_pdf_pages(daten, 1)


def test_zu_langsames_rendern_wird_abgebrochen():
    with pytest.raises(ValueError, match='laenger als'):
        document_parsers.render_pdf_pages(_pdf_mit_bild(200, 300), 1, zeit_s=0.000001)


def test_kaputtes_pdf_bleibt_ein_valueerror():
    with pytest.raises(ValueError, match='nicht lesbar'):
        document_parsers.render_pdf_pages(b'%PDF-1.7 kaputt', 1)
