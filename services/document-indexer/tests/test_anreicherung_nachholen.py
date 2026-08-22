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
    ix._weckruf_offen = False
    ix._nacharbeit_offen = False
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


def test_ein_weckruf_bricht_die_laufende_runde_ab(monkeypatch):
    """Neue Dateien haben Vorrang, auch mitten in der Nachhol-Runde.

    Die Pruefung VOR dem Zyklus reicht nicht: eine Runde dauert je Dokument
    rund fuenfzig Sekunden, und der Weckruf trifft mitten hinein. Am
    22.08.2026 auf dem Orin standen hundert frisch geschriebene Dateien auf
    `pending`, waehrend der Indexer in aller Ruhe ein altes Dokument
    zusammenfasste.
    """
    monkeypatch.setattr(ei, 'ENABLE_AI_ANALYSIS', True)
    monkeypatch.setattr(ei, 'INDEXER_ANREICHERUNG_PRO_ZYKLUS', 3)
    monkeypatch.setattr(ei, 'parse_document', lambda d, f: 'Text genug.')
    angefasst = []

    db = _Db([
        {'id': 'a1', 'filename': 'a.md', 'file_path': '1_a.md'},
        {'id': 'a2', 'filename': 'b.md', 'file_path': '2_b.md'},
        {'id': 'a3', 'filename': 'c.md', 'file_path': '3_c.md'},
    ])
    ix = _indexer(db)

    def reichert(doc_id, *a, **k):
        angefasst.append(doc_id)
        # Waehrend des ersten Dokuments trifft der Weckruf ein.
        ix._weckruf_offen = True
        return True

    monkeypatch.setattr(ei, 'reichere_an', reichert)
    assert ix._anreicherung_nachholen() == 1
    assert angefasst == ['a1'], "Nach dem Weckruf darf kein weiteres Dokument mehr folgen."


def test_eine_erfolgreiche_runde_verkuerzt_die_pause(monkeypatch):
    """Sonst kaeme das naechste Dokument erst nach INDEXER_INTERVAL dran."""
    monkeypatch.setattr(ei, 'ENABLE_AI_ANALYSIS', True)
    monkeypatch.setattr(ei, 'reichere_an', lambda *a, **k: True)
    monkeypatch.setattr(ei, 'parse_document', lambda d, f: 'Text genug.')
    ix = _indexer(_Db([DOK]))
    ix._anreicherung_nachholen()
    assert ix._nacharbeit_offen is True


def test_eine_leere_runde_verkuerzt_die_pause_nicht(monkeypatch):
    monkeypatch.setattr(ei, 'ENABLE_AI_ANALYSIS', True)
    ix = _indexer(_Db([]))
    ix._anreicherung_nachholen()
    assert ix._nacharbeit_offen is False


def test_der_weckruf_erreicht_die_analyse_selbst(monkeypatch):
    """Ein Weckruf muss auch MITTEN in einem Dokument greifen.

    Drei Modellaufrufe je Dokument, zusammen rund fuenfzig Sekunden. Wer erst
    zwischen zwei Dokumenten prueft, laesst eine gerade geschriebene Datei
    genau so lange warten. Geprueft wird deshalb zwischen den Aufrufen; ein
    laufender Aufruf wird nicht abgebrochen, das Modell rechnet ohnehin weiter.
    """
    monkeypatch.setattr(ei, 'ENABLE_AI_ANALYSIS', True)
    monkeypatch.setattr(ei, 'parse_document', lambda d, f: 'Text genug.')
    gesehen = {}

    def reichert(doc_id, text, filename, titel, db, analyzer, abbruch=None):
        gesehen['abbruch'] = abbruch
        return True

    monkeypatch.setattr(ei, 'reichere_an', reichert)
    ix = _indexer(_Db([DOK]))
    ix._anreicherung_nachholen()

    assert callable(gesehen['abbruch']), "Die Analyse bekommt keinen Abbruch gereicht."
    assert gesehen['abbruch']() is False
    ix._weckruf_offen = True
    assert gesehen['abbruch']() is True
