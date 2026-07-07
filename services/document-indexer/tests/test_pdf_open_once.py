"""Regression test for audit finding ``audit-pdf-open-once``.

Bug: the PDF parsers (``parse_pdf`` and ``parse_pdf_streaming``) reopened the
whole PDF with ``pdfplumber`` once *per page* for table extraction — O(pages)
full reparses of the multi-MB buffer. A 400-page document therefore took far
too long and blocked indexing.

Fix: open the document with ``pdfplumber`` exactly ONCE and reuse the open
object across all pages (via ``_format_tables_from_page``).

These tests stub the heavy optional dependencies (PyMuPDF, pdfplumber, …) so
they run in a bare environment: ``python3 tests/test_pdf_open_once.py``.
"""

import os
import sys
import types

# --- Make the service package importable -------------------------------------
_SERVICE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _SERVICE_DIR not in sys.path:
    sys.path.insert(0, _SERVICE_DIR)


# --- Fake PyMuPDF (fitz) -----------------------------------------------------
class _FakeFitzPage:
    def __init__(self, text):
        self._text = text

    def get_text(self, _mode):
        return self._text


class _FakeFitzDoc:
    def __init__(self, texts):
        self._pages = [_FakeFitzPage(t) for t in texts]
        self.closed = False

    def __len__(self):
        return len(self._pages)

    def __getitem__(self, idx):
        return self._pages[idx]

    def close(self):
        self.closed = True


# Page texts used by every fake document in this module.
_PAGE_TEXTS = ["Page one body", "Page two body", "Page three body"]

# Table returned for page index 1 only (to prove tables still flow through).
_PAGE_TABLES = {
    1: [[["A", "B"], ["1", None]]],
}


def _make_fitz_module():
    mod = types.ModuleType("fitz")

    def _open(stream=None, filetype=None):
        return _FakeFitzDoc(_PAGE_TEXTS)

    mod.open = _open
    return mod


# --- Fake pdfplumber (counts .open calls) ------------------------------------
class _OpenCounter:
    count = 0


class _FakePlumberPage:
    def __init__(self, page_num):
        self._page_num = page_num

    def extract_tables(self):
        return _PAGE_TABLES.get(self._page_num, [])


class _FakePlumberPdf:
    def __init__(self):
        self.pages = [_FakePlumberPage(i) for i in range(len(_PAGE_TEXTS))]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _make_pdfplumber_module():
    mod = types.ModuleType("pdfplumber")

    def _open(_source):
        _OpenCounter.count += 1
        return _FakePlumberPdf()

    mod.open = _open
    return mod


# --- Install stubs before importing the module under test --------------------
def _install_stubs():
    sys.modules["fitz"] = _make_fitz_module()
    sys.modules["pdfplumber"] = _make_pdfplumber_module()

    docx = types.ModuleType("docx")
    docx.Document = object
    sys.modules["docx"] = docx

    markdown = types.ModuleType("markdown")
    markdown.markdown = lambda *a, **k: ""
    sys.modules["markdown"] = markdown

    yaml = types.ModuleType("yaml")
    yaml.safe_load = lambda *a, **k: {}
    sys.modules["yaml"] = yaml


_install_stubs()

import document_parsers  # noqa: E402


class _FakeFile:
    """Minimal file-like object; contents are irrelevant to the fakes."""

    def __init__(self, data=b"%PDF-1.4 fake"):
        self._data = data

    def seek(self, _pos):
        return 0

    def read(self):
        return self._data


_EXPECTED_TABLE = "A | B\n1 | "  # None -> "" per the cleaner


def test_streaming_opens_pdfplumber_once():
    _OpenCounter.count = 0
    pages = list(document_parsers.parse_pdf_streaming(_FakeFile(), gc_interval=0))

    assert _OpenCounter.count == 1, (
        f"pdfplumber.open must be called once per document, "
        f"got {_OpenCounter.count} calls for {len(_PAGE_TEXTS)} pages"
    )
    # Page with a table carries the [Table] marker + formatted rows.
    assert any("[Table]" in p and _EXPECTED_TABLE in p for p in pages), pages
    # Every page's body text still comes through.
    assert any("Page one body" in p for p in pages)
    print("OK: parse_pdf_streaming opens pdfplumber once and emits tables")


def test_parse_pdf_opens_pdfplumber_once():
    _OpenCounter.count = 0
    text = document_parsers.parse_pdf(_FakeFile(), use_ocr=False)

    assert _OpenCounter.count == 1, (
        f"pdfplumber.open must be called once per document, "
        f"got {_OpenCounter.count} calls for {len(_PAGE_TEXTS)} pages"
    )
    assert "[Table]" in text and _EXPECTED_TABLE in text, text
    assert "Page one body" in text and "Page three body" in text
    print("OK: parse_pdf opens pdfplumber once and emits tables")


def test_format_tables_from_page_output():
    page = _FakePlumberPage(1)
    assert document_parsers._format_tables_from_page(page) == _EXPECTED_TABLE
    # Page without tables yields empty string.
    assert document_parsers._format_tables_from_page(_FakePlumberPage(0)) == ""
    print("OK: _format_tables_from_page formats rows and handles empty pages")


if __name__ == "__main__":
    test_streaming_opens_pdfplumber_once()
    test_parse_pdf_opens_pdfplumber_once()
    test_format_tables_from_page_output()
    print("\nAll tests passed.")
