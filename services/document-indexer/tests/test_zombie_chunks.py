"""Regression test für Plan 012 Phase F Schritt 17 — Zombie-Chunks.

Bug: Die Qdrant-Point-IDs sind deterministisch (``md5(f"{doc_id}:{index}")``).
Ein Re-Index überschrieb damit die Punkte ``0..N-1``, ließ aber ``N..M`` einer
früheren, LÄNGEREN Fassung stehen. Ergebnis: gelöschter Text blieb durchsuchbar
("Zombie-Chunks"). Postgres war bereits sauber (``save_chunks`` /
``save_parent_chunks`` löschen vor dem Einfügen) — nur Qdrant leckte.

Fix (``document_processor._index_to_qdrant``): vor dem Upsert einmal
``qdrant_manager.delete_document_vectors(doc_id)`` — und zwar erst, NACHDEM die
0-Chunk-Fälle per ``return 0`` abgefangen sind, damit nie gelöscht wird, ohne
dass gleich neue Chunks folgen.

Zusätzlich geprüft: das Content-Hash-Gate (``is_unchanged_and_complete``).

Die Tests isolieren ``_index_to_qdrant`` hinter leichten Stubs, damit sie ohne
die schweren optionalen Abhängigkeiten des Dienstes laufen.
"""

import os
import sys
import types

_SERVICE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _SERVICE_DIR not in sys.path:
    sys.path.insert(0, _SERVICE_DIR)


def _stub(name, **attrs):
    module = types.ModuleType(name)
    for key, value in attrs.items():
        setattr(module, key, value)
    sys.modules.setdefault(name, module)
    return sys.modules[name]


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


class _RecordingQdrant:
    """Bildet den Qdrant-Zustand als Menge von Point-IDs nach.

    Wichtig: ``upsert`` überschreibt nur gleiche IDs — genau das Verhalten, das
    ohne vorheriges Löschen die Zombies entstehen ließ.
    """

    def __init__(self):
        self.points = set()
        self.calls = []

    def get_chunk_id(self, doc_id, global_index):
        return f"{doc_id}:{global_index}"

    def build_point(self, **kwargs):
        # Der echte Manager bildet die ID deterministisch aus
        # (doc_id, chunk_global_index) — genau das ist die Ursache des Bugs.
        return self.get_chunk_id(kwargs["doc_id"], kwargs["chunk_global_index"])

    def upsert_points(self, batch):
        self.calls.append("upsert")
        for point_id in batch:
            self.points.add(point_id)

    def delete_document_vectors(self, doc_id):
        self.calls.append("delete")
        self.points = {p for p in self.points if not str(p).startswith(f"{doc_id}:")}


class _FakeDB:
    def __init__(self, doc=None):
        self.statuses = []
        self._doc = doc

    def update_document_status(self, doc_id, status, *args, **kwargs):
        self.statuses.append(status)

    def save_parent_chunks(self, doc_id, parents):
        return {p.parent_index: 100 + p.parent_index for p in parents}

    def save_chunks(self, doc_id, records):
        pass

    def get_document(self, doc_id):
        return self._doc


class _EmbeddingClient:
    def get_batch_embeddings(self, texts):
        return [[0.1, 0.2, 0.3] for _ in texts]


def _index(qdrant, db, n_children, doc_id="doc-1"):
    """Treibt _index_to_qdrant mit genau ``n_children`` Kind-Chunks."""
    original_chunker = dp.chunk_text_hierarchical
    original_ctx = dp.contextualize_chunk
    dp.chunk_text_hierarchical = lambda *a, **k: [_FakeParent(0, n_children)]
    dp.contextualize_chunk = lambda chunk_text, *a, **k: chunk_text
    try:
        return dp._index_to_qdrant(
            doc_id=doc_id,
            text="some document body",
            metadata={"title": "T", "filename": "f.txt"},
            db=db,
            embedding_client=_EmbeddingClient(),
            qdrant_manager=qdrant,
            stats={},
        )
    finally:
        dp.chunk_text_hierarchical = original_chunker
        dp.contextualize_chunk = original_ctx


def test_kuerzeres_dokument_hinterlaesst_keine_zombie_chunks():
    """Das eigentliche Szenario: 5 Chunks -> Dokument gekürzt -> 2 Chunks.

    Ohne delete-before-upsert überlebten die Punkte 2,3,4 der alten Fassung.
    """
    qdrant = _RecordingQdrant()
    db = _FakeDB()

    assert _index(qdrant, db, n_children=5) == 5
    assert qdrant.points == {f"doc-1:{i}" for i in range(5)}

    # Dokument wird geändert und produziert nur noch zwei Chunks.
    assert _index(qdrant, db, n_children=2) == 2

    # Genau die zwei neuen Chunks — keine Reste der längeren Fassung.
    assert qdrant.points == {"doc-1:0", "doc-1:1"}
    assert "doc-1:4" not in qdrant.points


def test_geloescht_wird_vor_dem_upsert():
    """Reihenfolge zählt: erst löschen, dann einfügen.

    Andersherum wäre das frisch Eingefügte gleich wieder weg.
    """
    qdrant = _RecordingQdrant()
    _index(qdrant, _FakeDB(), n_children=3)
    assert qdrant.calls[0] == "delete"
    assert "upsert" in qdrant.calls[1:]


def test_kein_loeschen_wenn_keine_chunks_entstehen():
    """Produziert das Chunking nichts, dürfen die alten Vektoren NICHT weg sein.

    Sonst würde ein Parser-Aussetzer ein bis dahin gut indexiertes Dokument
    stillschweigend aus der Suche entfernen.
    """
    qdrant = _RecordingQdrant()
    qdrant.points = {"doc-1:0", "doc-1:1"}

    original_chunker = dp.chunk_text_hierarchical
    dp.chunk_text_hierarchical = lambda *a, **k: []
    try:
        assert _index(qdrant, _FakeDB(), n_children=0) == 0
    finally:
        dp.chunk_text_hierarchical = original_chunker

    assert "delete" not in qdrant.calls
    assert qdrant.points == {"doc-1:0", "doc-1:1"}


# --- Content-Hash-Gate -------------------------------------------------------

def test_hash_gate_ueberspringt_unveraendertes_vollstaendiges_dokument():
    db = _FakeDB({"status": "indexed", "content_hash": "abc", "chunk_count": 7})
    assert dp.is_unchanged_and_complete(db, "doc-1", "abc") is True


def test_hash_gate_greift_nicht_bei_geaendertem_inhalt():
    db = _FakeDB({"status": "indexed", "content_hash": "abc", "chunk_count": 7})
    assert dp.is_unchanged_and_complete(db, "doc-1", "xyz") is False


def test_hash_gate_greift_nicht_bei_partial():
    """'partial' ist unvollständig — der gleiche Hash rechtfertigt kein Skip."""
    db = _FakeDB({"status": "partial", "content_hash": "abc", "chunk_count": 3})
    assert dp.is_unchanged_and_complete(db, "doc-1", "abc") is False


def test_hash_gate_greift_nicht_ohne_chunks_oder_dokument():
    assert dp.is_unchanged_and_complete(_FakeDB(None), "doc-1", "abc") is False
    db = _FakeDB({"status": "indexed", "content_hash": "abc", "chunk_count": 0})
    assert dp.is_unchanged_and_complete(db, "doc-1", "abc") is False
    # Ohne Hash gibt es nichts zu vergleichen.
    db2 = _FakeDB({"status": "indexed", "content_hash": "", "chunk_count": 3})
    assert dp.is_unchanged_and_complete(db2, "doc-1", "") is False
