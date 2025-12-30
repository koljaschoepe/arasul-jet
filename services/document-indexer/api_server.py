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
import logging
import threading
from typing import Optional

from flask import Flask, jsonify, request
from flask_cors import CORS

from enhanced_indexer import get_indexer, EnhancedDocumentIndexer

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Flask app
app = Flask(__name__)
CORS(app)

# Configuration
API_PORT = int(os.getenv('DOCUMENT_INDEXER_API_PORT', '9102'))

# Global indexer reference
indexer: Optional[EnhancedDocumentIndexer] = None


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'document-indexer'
    })


@app.route('/status', methods=['GET'])
def status():
    """Get detailed indexer status"""
    global indexer
    if indexer is None:
        return jsonify({
            'status': 'initializing',
            'error': 'Indexer not yet initialized'
        }), 503

    try:
        status_data = indexer.get_status()
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
    global indexer
    if indexer is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        stats = indexer.db.get_statistics()
        return jsonify(stats)
    except Exception as e:
        logger.error(f"Statistics error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/documents', methods=['GET'])
def list_documents():
    """List documents with filtering"""
    global indexer
    if indexer is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        # Query parameters
        status_filter = request.args.get('status')
        category_id = request.args.get('category_id', type=int)
        search = request.args.get('search')
        limit = request.args.get('limit', 50, type=int)
        offset = request.args.get('offset', 0, type=int)
        order_by = request.args.get('order_by', 'uploaded_at')
        order_dir = request.args.get('order_dir', 'DESC')

        documents, total = indexer.db.list_documents(
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
    global indexer
    if indexer is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        doc = indexer.db.get_document(doc_id)
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
    global indexer
    if indexer is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        success = indexer.delete_document(doc_id)
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
    global indexer
    if indexer is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        doc = indexer.db.get_document(doc_id)
        if not doc:
            return jsonify({'error': 'Document not found'}), 404

        # Reset status to pending
        indexer.db.update_document_status(doc_id, 'pending')
        indexer.db.update_document(doc_id, {'retry_count': 0})

        return jsonify({
            'status': 'queued',
            'id': doc_id,
            'message': 'Document queued for reindexing'
        })

    except Exception as e:
        logger.error(f"Reindex error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/documents/<doc_id>/similar', methods=['GET'])
def get_similar_documents(doc_id):
    """Get similar documents"""
    global indexer
    if indexer is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        min_similarity = request.args.get('min_similarity', 0.7, type=float)
        limit = request.args.get('limit', 10, type=int)

        similar = indexer.db.get_similar_documents(
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
    global indexer
    if indexer is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        categories = indexer.db.get_categories()
        return jsonify({'categories': categories})

    except Exception as e:
        logger.error(f"List categories error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/scan', methods=['POST'])
def trigger_scan():
    """Manually trigger a scan cycle"""
    global indexer
    if indexer is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        # Run scan in background thread
        thread = threading.Thread(target=indexer.scan_and_index)
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
    global indexer
    if indexer is None:
        return jsonify({'error': 'Indexer not initialized'}), 503

    try:
        data = request.get_json()
        query = data.get('query')
        top_k = data.get('top_k', 10)

        if not query:
            return jsonify({'error': 'Query is required'}), 400

        # Get query embedding
        query_embedding = indexer.get_embedding(query)
        if query_embedding is None:
            return jsonify({'error': 'Failed to generate embedding'}), 500

        # Search Qdrant
        results = indexer.qdrant_client.search(
            collection_name=os.getenv('QDRANT_COLLECTION_NAME', 'documents'),
            query_vector=query_embedding,
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


def run_api():
    """Run the Flask API server"""
    logger.info(f"Starting Document Indexer API on port {API_PORT}")
    app.run(host='0.0.0.0', port=API_PORT, threaded=True)


def run_indexer_background():
    """Run the indexer in background thread"""
    global indexer
    indexer = get_indexer()
    indexer.run()


if __name__ == '__main__':
    # Start indexer in background thread
    indexer_thread = threading.Thread(target=run_indexer_background, daemon=True)
    indexer_thread.start()

    # Give indexer time to initialize
    import time
    time.sleep(5)

    # Run API server in main thread
    run_api()
