"""Gemeinsames Test-Geruest fuer den document-indexer.

Die Tests laufen bewusst OHNE die schweren Parser-Abhaengigkeiten (PyMuPDF,
pdfplumber, python-docx, Pillow, pytesseract). Statt sie zu installieren,
werden sie hier durch leichte Stubs ersetzt; Flask und PyYAML sind echt
(requirements-test.txt).

``_stub`` fuellt nur Luecken (``hasattr``-Pruefung): ist ein Modul echt
installiert, bleibt es unangetastet. Tests, die einen Parser gezielt
nachbilden wollen, legen ihre eigene Attrappe VOR dem Import ab
(siehe test_pdf_open_once.py).

`libs/shared-python` (structured_logging) kopiert das Dockerfile ins Image;
im Checkout liegt es daneben. CI setzt PYTHONPATH, lokal hilft der Eintrag
unten.
"""

import os
import sys
import types

_SERVICE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SHARED_DIR = os.path.join(os.path.dirname(os.path.dirname(_SERVICE_DIR)),
                           'libs', 'shared-python')
for _pfad in (_SERVICE_DIR, _SHARED_DIR):
    if _pfad not in sys.path:
        sys.path.insert(0, _pfad)


def _stub(name, **attrs):
    """Legt ein Stub-Modul an oder ergaenzt fehlende Attribute daran."""
    module = sys.modules.get(name)
    if module is None:
        try:
            module = __import__(name)
        except ImportError:
            module = types.ModuleType(name)
            sys.modules[name] = module
    for key, value in attrs.items():
        if not hasattr(module, key):
            setattr(module, key, value)
    return module


class _FakeFitzDoc:
    """Leeres PDF: keine Seiten, keine Metadaten."""

    metadata = {}

    def __len__(self):
        return 0

    def __iter__(self):
        return iter(())

    def __getitem__(self, idx):
        raise IndexError(idx)

    def close(self):
        pass


_stub("fitz", open=lambda *a, **k: _FakeFitzDoc())
_stub("pdfplumber", open=lambda *a, **k: None)
_stub("docx", Document=object)
_pil = _stub("PIL", Image=None)
_stub("PIL.Image", open=lambda *a, **k: None)
_pil.Image = sys.modules["PIL.Image"]
_stub("pytesseract",
      get_tesseract_version=lambda: (_ for _ in ()).throw(RuntimeError("kein tesseract")),
      image_to_string=lambda *a, **k: "")
