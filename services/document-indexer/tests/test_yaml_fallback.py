"""Regressionstest: YAML ohne Arasul-Tabellenstruktur muss trotzdem Text liefern.

Gefunden am 2026-08-18 im Testprojekt „Projekte – Development": zwei
OpenAPI-Spezifikationen (`kontaktanliegen-open_api_3.yaml`,
`kontaktanliegen_keycloak_open_api_3.yaml`) wurden auf 'stored' gesetzt —
also als „geparst, aber ohne Textinhalt" behandelt.

Ursache: `parse_yaml_table` ist auf das Arasul-Tabellenformat zugeschnitten
(`_meta` / `columns` / `rows`). Findet es keinen dieser Schluessel, bleibt
`text_parts` leer und die Funktion liefert einen LEEREN String. Fuer jedes
andere YAML — OpenAPI, CI-Konfiguration, docker-compose — hiess das: still
nicht auffindbar, ohne Fehler, ohne Hinweis.

Dazu ein Fall, der vorher gar nicht durchlief: ein YAML mit Liste auf oberster
Ebene lief in ein AttributeError auf `data.get` und galt als „nicht parsebar"
('failed').
"""

import importlib.util
import os
import sys
import types
from io import BytesIO


def _echtes_document_parsers():
    """Laedt document_parsers.py mit Attrappen fuer die schweren Importe.

    conftest.py legt unter `document_parsers` einen Stub ab (fuer alle Tests,
    die document_processor laden). Hier wird das echte Modul gebraucht, also
    unter EIGENEM Namen geladen — sys.modules bleibt unberuehrt.
    """
    for name, attrs in (
        ("fitz", {"open": None}),
        ("pdfplumber", {"open": None}),
        ("docx", {"Document": object}),
        ("markdown", {"markdown": lambda *a, **k: ""}),
    ):
        if name not in sys.modules:
            modul = types.ModuleType(name)
            for k, v in attrs.items():
                setattr(modul, k, v)
            sys.modules[name] = modul

    pfad = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'document_parsers.py',
    )
    # test_pdf_open_once legt eine Attrappe unter `yaml` ab. Gegen die zu
    # testen wuerde nur die Attrappe pruefen — also fuer den Ladevorgang das
    # echte PyYAML einsetzen und die Attrappe danach zurueckstellen. Unser
    # Modul haelt dann eine Referenz auf das echte.
    stub_yaml = sys.modules.pop('yaml', None)
    try:
        import yaml  # noqa: F401  — echtes PyYAML
        spec = importlib.util.spec_from_file_location('document_parsers_echt', pfad)
        modul = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(modul)
    finally:
        if stub_yaml is not None:
            sys.modules['yaml'] = stub_yaml
    return modul


dp = _echtes_document_parsers()


def _parse(text: str) -> str:
    return dp.parse_yaml_table(BytesIO(text.encode('utf-8')))


OPENAPI = """\
openapi: 3.0.1
info:
  title: Kontaktanliegen API
  description: Anliegen von Kunden entgegennehmen
paths:
  /kontaktanliegen:
    post:
      summary: Neues Anliegen anlegen
"""

TABELLE = """\
_meta:
  name: Kundenliste
  description: Alle aktiven Kunden
columns:
  - slug: firma
    name: Firma
rows:
  - firma: UNIT IX
"""


def test_openapi_yaml_wird_als_text_indexiert():
    ergebnis = _parse(OPENAPI)
    # Der eigentliche Regressionsfall: vorher kam hier '' heraus.
    assert ergebnis.strip()
    assert 'Kontaktanliegen API' in ergebnis
    assert '/kontaktanliegen' in ergebnis


def test_tabellen_yaml_behaelt_seine_aufbereitung():
    """Das Arasul-Format darf NICHT in den Rohtext-Fallback rutschen."""
    ergebnis = _parse(TABELLE)
    assert 'Tabelle: Kundenliste' in ergebnis
    assert 'Spalten: Firma' in ergebnis
    # Aufbereitet, nicht roh durchgereicht.
    assert '_meta:' not in ergebnis


def test_yaml_mit_liste_auf_oberster_ebene_bricht_nicht_ab():
    ergebnis = _parse("- eins\n- zwei\n")
    assert 'eins' in ergebnis and 'zwei' in ergebnis


def test_kommentar_nur_yaml_liefert_seinen_text():
    ergebnis = _parse("# Nur eine Notiz zur Konfiguration\n")
    assert 'Notiz zur Konfiguration' in ergebnis


def test_kaputtes_yaml_liefert_den_rohtext_statt_leer():
    # Bestandsverhalten, hier nur festgeschrieben: ungueltige Einrueckung
    # -> YAMLError -> der Fehlerzweig reicht den Rohtext durch.
    ergebnis = _parse("a: 1\n  b: 2\n   c: 3\n")
    assert 'a: 1' in ergebnis


def test_wirklich_leere_datei_bleibt_leer():
    assert _parse("") == ""
    assert _parse("   \n\n") == ""
