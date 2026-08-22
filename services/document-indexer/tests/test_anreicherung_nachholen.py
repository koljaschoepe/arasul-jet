"""Plan 023 G4: die Nachhol-Runde blockiert sich nicht selbst.

Die Abfrage sortiert nach `updated_at` aufsteigend, und ein gescheiterter
Versuch schreibt nichts. Ohne Gegenmassnahme stuende dasselbe Dokument in
JEDEM Zyklus wieder vorn, und alle anderen bekaemen nie eine Zusammenfassung.
Ein einziges kaputtes Dokument haette die Anreicherung fuer das ganze Geraet
angehalten.

Die Tests laufen am nackten Objekt (`object.__new__`), damit kein MinIO und
kein Postgres noetig ist: geprueft wird die Regel, nicht die Verdrahtung.
"""

import types

import enhanced_indexer as ei


class _Antwort:
    def __init__(self, daten):
        self._daten = daten

    def read(self):
        return self._daten

    def close(self):
        pass

    def release_conn(self):
        pass


class _Minio:
    def __init__(self, daten=b'# Titel\n\nEin Text mit genug Woertern darin.'):
        self._daten = daten

    def get_object(self, bucket, name):
        return _Antwort(self._daten)


class _Db:
    def __init__(self, offen):
        self._offen = list(offen)
        self.geschrieben = []

    def get_dokumente_ohne_anreicherung(self, limit=5):
        return self._offen[:limit]

    def update_document(self, doc_id, felder):
        self.geschrieben.append((doc_id, felder))


def _indexer(db, minio=None, analyzer=None):
    ix = object.__new__(ei.EnhancedDocumentIndexer)
    ix.db = db
    ix.minio_client = minio or _Minio()
    ix.analyzer = analyzer or types.SimpleNamespace()
    ix._anreicherung_versuche = {}
    return ix


DOK = {'id': 'a1', 'filename': 'notiz.md', 'file_path': '17_notiz.md'}


def test_erfolg_zaehlt_und_vergisst_den_versuch(monkeypatch):
    monkeypatch.setattr(ei, 'ENABLE_AI_ANALYSIS', True)
    monkeypatch.setattr(ei, 'reichere_an', lambda *a, **k: True)
    monkeypatch.setattr(ei, 'parse_document', lambda d, f: 'Text genug.')
    db = _Db([DOK])
    ix = _indexer(db)
    assert ix._anreicherung_nachholen() == 1
    assert ix._anreicherung_versuche == {}
    assert db.geschrieben == []


def test_ein_dauerfehler_blockiert_die_warteschlange_nicht(monkeypatch):
    """Nach drei Versuchen wird aufgegeben, statt ewig zu wiederholen."""
    monkeypatch.setattr(ei, 'ENABLE_AI_ANALYSIS', True)
    monkeypatch.setattr(ei, 'reichere_an', lambda *a, **k: False)
    monkeypatch.setattr(ei, 'parse_document', lambda d, f: 'Text genug.')
    db = _Db([DOK])
    ix = _indexer(db)
    for _ in range(ei.INDEXER_MAX_RETRIES):
        ix._anreicherung_nachholen()
    assert db.geschrieben == [('a1', {'summary': ''})], (
        "Nach den erlaubten Versuchen muss die Zeile stillgelegt werden, "
        "sonst steht sie in jedem Zyklus wieder vorn."
    )
    assert ix._anreicherung_versuche == {}


def test_eine_ausnahme_zaehlt_genauso(monkeypatch):
    """Eine kurz nicht erreichbare GPU wirft, statt False zu liefern."""
    monkeypatch.setattr(ei, 'ENABLE_AI_ANALYSIS', True)

    def kracht(*a, **k):
        raise RuntimeError('GPU weg')

    monkeypatch.setattr(ei, 'reichere_an', kracht)
    monkeypatch.setattr(ei, 'parse_document', lambda d, f: 'Text genug.')
    db = _Db([DOK])
    ix = _indexer(db)
    ix._anreicherung_nachholen()
    assert ix._anreicherung_versuche == {'a1': 1}
    assert db.geschrieben == []


def test_eine_datei_ohne_text_wird_sofort_stillgelegt(monkeypatch):
    """Ein Logo ohne Schrift bekommt nie eine Zusammenfassung. Kein Fehler."""
    monkeypatch.setattr(ei, 'ENABLE_AI_ANALYSIS', True)
    monkeypatch.setattr(ei, 'parse_document', lambda d, f: '   ')
    db = _Db([DOK])
    ix = _indexer(db)
    assert ix._anreicherung_nachholen() == 0
    assert db.geschrieben == [('a1', {'summary': ''})]


def test_ohne_ki_analyse_passiert_gar_nichts(monkeypatch):
    monkeypatch.setattr(ei, 'ENABLE_AI_ANALYSIS', False)
    db = _Db([DOK])
    assert _indexer(db)._anreicherung_nachholen() == 0
    assert db.geschrieben == []


def test_der_deckel_null_schaltet_das_nachholen_ab(monkeypatch):
    monkeypatch.setattr(ei, 'ENABLE_AI_ANALYSIS', True)
    monkeypatch.setattr(ei, 'INDEXER_ANREICHERUNG_PRO_ZYKLUS', 0)
    db = _Db([DOK])
    assert _indexer(db)._anreicherung_nachholen() == 0


def test_eine_kaputte_abfrage_kippt_den_zyklus_nicht(monkeypatch):
    """Die Nachhol-Runde ist Beiwerk; sie darf den Scan nicht mitreissen."""
    monkeypatch.setattr(ei, 'ENABLE_AI_ANALYSIS', True)

    class _Kaputt:
        def get_dokumente_ohne_anreicherung(self, limit=5):
            raise RuntimeError('Postgres weg')

    assert _indexer(_Kaputt())._anreicherung_nachholen() == 0
