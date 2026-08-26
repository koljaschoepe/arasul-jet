#!/usr/bin/env python3
"""
HTTP-API des Document Indexers.

Seit Phase B4 des Rueckbaus (26.08.2026) ist der Dienst ein reiner
Textextraktor: er bekommt eine Datei per multipart-Upload, gibt den Text und
ein paar Kennzahlen zurueck und merkt sich nichts. Kein Postgres, kein MinIO,
kein Embedding, kein Hintergrundlauf.

Endpunkte:
- GET  /health         Lebenszeichen des Prozesses
- POST /extract-text   multipart, Feld `file`
"""

import os

# Strukturiertes JSON-Logging, bevor irgendein Modul auf Modulebene loggt.
from structured_logging import setup_logging
logger = setup_logging("document-indexer")

from flask import Flask, jsonify, request
from flask_cors import CORS

import config
from document_parsers import parse_document, PARSERS, OCR_AVAILABLE
from metadata_extractor import extract_metadata

app = Flask(__name__)
# Flask lehnt groessere Bodies selbst ab und loest damit den 413-Handler aus.
app.config['MAX_CONTENT_LENGTH'] = config.MAX_FILE_SIZE_BYTES
CORS(app, origins=[
    'http://dashboard-backend:3001',
    'http://localhost:3001',
])

API_PORT = int(os.getenv('DOCUMENT_INDEXER_API_PORT', '9102'))

# Endungen, bei denen der Text ausschliesslich aus der OCR stammt.
_BILD_ENDUNGEN = ('.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp', '.webp')


@app.errorhandler(413)
def request_entity_too_large(error):
    """Klare Meldung, wenn der Upload DOCUMENT_MAX_SIZE_MB ueberschreitet."""
    return jsonify({
        'error': f'Request too large (max {config.MAX_FILE_SIZE_MB}MB)',
        'max_size_mb': config.MAX_FILE_SIZE_MB,
    }), 413


@app.route('/health', methods=['GET'])
def health():
    """
    Lebenszeichen.

    Geprueft wird nur, dass der Prozess Anfragen beantwortet und seine Parser
    geladen hat. Es gibt keine Abhaengigkeit mehr, die den Dienst als
    angeschlagen ausweisen koennte; `ocr` sagt lediglich, ob das OCR-Modul
    importierbar war, nicht, ob das Tesseract-Binary antwortet.
    """
    return jsonify({
        'service': 'document-indexer',
        'status': 'healthy',
        'checks': 'process only',
        'ocr': 'available' if OCR_AVAILABLE else 'unavailable',
        'formats': sorted(PARSERS.keys()),
    }), 200


@app.route('/extract-text', methods=['POST'])
def extract_text():
    """
    Text aus einer hochgeladenen Datei ziehen, ohne etwas zu speichern.

    Eingabe: multipart/form-data mit dem Feld `file`.
    Antwort: { text, filename, metadata: { char_count, word_count, language,
               ocr_used, pages?, title? } }
    Fehler:  { error } mit 400 (kein/unbekannter Dateityp), 413 (zu gross),
             500 (Parser gescheitert).
    """
    uploaded = request.files.get('file')
    if uploaded is None:
        return jsonify({'error': 'multipart field "file" is required'}), 400

    filename = uploaded.filename or 'unknown'
    ext = os.path.splitext(filename.lower())[1]
    if ext not in PARSERS:
        return jsonify({'error': f'Unsupported file type: {ext}'}), 400

    data = uploaded.read()

    try:
        text = parse_document(data, filename)
    except Exception as e:  # noqa: BLE001 - als JSON melden, nicht als HTML-500
        logger.error(f"Text extraction error for {filename}: {e}")
        return jsonify({'error': str(e)}), 500

    if text is None:
        return jsonify({'error': 'Text extraction failed'}), 500

    metadata = {
        'char_count': len(text),
        'word_count': len(text.split()),
        'language': 'de',
        'ocr_used': ext in _BILD_ENDUNGEN,
    }

    try:
        doc_metadata = extract_metadata(data, filename, ext)
        if doc_metadata:
            metadata['language'] = doc_metadata.get('language') or 'de'
            metadata['pages'] = doc_metadata.get('page_count')
            metadata['title'] = doc_metadata.get('title')
    except Exception as e:  # noqa: BLE001 - Metadaten sind Beiwerk
        logger.warning(f"Metadata extraction failed for {filename}: {e}")

    logger.info(
        f"Extracted text from {filename}: {len(text)} chars (OCR: {metadata['ocr_used']})"
    )

    return jsonify({
        'text': text,
        'filename': filename,
        'metadata': metadata,
    })


def run_api():
    """Flask im Hauptthread starten."""
    logger.info(f"Starting Document Indexer API on port {API_PORT}")
    logger.info(f"Max upload: {config.MAX_FILE_SIZE_MB}MB | OCR module: {OCR_AVAILABLE}")
    app.run(host='0.0.0.0', port=API_PORT, threaded=True)


if __name__ == '__main__':
    run_api()
