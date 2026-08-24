"""Gemeinsames Test-Geruest fuer den document-indexer.

Die Tests laufen bewusst OHNE die schweren Laufzeit-Abhaengigkeiten des
Services (PyMuPDF, pdfplumber, spacy, psycopg2, …). Statt sie zu
installieren, werden die Geschwister-Module hier durch leichte Stubs ersetzt.

Warum zentral und nicht je Testdatei: Genau diese Stub-Liste stand vorher in
JEDER Testdatei noch einmal. Als die Produktions-Imports wuchsen
(``parse_html``, ``SPACY_AVAILABLE``, ``EMBEDDING_ENABLED``), wuchsen die Kopien
nicht mit — und weil ``document-indexer`` nicht in der CI-Matrix stand, fiel
monatelang niemandem auf, dass sich KEINE der Tests mehr auch nur einsammeln
liess. Eine Liste an einer Stelle kann noch veralten, aber dann fuer alle
sichtbar auf einmal.

``_stub`` fuellt nur Luecken (``hasattr``-Pruefung): ist ein Modul echt
installiert, bleibt es unangetastet.
"""

import os
import sys
import types

_SERVICE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _SERVICE_DIR not in sys.path:
    sys.path.insert(0, _SERVICE_DIR)


def _stub(name, **attrs):
    """Legt ein Stub-Modul an oder ergaenzt fehlende Attribute daran."""
    module = sys.modules.get(name)
    if module is None:
        module = types.ModuleType(name)
        sys.modules[name] = module
    for key, value in attrs.items():
        if not hasattr(module, key):
            setattr(module, key, value)
    return module


_stub(
    "document_parsers",
    parse_pdf=None, parse_pdf_streaming=None, parse_docx=None, parse_txt=None,
    parse_markdown=None, parse_yaml_table=None, parse_image=None,
    parse_html=None,
)
_stub(
    "metadata_extractor",
    extract_metadata=lambda *a, **k: {},
    extract_key_topics=lambda *a, **k: [],
)
_stub(
    "text_chunker",
    chunk_text_hierarchical=lambda *a, **k: [],
    MIN_CHILD_WORDS=1,
)
_stub("spell_corrector", update_domain_dictionary=lambda *a, **k: None,
      flush_domain_dictionary=lambda *a, **k: False)
_stub(
    "entity_extractor",
    extract_from_document=lambda *a, **k: None,
    SPACY_AVAILABLE=False,
)
_stub("graph_store", GraphStore=object)
_stub("database", DatabaseManager=object)
# `requests` steht hier stellvertretend fuer die Netz-Abhaengigkeit von
# ai_services. Mit dem Stub laesst sich das ECHTE Modul importieren, statt es
# selbst durch einen Platzhalter zu ersetzen: nur so lassen sich seine Regeln
# pruefen (Plan 023 G4, die unterbrechbare Analyse).
_stub("requests", get=lambda *a, **k: None, post=lambda *a, **k: None,
      exceptions=types.SimpleNamespace(RequestException=Exception,
                                       Timeout=Exception,
                                       ConnectionError=Exception))
try:
    import ai_services  # noqa: F401
except Exception:  # pragma: no cover — Rueckfall, falls neue Importe dazukommen
    _stub("ai_services", AIServices=object, DocumentAnalyzer=object)
_stub("embedding_client", EmbeddingClient=object)
_stub("bm25_index", BM25Index=object)
_minio = _stub("minio", Minio=object)
_stub("minio.error", S3Error=type("S3Error", (Exception,), {}))
_minio.error = sys.modules["minio.error"]


class _UniqueViolation(Exception):
    """Steht fuer psycopg2.errors.UniqueViolation (echtes psycopg2 fehlt hier)."""


_stub("psycopg2", errors=None)
_stub("psycopg2.errors", UniqueViolation=_UniqueViolation)
# `import psycopg2.errors` braucht das Attribut am Elternmodul.
sys.modules["psycopg2"].errors = sys.modules["psycopg2.errors"]

# Alles, was document_processor UND enhanced_indexer aus config ziehen.
_stub(
    "config",
    PARENT_CHUNK_SIZE=1000, CHILD_CHUNK_SIZE=200, CHILD_CHUNK_OVERLAP=20,
    ENABLE_AI_ANALYSIS=False, ENABLE_SIMILARITY=False,
    ENABLE_KNOWLEDGE_GRAPH=False,
    EMBEDDING_MODEL="bge-m3", CHUNK_CONTEXT_MODE="heuristic",
    EMBEDDING_ENABLED=True,
    MINIO_HOST="h", MINIO_PORT=9000, MINIO_ROOT_USER="u",
    MINIO_ROOT_PASSWORD="p", MINIO_BUCKET="b", QDRANT_COLLECTION="c",
    EMBEDDING_VECTOR_SIZE=1024, SIMILARITY_THRESHOLD=0.8,
    INDEXER_INTERVAL=30, INDEXER_MAX_DOCS_PER_CYCLE=10, INDEXER_MAX_RETRIES=3,
    INDEXER_NACHBRENNER=2,
    INDEXER_ANREICHERUNG_PRO_ZYKLUS=3,
    INDEXER_WATCHDOG_INTERVAL_SECONDS=60,
    PARTIAL_REPICKUP_INTERVAL_SECONDS=300,
    PARTIAL_REPICKUP_MAX_ATTEMPTS=3,
    PARTIAL_REPICKUP_BATCH=10,
    MAX_FILE_SIZE_MB=100, MAX_FILE_SIZE_BYTES=100 * 1024 * 1024,
    POSTGRES_DSN="postgresql://localhost/test",
)
