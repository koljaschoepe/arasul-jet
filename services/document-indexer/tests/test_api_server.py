"""Die beiden Endpunkte, die vom Indexer geblieben sind: /health und /extract-text.

Gefahren mit dem echten Flask-Test-Client. Die Parser-Bibliotheken sind in
conftest.py gestubbt; der Textpfad (.txt) laeuft echt, der PDF-Pfad wird hier
gezielt zum Scheitern gebracht, um den 500er zu pruefen.
"""

import io

import pytest

import api_server
import document_parsers


@pytest.fixture
def client():
    api_server.app.config['TESTING'] = True
    with api_server.app.test_client() as c:
        yield c


def _upload(client, name, data, feld='file'):
    return client.post(
        '/extract-text',
        data={feld: (io.BytesIO(data), name)},
        content_type='multipart/form-data',
    )


def test_health_antwortet_200_und_sagt_was_es_prueft(client):
    antwort = client.get('/health')
    assert antwort.status_code == 200
    daten = antwort.get_json()
    assert daten['service'] == 'document-indexer'
    assert daten['status'] == 'healthy'
    assert daten['checks'] == 'process only'
    assert '.pdf' in daten['formats'] and '.txt' in daten['formats']


def test_extract_text_textdatei_per_multipart(client):
    antwort = _upload(client, 'notiz.txt', 'Hallo Welt und die Welt ist gross\n'.encode('utf-8'))
    assert antwort.status_code == 200
    daten = antwort.get_json()
    assert daten['text'] == 'Hallo Welt und die Welt ist gross'
    assert daten['filename'] == 'notiz.txt'
    meta = daten['metadata']
    assert meta['char_count'] == len(daten['text'])
    assert meta['word_count'] == 7
    assert meta['language'] == 'de'
    assert meta['ocr_used'] is False
    # Metadaten aus dem echten metadata_extractor: Titel aus dem Dateinamen,
    # Seitenzahl geschaetzt.
    assert meta['title'] == 'notiz'
    assert meta['pages'] == 1


def test_extract_text_pdf_parser_fehler_gibt_500(client, monkeypatch):
    def kaputt(fh):
        raise ValueError('PDF kaputt')

    monkeypatch.setitem(document_parsers.PARSERS, '.pdf', kaputt)
    antwort = _upload(client, 'kaputt.pdf', b'%PDF-1.4 kaputt')
    assert antwort.status_code == 500
    assert antwort.get_json() == {'error': 'Text extraction failed'}


def test_extract_text_unbekannter_typ_gibt_400(client):
    antwort = _upload(client, 'archiv.zip', b'PK')
    assert antwort.status_code == 400
    assert 'Unsupported file type' in antwort.get_json()['error']


def test_extract_text_ohne_datei_gibt_400(client):
    antwort = _upload(client, 'notiz.txt', b'x', feld='anhang')
    assert antwort.status_code == 400
    assert 'file' in antwort.get_json()['error']


def test_extract_text_json_body_wird_nicht_mehr_angenommen(client):
    """Der alte JSON-Zweig mit minio_path ist gefallen."""
    antwort = client.post('/extract-text', json={'minio_path': 'x.pdf'})
    assert antwort.status_code == 400


def test_extract_text_zu_gross_gibt_413(client, monkeypatch):
    monkeypatch.setitem(api_server.app.config, 'MAX_CONTENT_LENGTH', 64)
    antwort = _upload(client, 'gross.txt', b'x' * 1024)
    assert antwort.status_code == 413
    daten = antwort.get_json()
    assert 'error' in daten and 'max_size_mb' in daten


def test_bilder_zaehlen_als_ocr(client, monkeypatch):
    monkeypatch.setitem(document_parsers.PARSERS, '.png', lambda fh: 'Erkannter Text')
    antwort = _upload(client, 'scan.png', b'\x89PNG')
    assert antwort.status_code == 200
    assert antwort.get_json()['metadata']['ocr_used'] is True
