"""Regression test for audit finding 'audit-partial-reindex'.

Bug: 'partial' documents (indexed-but-incomplete, P6-17) were not treated as
terminal by the auto-scan. ``scan_and_index`` only skipped ``'indexed'`` rows,
and ``process_new_document``'s early-return branches only matched
``'indexed'`` / ``'pending'`` / ``'failed'`` — so a ``'partial'`` row fell
through and was re-downloaded, reset to pending, re-analysed and fully
re-embedded on every 30s scan cycle forever, pinning the embedding GPU.

Fix (in ``enhanced_indexer``): treat ``'partial'`` like ``'indexed'`` in the
auto-scan — skip it in ``scan_and_index`` and short-circuit both hash lookups
in ``process_new_document``, returning the existing id without reprocessing.
The explicit ``/reindex`` endpoints are unaffected because they reset status to
``'pending'`` before re-enqueueing.

These tests stub the service's heavy sibling deps so they run without minio,
qdrant, spaCy, etc., and build an ``EnhancedDocumentIndexer`` via ``__new__`` to
drive ``process_new_document`` in isolation. ``_index_existing_document`` (the
reprocessing entry point) is replaced with a tripwire so any reprocessing is
observable as a call, not a heavyweight side effect.
"""

import os
import sys
import threading
import types

# --- Make the service package importable and stub heavy sibling deps ---------
_SERVICE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _SERVICE_DIR not in sys.path:
    sys.path.insert(0, _SERVICE_DIR)


def _stub(name, **attrs):
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    sys.modules.setdefault(name, module)
    return sys.modules[name]


# minio / minio.error
_minio = _stub("minio", Minio=object)
_stub("minio.error", S3Error=type("S3Error", (Exception,), {}))
_minio.error = sys.modules["minio.error"]

_stub("database", DatabaseManager=object)
_stub("ai_services", AIServices=object, DocumentAnalyzer=object)
_stub("entity_extractor", SPACY_AVAILABLE=False, extract_from_document=None)
_stub("graph_store", GraphStore=object)
_stub("embedding_client", EmbeddingClient=object)
_stub("qdrant_manager", QdrantManager=object)
_stub(
    "config",
    MINIO_HOST="h", MINIO_PORT=9000, MINIO_ROOT_USER="u",
    MINIO_ROOT_PASSWORD="p", MINIO_BUCKET="b", QDRANT_COLLECTION="c",
    INDEXER_INTERVAL=30, INDEXER_MAX_DOCS_PER_CYCLE=10, INDEXER_MAX_RETRIES=3,
    INDEXER_WATCHDOG_INTERVAL_SECONDS=60,
    MAX_FILE_SIZE_MB=100, MAX_FILE_SIZE_BYTES=100 * 1024 * 1024,
    ENABLE_AI_ANALYSIS=False, ENABLE_SIMILARITY=False,
    ENABLE_KNOWLEDGE_GRAPH=False, EMBEDDING_MODEL="bge-m3", POSTGRES_DSN="dsn",
)
_stub(
    "document_processor",
    calculate_content_hash=lambda data: "content-hash",
    calculate_file_hash=lambda filename, size: "file-hash",
    get_mime_type=lambda filename: "text/plain",
    parse_document=None,
    get_document_space_info=lambda *a, **k: {},
    contextualize_chunk=lambda text, *a, **k: text,
    run_indexing_pipeline=lambda *a, **k: 0,
    PARSERS={".txt": lambda *a, **k: ""},
    SUPPORTED_MIMES={"text/plain"},
)

import enhanced_indexer as ei  # noqa: E402


class _FakeDB:
    """Returns a stored document for both hash lookups; records mutations."""

    def __init__(self, status):
        self.doc = {"id": "doc-1", "status": status, "retry_count": 0}
        self.status_updates = []
        self.updates = []
        self.created = []

    def get_document_by_hash(self, _content_hash):
        return dict(self.doc)

    def get_document_by_file_hash(self, _file_hash):
        return dict(self.doc)

    def update_document_status(self, doc_id, status, *a, **k):
        self.status_updates.append((doc_id, status))

    def update_document(self, doc_id, data):
        self.updates.append((doc_id, data))

    def create_document(self, data):
        self.created.append(data)
        return "doc-new"


def _make_indexer(db):
    """Build an indexer without running the heavy __init__, with the
    reprocessing entry point replaced by a call-recording tripwire."""
    idx = ei.EnhancedDocumentIndexer.__new__(ei.EnhancedDocumentIndexer)
    idx.parsers = {".txt": lambda *a, **k: ""}
    idx.db = db
    idx._status_lock = threading.Lock()
    idx.status = {"current_document": None}
    idx._reindex_calls = []

    def _tripwire(doc_id, *a, **k):
        idx._reindex_calls.append(doc_id)
        return doc_id

    idx._index_existing_document = _tripwire
    return idx


def test_partial_document_not_reprocessed():
    """A 'partial' document must be returned as-is, never re-indexed."""
    db = _FakeDB(status="partial")
    idx = _make_indexer(db)

    result = idx.process_new_document("uploads/report.txt", b"hello world")

    assert result == "doc-1"
    # Terminal: no reprocessing, no status flip to 'pending', no record rewrite,
    # no new record created.
    assert idx._reindex_calls == []
    assert db.status_updates == []
    assert db.updates == []
    assert db.created == []


def test_pending_document_still_reprocessed():
    """Guard: a genuinely 'pending' doc must still be re-indexed, proving
    'partial' is special-cased and we did not short-circuit every status."""
    db = _FakeDB(status="pending")
    idx = _make_indexer(db)

    result = idx.process_new_document("uploads/report.txt", b"hello world")

    assert idx._reindex_calls == ["doc-1"], "pending doc should be reprocessed"
    assert result == "doc-1"


if __name__ == "__main__":
    test_partial_document_not_reprocessed()
    test_pending_document_still_reprocessed()
    print("audit-partial-reindex regression tests passed")
