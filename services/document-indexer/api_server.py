#!/usr/bin/env python3
"""
HTTP API Server for Document Indexer
Provides REST endpoints for:
- Status and health checks
- Document reprocessing triggers
- Manual indexing control
- Statistics and metrics
"""

import os
import threading
from typing import Optional

# Structured JSON logging (must be before imports that log at module level)
from structured_logging import setup_logging
logger = setup_logging("document-indexer")

from flask import Flask, jsonify, request
from flask_cors import CORS

import config
from enhanced_indexer import get_indexer, EnhancedDocumentIndexer
from decompound_service import decompound_text, CHARSPLIT_AVAILABLE
from bm25_index import get_bm25_index
from spell_corrector import correct_query, SYMSPELL_AVAILABLE
from sparse_encoder import compute_sparse_vector, STEMMER_AVAILABLE
from entity_extractor import extract_entities, extract_from_document, SPACY_AVAILABLE
from graph_refiner import get_refiner

# Flask app
app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = config.MAX_FILE_SIZE_BYTES  # Enforce upload size limit
CORS(app, origins=[
    'http://dashboard-backend:3001',
    'http://localhost:3001',
])  # Restrict CORS to internal backend only


@app.errorhandler(413)
def request_entity_too_large(error):
    """Return clear error when upload exceeds MAX_FILE_SIZE_MB"""
    return jsonify({
        'error': f'Request too large (max {config.MAX_FILE_SIZE_MB}MB)',
        'max_size_mb': config.MAX_FILE_SIZE_MB
    }), 413

# Configuration
API_PORT = int(os.getenv('DOCUMENT_INDEXER_API_PORT', '9102'))

# Global indexer reference with thread lock for safe access
indexer: Optional[EnhancedDocumentIndexer] = None
_indexer_lock = threading.Lock()


