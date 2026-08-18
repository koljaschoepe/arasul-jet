"""Gemeinsames Test-Geruest fuer den document-indexer.

Die Tests laufen bewusst OHNE die schweren Laufzeit-Abhaengigkeiten des
Services (PyMuPDF, pdfplumber, spacy, qdrant-client, psycopg2, …). Statt sie zu
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
_stub("spell_corrector", update_domain_dictionary=lambda *a, **k: None)
_stub(
    "entity_extractor",
    extract_from_document=lambda *a, **k: None,
    SPACY_AVAILABLE=False,
)
_stub("graph_store", GraphStore=object)
_stub("database", DatabaseManager=object)
_stub("ai_services", AIServices=object, DocumentAnalyzer=object)
_stub("embedding_client", EmbeddingClient=object)
_stub("bm25_index", BM25Index=object)
_stub("qdrant_client", QdrantClient=object)
_stub(
    "qdrant_client.models",
    Distance=object, VectorParams=object, PointStruct=object, Filter=object,
    FieldCondition=object, MatchValue=object, SparseVectorParams=object,
    SparseVector=object, Modifier=object, BinaryQuantization=object,
    BinaryQuantizationConfig=object, HnswConfigDiff=object, NamedVector=object,
)

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
    QDRANT_HOST="qdrant", QDRANT_PORT=6333,
    EMBEDDING_VECTOR_SIZE=1024, SIMILARITY_THRESHOLD=0.8,
    INDEXER_INTERVAL=30, INDEXER_MAX_DOCS_PER_CYCLE=10, INDEXER_MAX_RETRIES=3,
    INDEXER_WATCHDOG_INTERVAL_SECONDS=60,
    PARTIAL_REPICKUP_INTERVAL_SECONDS=300,
    PARTIAL_REPICKUP_MAX_ATTEMPTS=3,
    PARTIAL_REPICKUP_BATCH=10,
    MAX_FILE_SIZE_MB=100, MAX_FILE_SIZE_BYTES=100 * 1024 * 1024,
    POSTGRES_DSN="postgresql://localhost/test",
)
