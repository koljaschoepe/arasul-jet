"""Regressionstest: gleicher Inhalt unter zwei Pfaden darf die Warteschlange nicht blockieren.

Gefunden am 2026-08-18 an einer echten 1-GB-Ablage. Die Indexierung blieb bei
690 von 1014 Dokumenten stehen, ohne dass ein Zähler etwas anzeigte.

`documents.content_hash` trägt einen UNIQUE-Index (Migration 052). Der
Ordner-Sync weiss das und legt Duplikate bewusst nur EINMAL an. Der
MinIO-Scanner (`process_new_document`) tat es nicht: Er ging direkt auf
`create_document` und lief in eine `UniqueViolation`. Die flog in den
allgemeinen Fehler-Handler, wo `doc_id` noch `None` ist — es wurde also KEIN
Status geschrieben, und dieselbe Datei scheiterte im nächsten Zyklus wieder.

Bei `INDEXER_MAX_DOCS_PER_CYCLE = 10` reichen zehn solcher Dateien, um das
gesamte Zyklusbudget zu verbrauchen. Genau das war passiert: mehrere identische
Logos plus zwei 0-Byte-Dateien (die teilen sich den Leerstring-Hash
``e3b0c442…b855``) hielten die Schleife dauerhaft besetzt.
"""

import threading

import enhanced_indexer as ei  # noqa: E402
from psycopg2.errors import UniqueViolation  # noqa: E402


class _DB:
    """Kennt den Inhalt bereits unter einem ANDEREN Pfad."""

    def __init__(self, treffer_nach_hash=True, create_wirft=False):
        self.treffer_nach_hash = treffer_nach_hash
        self.create_wirft = create_wirft
        self.created = []
        self.status_updates = []
        self.updates = []

    def get_document_by_filename(self, _n):
        return None

    def get_document_by_file_hash(self, _h):
        return None

    def get_document_by_hash(self, _content_hash):
        if not self.treffer_nach_hash:
            return None
        return {'id': 'doc-vorhanden', 'status': 'stored'}

    def create_document(self, data):
        if self.create_wirft:
            self.create_wirft = False
            raise UniqueViolation('duplicate key value violates unique constraint')
        self.created.append(data)
        return 'doc-neu'

    def update_document(self, doc_id, data):
        self.updates.append((doc_id, data))

    def update_document_status(self, doc_id, status, *a, **k):
        self.status_updates.append((doc_id, status))

    def get_categories(self):
        return []


def _indexer(db):
    idx = ei.EnhancedDocumentIndexer.__new__(ei.EnhancedDocumentIndexer)
    idx.parsers = {'.png': lambda *a, **k: ''}
    idx.db = db
    idx._status_lock = threading.Lock()
    idx.status = {'current_document': None, 'documents_processed': 0}
    idx._index_existing_document = lambda doc_id, *a, **k: doc_id
    # Nur so viel, dass process_new_document bis create_document durchlaeuft;
    # was die Pipeline danach macht, prueft dieser Test nicht.
    idx.analyzer = None
    idx._embedding_client = None
    idx._qdrant_manager = None
    idx.graph_store = None
    return idx


def test_bekannter_inhalt_legt_keinen_zweiten_eintrag_an():
    db = _DB()
    idx = _indexer(db)

    ergebnis = idx.process_new_document('uploads/logo-kopie.png', b'gleicher inhalt')

    # Der vorhandene Eintrag wird uebernommen — kein create, kein Fehler.
    assert ergebnis == 'doc-vorhanden'
    assert db.created == []
    assert db.status_updates == []


def test_wettlauf_beim_anlegen_wird_aufgefangen():
    """Sync und Scanner gleichzeitig: create wirft, wir nehmen den vorhandenen."""
    db = _DB(treffer_nach_hash=False, create_wirft=True)

    # Erst nach dem fehlgeschlagenen create ist der Eintrag sichtbar.
    def spaeter_sichtbar(_content_hash, _db=db):
        return {'id': 'doc-parallel', 'status': 'pending'} if _db.create_wirft is False else None

    db.get_document_by_hash = spaeter_sichtbar
    idx = _indexer(db)

    ergebnis = idx.process_new_document('uploads/logo.png', b'gleicher inhalt')

    assert ergebnis == 'doc-parallel'
    assert db.created == []


def test_neuer_inhalt_wird_weiterhin_angelegt():
    """Gegenprobe: ohne Treffer darf der Scanner ganz normal anlegen."""
    db = _DB(treffer_nach_hash=False)
    idx = _indexer(db)

    idx.process_new_document('uploads/neu.png', b'frischer inhalt')

    assert len(db.created) == 1
    assert db.created[0]['filename'] == 'neu.png'
    assert db.created[0]['content_hash']
