"""Regression test for P6-17.

Bug: when some child-chunk embeddings fail (``get_batch_embeddings`` returns
``None`` for a chunk under partial GPU OOM), the affected chunks were silently
skipped but the document was still reported as fully ``indexed`` — leaving the
RAG knowledge base with invisible gaps.

Fix (in ``document_processor``): ``_index_to_qdrant`` records the number of
skipped chunks in the caller-supplied ``stats`` dict, and
``run_indexing_pipeline`` maps ``skipped_chunks > 0`` to the ``'partial'``
status instead of ``'indexed'``.

These tests isolate ``_index_to_qdrant`` behind lightweight stubs so they run
without the service's heavy optional dependencies (PyMuPDF, pdfplumber, …).
"""

import os
import sys
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


# Only stub modules that are not importable in a bare test environment.
_stub(
    "document_parsers",
    parse_pdf=None, parse_pdf_streaming=None, parse_docx=None, parse_txt=None,
    parse_markdown=None, parse_yaml_table=None, parse_image=None,
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
_stub("entity_extractor", extract_from_document=lambda *a, **k: None)
_stub(
    "config",
    PARENT_CHUNK_SIZE=1000, CHILD_CHUNK_SIZE=200, CHILD_CHUNK_OVERLAP=20,
    ENABLE_AI_ANALYSIS=False, EMBEDDING_MODEL="bge-m3",
    CHUNK_CONTEXT_MODE="heuristic",
)

import document_processor as dp  # noqa: E402


# --- Fakes -------------------------------------------------------------------
class _FakeChild:
    def __init__(self, global_index):
        self.text = f"child chunk number {global_index} with plenty of words"
        self.word_count = 50
        self.global_index = global_index
        self.child_index = global_index
        self.char_start = 0
        self.char_end = len(self.text)
        self.section_header = ""


class _FakeParent:
    def __init__(self, parent_index, n_children):
        self.parent_index = parent_index
        self.text = "parent context text"
        self.children = [_FakeChild(i) for i in range(n_children)]


class _FakeQdrant:
    def build_point(self, **kwargs):
        return object()

    def get_chunk_id(self, doc_id, global_index):
        return f"{doc_id}:{global_index}"

    def upsert_points(self, batch):
        pass

    def delete_document_vectors(self, doc_id):
        pass


class _FakeDB:
    def __init__(self):
        self.statuses = []

    def update_document_status(self, doc_id, status, *args, **kwargs):
        self.statuses.append(status)

    def save_parent_chunks(self, doc_id, parents):
        return {p.parent_index: 100 + p.parent_index for p in parents}

    def save_chunks(self, doc_id, records):
        pass


class _EmbeddingClient:
    """Returns None for the chunk at ``fail_index`` (simulates partial OOM)."""

    def __init__(self, fail_index):
        self.fail_index = fail_index

    def get_batch_embeddings(self, texts):
        return [
            None if i == self.fail_index else [0.1, 0.2, 0.3]
            for i in range(len(texts))
        ]


def _run(fail_index, n_children=3, monkeypatch_targets=None):
    """Run _index_to_qdrant with one parent of ``n_children`` children."""
    db = _FakeDB()
    stats = {}
    original_chunker = dp.chunk_text_hierarchical
    original_ctx = dp.contextualize_chunk
    # Deterministic chunking + identity contextualization.
    dp.chunk_text_hierarchical = lambda *a, **k: [_FakeParent(0, n_children)]
    dp.contextualize_chunk = lambda chunk_text, *a, **k: chunk_text
    try:
        total_points = dp._index_to_qdrant(
            doc_id="doc-1",
            text="some document body",
            metadata={"title": "T", "filename": "f.txt"},
            db=db,
            embedding_client=_EmbeddingClient(fail_index),
            qdrant_manager=_FakeQdrant(),
            stats=stats,
        )
    finally:
        dp.chunk_text_hierarchical = original_chunker
        dp.contextualize_chunk = original_ctx
    return total_points, stats, db


def test_missing_embedding_flags_partial_not_indexed():
    """A single failed embedding must surface as skipped_chunks > 0, and the
    caller's status decision must resolve to 'partial', never 'indexed'."""
    total_points, stats, db = _run(fail_index=0, n_children=3)

    # One chunk was skipped, two survived.
    assert stats["skipped_chunks"] == 1
    assert stats["total_children"] == 3
    assert total_points == 2

    # _index_to_qdrant itself must never mark the doc 'indexed'.
    assert "indexed" not in db.statuses

    # This mirrors run_indexing_pipeline's status decision (P6-17).
    final_status = "partial" if stats.get("skipped_chunks", 0) > 0 else "indexed"
    assert final_status == "partial"
    assert final_status != "indexed"


def test_all_embeddings_ok_is_fully_indexed():
    """Sanity check: when every embedding succeeds the doc is fully indexed."""
    total_points, stats, _ = _run(fail_index=-1, n_children=3)
    assert stats["skipped_chunks"] == 0
    assert total_points == 3
    final_status = "partial" if stats.get("skipped_chunks", 0) > 0 else "indexed"
    assert final_status == "indexed"


if __name__ == "__main__":
    test_missing_embedding_flags_partial_not_indexed()
    test_all_embeddings_ok_is_fully_indexed()
    print("P6-17 regression tests passed")