def get_safe_indexer() -> Optional[EnhancedDocumentIndexer]:
    """Thread-safe access to the global indexer instance"""
    with _indexer_lock:
        return indexer


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint - reports actual dependency state"""
    idx = get_safe_indexer()
    checks = {'service': 'document-indexer'}

    if idx is not None:
        checks['indexer'] = 'running'
        # Check database connectivity
        try:
            idx.db.get_statistics()
            checks['database'] = 'ok'
        except Exception:
            checks['database'] = 'error'
        # Check if Qdrant is reachable
        try:
            idx.qdrant_client.get_collections()
            checks['qdrant'] = 'ok'
        except Exception:
            checks['qdrant'] = 'error'

        has_errors = checks.get('database') == 'error' or checks.get('qdrant') == 'error'
        checks['status'] = 'degraded' if has_errors else 'healthy'
        # Always return 200 when indexer is running — Docker should not restart for transient dep failures
        # Self-healing agent uses /status for detailed checks
        return jsonify(checks), 200
    # Indexer still initializing
    checks['status'] = 'initializing'
    checks['indexer'] = 'initializing'
    return jsonify(checks)


@app.route('/status', methods=['GET'])
def status():
    """Get detailed indexer status"""
    idx = get_safe_indexer()
    if idx is None:
        return jsonify({
            'status': 'initializing',
            'error': 'Indexer not yet initialized'
        }), 503

    try:
        status_data = idx.get_status()
        return jsonify({
            'status': 'operational',
            **status_data
        })
    except Exception as e:
        logger.error(f"Status error: {e}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@app.route('/statistics', methods=['GET'])
def statistics():
    """Get document statistics"""
    idx = get_safe_indexer()
    if idx is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        stats = idx.db.get_statistics()
        return jsonify(stats)
    except Exception as e:
        logger.error(f"Statistics error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/documents', methods=['GET'])
def list_documents():
    """List documents with filtering"""
    idx = get_safe_indexer()
    if idx is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        # Query parameters
        status_filter = request.args.get('status')
        category_id = request.args.get('category_id', type=int)
        search = request.args.get('search')
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        ALLOWED_ORDER_BY = {'uploaded_at', 'title', 'file_size', 'status', 'file_name', 'created_at'}
        ALLOWED_ORDER_DIR = {'ASC', 'DESC'}
        order_by = request.args.get('order_by', 'uploaded_at')
        order_dir = request.args.get('order_dir', 'DESC')
        if order_by not in ALLOWED_ORDER_BY:
            return jsonify({'error': f'Invalid order_by. Allowed: {", ".join(sorted(ALLOWED_ORDER_BY))}'}), 400
        if order_dir.upper() not in ALLOWED_ORDER_DIR:
            return jsonify({'error': 'Invalid order_dir. Allowed: ASC, DESC'}), 400
        order_dir = order_dir.upper()

        documents, total = idx.db.list_documents(
            status=status_filter,
            category_id=category_id,
            search=search,
            limit=min(limit, 100),  # Cap at 100
            offset=offset,
            order_by=order_by,
            order_dir=order_dir
        )

        # Convert datetime objects to ISO format strings
        for doc in documents:
            for key, value in doc.items():
                if hasattr(value, 'isoformat'):
                    doc[key] = value.isoformat()

        return jsonify({
            'documents': documents,
            'total': total,
            'limit': limit,
            'offset': offset
        })

    except Exception as e:
        logger.error(f"List documents error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/documents/<doc_id>', methods=['GET'])
def get_document(doc_id):
    """Get single document details"""
    idx = get_safe_indexer()
    if idx is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        doc = idx.db.get_document(doc_id)
        if not doc:
            return jsonify({'error': 'Document not found'}), 404

        # Convert datetime objects
        for key, value in doc.items():
            if hasattr(value, 'isoformat'):
                doc[key] = value.isoformat()

        return jsonify(doc)

    except Exception as e:
        logger.error(f"Get document error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/documents/<doc_id>', methods=['DELETE'])
def delete_document(doc_id):
    """Delete a document"""
    idx = get_safe_indexer()
    if idx is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        success = idx.delete_document(doc_id)
        if success:
            return jsonify({'status': 'deleted', 'id': doc_id})
        else:
            return jsonify({'error': 'Delete failed'}), 500

    except Exception as e:
        logger.error(f"Delete document error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/documents/<doc_id>/reindex', methods=['POST'])
def reindex_document(doc_id):
    """Trigger reindexing of a document"""
    idx = get_safe_indexer()
    if idx is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        doc = idx.db.get_document(doc_id)
        if not doc:
            return jsonify({'error': 'Document not found'}), 404

        # Reset status to pending
        idx.db.update_document_status(doc_id, 'pending')
        idx.db.update_document(doc_id, {'retry_count': 0})

        return jsonify({
            'status': 'queued',
            'id': doc_id,
            'message': 'Document queued for reindexing'
        })

    except Exception as e:
        logger.error(f"Reindex error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/reindex-all', methods=['POST'])
def reindex_all_documents():
    """Trigger reindexing of all indexed documents (e.g. after context mode change)"""
    idx = get_safe_indexer()
    if idx is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        # Query indexed documents directly
        from psycopg2.extras import RealDictCursor
        with idx.db.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT id FROM documents WHERE status = 'indexed' AND deleted_at IS NULL"
                )
                docs = cur.fetchall()

        queued = 0
        for doc in docs:
            idx.db.update_document_status(doc['id'], 'pending')
            idx.db.update_document(doc['id'], {'retry_count': 0})
            queued += 1

        logger.info(f"Queued {queued} documents for reindexing")
        return jsonify({
            'status': 'queued',
            'count': queued,
            'message': f'{queued} documents queued for reindexing'
        })

    except Exception as e:
        logger.error(f"Reindex-all error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/documents/<doc_id>/similar', methods=['GET'])
def get_similar_documents(doc_id):
    """Get similar documents"""
    idx = get_safe_indexer()
    if idx is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        min_similarity = request.args.get('min_similarity', 0.7, type=float)
        limit = request.args.get('limit', 10, type=int)

        similar = idx.db.get_similar_documents(
            doc_id,
            min_similarity=min_similarity,
            limit=limit
        )

        return jsonify({
            'document_id': doc_id,
            'similar_documents': similar
        })

    except Exception as e:
        logger.error(f"Similar documents error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/categories', methods=['GET'])
def list_categories():
    """List all document categories"""
    idx = get_safe_indexer()
    if idx is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        categories = idx.db.get_categories()
        return jsonify({'categories': categories})

    except Exception as e:
        logger.error(f"List categories error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/scan', methods=['POST'])
def trigger_scan():
    """Manually trigger a scan cycle"""
    idx = get_safe_indexer()
    if idx is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        # Run scan in background thread
        thread = threading.Thread(target=idx.scan_and_index)
        thread.start()

        return jsonify({
            'status': 'scanning',
            'message': 'Scan triggered in background'
        })

    except Exception as e:
        logger.error(f"Scan trigger error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/search', methods=['POST'])
def semantic_search():
    """
    Perform semantic search across documents
    Request body: { "query": "search text", "top_k": 10 }
    """
    idx = get_safe_indexer()
    if idx is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        data = request.get_json()
        query = data.get('query')
        top_k = data.get('top_k', 10)

        if not query:
            return jsonify({'error': 'Query is required'}), 400

        # Get query embedding
        query_embedding = idx.get_embedding(query)
        if query_embedding is None:
            return jsonify({'error': 'Failed to generate embedding'}), 500

        # Search Qdrant (using named "dense" vector)
        results = idx.qdrant_client.search(
            collection_name=os.getenv('QDRANT_COLLECTION_NAME', 'documents'),
            query_vector=("dense", query_embedding),
            limit=top_k,
            with_payload=True
        )

        # Format results
        search_results = []
        seen_docs = set()

        for result in results:
            doc_id = result.payload.get('document_id')
            if doc_id and doc_id not in seen_docs:
                seen_docs.add(doc_id)
                search_results.append({
                    'document_id': doc_id,
                    'document_name': result.payload.get('document_name'),
                    'title': result.payload.get('title'),
                    'category': result.payload.get('category'),
                    'chunk_index': result.payload.get('chunk_index'),
                    'text_preview': result.payload.get('text', '')[:300],
                    'score': result.score
                })

        return jsonify({
            'query': query,
            'results': search_results,
            'total': len(search_results)
        })

    except Exception as e:
        logger.error(f"Search error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/decompound', methods=['POST'])
def decompound():
    """
    Decompound German compound words in text.
    Request body: { "text": "Krankenversicherungsbeitrag berechnen" }
    Response: { "original": "...", "decompounded": "...", "available": true }
    """
    try:
        data = request.get_json()
        text = data.get('text', '')

        if not text:
            return jsonify({'error': 'text is required'}), 400

        decompounded = decompound_text(text)

        return jsonify({
            'original': text,
            'decompounded': decompounded,
            'available': CHARSPLIT_AVAILABLE
        })

    except Exception as e:
        logger.error(f"Decompound error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/spellcheck', methods=['POST'])
def spellcheck():
    """
    Correct typos in query text using SymSpell.
    Request body: { "text": "Projekr Managment" }
    Response: { "original": "...", "corrected": "...", "corrections": [...], "available": true }
    """
    try:
        data = request.get_json()
        text = data.get('text', '')

        if not text:
            return jsonify({'error': 'text is required'}), 400

        corrected, corrections = correct_query(text)

        return jsonify({
            'original': text,
            'corrected': corrected,
            'corrections': corrections,
            'available': SYMSPELL_AVAILABLE
        })

    except Exception as e:
        logger.error(f"Spellcheck error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/sparse-encode', methods=['POST'])
def sparse_encode():
    """
    Encode text into a sparse BM25 vector for Qdrant hybrid search.
    Request body: { "text": "search query text" }
    Response: { "indices": [...], "values": [...], "available": true }
    """
    try:
        data = request.get_json()
        text = data.get('text', '')

        if not text:
            return jsonify({'error': 'text is required'}), 400

        indices, values = compute_sparse_vector(text)

        return jsonify({
            'indices': indices,
            'values': values,
            'available': STEMMER_AVAILABLE
        })

    except Exception as e:
        logger.error(f"Sparse encode error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/extract-entities', methods=['POST'])
def extract_entities_endpoint():
    """
    Extract named entities from text using spaCy NER.
    Request body: { "text": "BMW entwickelt autonome Fahrzeuge in München" }
    Response: { "entities": [...], "available": true }
    """
    try:
        data = request.get_json()
        text = data.get('text', '')

        if not text:
            return jsonify({'error': 'text is required'}), 400

        entities = extract_entities(text)

        return jsonify({
            'entities': entities,
            'count': len(entities),
            'available': SPACY_AVAILABLE
        })

    except Exception as e:
        logger.error(f"Entity extraction error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/extract-document', methods=['POST'])
def extract_document_endpoint():
    """
    Full entity + relation extraction for a document.
    Request body: { "text": "...", "document_id": "uuid", "title": "Doc Title" }
    Response: { "entities": [...], "relations": [...], "available": true }
    """
    try:
        data = request.get_json()
        text = data.get('text', '')
        document_id = data.get('document_id', '')
        title = data.get('title', 'Untitled')

        if not text:
            return jsonify({'error': 'text is required'}), 400

        result = extract_from_document(text, document_id, title)
        if result is None:
            return jsonify({
                'entities': [],
                'relations': [],
                'available': False
            })

        return jsonify({
            **result,
            'available': SPACY_AVAILABLE
        })

    except Exception as e:
        logger.error(f"Document extraction error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/bm25/search', methods=['POST'])
def bm25_search():
    """
    Search using BM25 index with German stemming.
    Request body: { "query": "search text", "top_k": 20 }
    Response: { "results": [{"chunk_id": "...", "score": 0.85}], "index_size": 1000 }
    """
    try:
        data = request.get_json()
        query = data.get('query', '')
        top_k = data.get('top_k', 20)

        if not query:
            return jsonify({'error': 'query is required'}), 400

        bm25 = get_bm25_index()
        results = bm25.search(query, top_k=top_k)

        return jsonify({
            'results': [
                {'chunk_id': chunk_id, 'score': score}
                for chunk_id, score in results
            ],
            'index_size': bm25.size,
            'is_ready': bm25.is_ready
        })

    except Exception as e:
        logger.error(f"BM25 search error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/bm25/rebuild', methods=['POST'])
def bm25_rebuild():
    """
    Rebuild the complete BM25 index from all document chunks in the database.
    This is a potentially long-running operation.
    """
    idx = get_safe_indexer()
    if idx is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    BM25_REBUILD_BATCH_SIZE = 5000

    try:
        # Fetch chunks from database using a server-side cursor to avoid OOM
        chunks = []
        with idx.db.get_connection() as conn:
            with conn.cursor(name='bm25_rebuild_cursor') as cur:
                cur.itersize = BM25_REBUILD_BATCH_SIZE
                cur.execute("""
                    SELECT dc.id, dc.chunk_text
                    FROM document_chunks dc
                    JOIN documents d ON dc.document_id = d.id
                    WHERE d.deleted_at IS NULL AND d.status = 'indexed'
                    ORDER BY dc.document_id, dc.chunk_index
                """)
                while True:
                    rows = cur.fetchmany(BM25_REBUILD_BATCH_SIZE)
                    if not rows:
                        break
                    chunks.extend({'id': str(row[0]), 'text': row[1]} for row in rows)

        bm25 = get_bm25_index()
        count = bm25.build_full_index(chunks)

        return jsonify({
            'status': 'rebuilt',
            'chunks_indexed': count,
            'message': f'BM25 index rebuilt with {count} chunks'
        })

    except Exception as e:
        logger.error(f"BM25 rebuild error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/bm25/status', methods=['GET'])
def bm25_status():
    """Get BM25 index status"""
    try:
        bm25 = get_bm25_index()
        return jsonify({
            'is_ready': bm25.is_ready,
            'index_size': bm25.size
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/refine-graph', methods=['POST'])
def refine_graph():
    """
    Trigger LLM-based graph refinement (entity resolution + relation refinement).
    Runs in a background thread. Returns immediately with status.
    """
    try:
        refiner = get_refiner()

        with refiner._lock:
            if refiner._running:
                return jsonify({
                    'status': 'already_running',
                    'message': 'A refinement batch is already in progress'
                }), 409

        # Run in background thread
        def _run():
            try:
                refiner.run_refinement_batch()
            except Exception as e:
                logger.error(f"Background refinement failed: {e}")

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

        return jsonify({
            'status': 'started',
            'message': 'Graph refinement started in background'
        })

    except Exception as e:
        logger.error(f"Refine graph error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/refine-graph/status', methods=['GET'])
def refine_graph_status():
    """Get graph refinement status and statistics."""
    try:
        refiner = get_refiner()
        stats = refiner.get_refinement_stats()
        return jsonify(stats)
    except Exception as e:
        logger.error(f"Refine graph status error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/extract-text', methods=['POST'])
def extract_text():
    """
    Extract text from a file without indexing.
    Used by dashboard-backend for chat document analysis and n8n workflows.

    Input (JSON): { "minio_path": "timestamp_filename.pdf", "filename": "original.pdf" }
    Input (multipart): file field with the document

    Returns: { "text": "...", "metadata": { "pages": N, "language": "de", "ocr_used": bool, "char_count": N } }
    """
    from document_processor import parse_document, PARSERS
    from metadata_extractor import extract_metadata
    import io

    try:
        text = None
        filename = None

        # Option 1: File uploaded directly (multipart)
        if 'file' in request.files:
            uploaded = request.files['file']
            filename = uploaded.filename or 'unknown'
            data = uploaded.read()
            text = parse_document(data, filename)

        # Option 2: File in MinIO (JSON body)
        elif request.is_json:
            body = request.get_json()
            minio_path = body.get('minio_path')
            filename = body.get('filename', minio_path or 'unknown')

            if not minio_path:
                return jsonify({'error': 'minio_path is required'}), 400

            idx = get_safe_indexer()
            if not idx:
                return jsonify({'error': 'Indexer not initialized'}), 503

            response = idx.minio_client.get_object(
                os.getenv('DOCUMENT_INDEXER_MINIO_BUCKET', 'documents'),
                minio_path
            )
            data = response.read()
            response.close()
            response.release_conn()
            text = parse_document(data, filename)
        else:
            return jsonify({'error': 'Provide file upload or JSON with minio_path'}), 400

        if text is None:
            ext = os.path.splitext(filename.lower())[1] if filename else ''
            if ext not in PARSERS:
                return jsonify({'error': f'Unsupported file type: {ext}'}), 400
            return jsonify({'error': 'Text extraction failed'}), 500

        # Extract basic metadata
        metadata = {
            'char_count': len(text),
            'word_count': len(text.split()),
            'language': 'de',
            'ocr_used': False,
        }

        # Detect if OCR was likely used (image files or scanned PDFs with minimal text)
        ext = os.path.splitext(filename.lower())[1] if filename else ''
        if ext in ('.png', '.jpg', '.jpeg', '.tiff', '.tif', '.bmp'):
            metadata['ocr_used'] = True

        try:
            doc_metadata = extract_metadata(text, filename)
            if doc_metadata:
                metadata['language'] = doc_metadata.get('language', 'de')
                metadata['pages'] = doc_metadata.get('page_count')
                metadata['title'] = doc_metadata.get('title')
        except Exception:
            pass

        logger.info(f"Extracted text from {filename}: {len(text)} chars (OCR: {metadata['ocr_used']})")

        return jsonify({
            'text': text,
            'filename': filename,
            'metadata': metadata,
        })

    except Exception as e:
        logger.error(f"Text extraction error: {e}")
        return jsonify({'error': str(e)}), 500


def run_api():
    """Run the Flask API server"""
    from config import CHUNK_CONTEXT_MODE, CHILD_CHUNK_SIZE, PARENT_CHUNK_SIZE
    logger.info(f"Starting Document Indexer API on port {API_PORT}")
    logger.info(f"Chunk context mode: {CHUNK_CONTEXT_MODE} | child={CHILD_CHUNK_SIZE}w parent={PARENT_CHUNK_SIZE}w")
    app.run(host='0.0.0.0', port=API_PORT, threaded=True)


def run_indexer_background():
    """Run the indexer in background thread with retry on initialization failure"""
    global indexer
    max_retries = 10
    base_delay = 10  # seconds

    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Indexer initialization attempt {attempt}/{max_retries}")
            new_indexer = get_indexer()
            with _indexer_lock:
                indexer = new_indexer
            logger.info("Indexer initialized successfully, starting scan loop")
            indexer.run()
            break  # run() only returns if stopped gracefully
        except Exception as e:
            with _indexer_lock:
                indexer = None
            delay = min(base_delay * (2 ** (attempt - 1)), 300)  # exponential backoff, max 5min
            logger.error(f"Indexer initialization failed (attempt {attempt}/{max_retries}): {e}")
            if attempt < max_retries:
                logger.info(f"Retrying in {delay}s...")
                import time
                time.sleep(delay)
            else:
                logger.error("Indexer failed to initialize after all retries. "
                             "Restart the container to try again.")


if __name__ == '__main__':
    import signal
    import sys
    import time

    # Graceful shutdown handler - stops indexer thread cleanly
    def graceful_shutdown(signum, frame):
        sig_name = signal.Signals(signum).name
        logger.info(f"{sig_name} received - shutting down gracefully...")
        # Stop the indexer if it's running
        if indexer and hasattr(indexer, 'stop'):
            try:
                indexer.stop()
                logger.info("Indexer stopped")
            except Exception as e:
                logger.warning(f"Error stopping indexer: {e}")
        sys.exit(0)

    signal.signal(signal.SIGTERM, graceful_shutdown)
    signal.signal(signal.SIGINT, graceful_shutdown)

    # Start indexer in background thread
    indexer_thread = threading.Thread(target=run_indexer_background, daemon=True)
    indexer_thread.start()

    # Give indexer time to initialize
    time.sleep(5)

    # Run API server in main thread
    run_api()
