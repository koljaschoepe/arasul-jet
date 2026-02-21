#!/usr/bin/env python3
"""
ARASUL PLATFORM - Embedding Service
High-performance text embedding with GPU support
Supports BGE-M3 (1024d, 8192 tokens) and other models
Includes /rerank endpoint for 2-stage reranking (FlashRank + CrossEncoder)
"""

import os
import logging
import time
import threading
from flask import Flask, request, jsonify
from sentence_transformers import SentenceTransformer
import numpy as np
import torch

# Configure logging
logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('embedding-service')

# Configuration
MODEL_NAME = os.getenv('EMBEDDING_MODEL', 'BAAI/bge-m3')
SERVICE_PORT = int(os.getenv('EMBEDDING_SERVICE_PORT', '11435'))
VECTOR_SIZE = int(os.getenv('EMBEDDING_VECTOR_SIZE', '1024'))
MAX_INPUT_TOKENS = int(os.getenv('EMBEDDING_MAX_INPUT_TOKENS', '8192'))

# FP16 quantization for reduced VRAM usage
USE_FP16 = os.getenv('EMBEDDING_USE_FP16', 'false').lower() == 'true'

# Reranking configuration
ENABLE_RERANKING = os.getenv('ENABLE_RERANKING', 'true').lower() == 'true'
FLASHRANK_MODEL = os.getenv('FLASHRANK_MODEL', 'ms-marco-MiniLM-L-12-v2')
BGE_RERANKER_MODEL = os.getenv('BGE_RERANKER_MODEL', 'BAAI/bge-reranker-v2-m3')

# Whitelist of trusted models that require trust_remote_code
TRUSTED_MODELS_REQUIRING_REMOTE_CODE = frozenset({
    'nomic-ai/nomic-embed-text-v1.5',
    'nomic-ai/nomic-embed-text-v1',
    'jinaai/jina-embeddings-v2-base-en',
    'jinaai/jina-embeddings-v2-small-en',
})

# Initialize Flask app
app = Flask(__name__)

# Global model variables
model = None
device = None

# Reranker models (lazy-loaded)
_flashrank_ranker = None
_cross_encoder = None
_reranker_lock = threading.Lock()


def load_model():
    """Load the embedding model"""
    global model, device

    logger.info(f"Loading embedding model: {MODEL_NAME}")
    start_time = time.time()

    try:
        # Check for GPU availability
        if torch.cuda.is_available():
            device = 'cuda'
            logger.info(f"GPU available: {torch.cuda.get_device_name(0)}")
        else:
            device = 'cpu'
            logger.warning("No GPU available, using CPU")

        # Check if model needs to be downloaded
        import os as _os
        cache_folder = _os.getenv('SENTENCE_TRANSFORMERS_HOME',
                                 _os.path.join(_os.path.expanduser('~'), '.cache', 'torch', 'sentence_transformers'))
        model_path = _os.path.join(cache_folder, MODEL_NAME.replace('/', '_'))

        if not _os.path.exists(model_path):
            logger.warning(f"Model '{MODEL_NAME}' not found in cache at {model_path}")
            logger.warning("Model will be downloaded - this may take several minutes")
        else:
            logger.info(f"Model found in cache at {model_path}")

        # BGE-M3 does NOT require trust_remote_code
        trust_remote = MODEL_NAME in TRUSTED_MODELS_REQUIRING_REMOTE_CODE
        if trust_remote:
            logger.info(f"Model '{MODEL_NAME}' is in trusted whitelist, enabling remote code execution")

        model = SentenceTransformer(MODEL_NAME, device=device, trust_remote_code=trust_remote)

        # Apply FP16 quantization if enabled and on GPU
        if USE_FP16 and device == 'cuda':
            logger.info("Converting model to FP16 (half precision) for reduced VRAM usage")
            model = model.half()
            logger.info("FP16 conversion complete - VRAM usage reduced by ~50%")
        elif USE_FP16 and device != 'cuda':
            logger.warning("FP16 requested but GPU not available - using FP32 on CPU")

        load_time = time.time() - start_time
        logger.info(f"Model loaded successfully in {load_time:.2f}s")
        logger.info(f"Device: {device}")
        logger.info(f"Precision: {'FP16' if USE_FP16 and device == 'cuda' else 'FP32'}")
        logger.info(f"Max sequence length: {model.max_seq_length}")

        return True

    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        return False


def _get_flashrank_ranker():
    """Lazy-load FlashRank ranker (CPU-based, fast)"""
    global _flashrank_ranker
    if _flashrank_ranker is None:
        with _reranker_lock:
            if _flashrank_ranker is None:
                try:
                    from flashrank import Ranker
                    logger.info(f"Loading FlashRank model: {FLASHRANK_MODEL}")
                    start = time.time()
                    _flashrank_ranker = Ranker(model_name=FLASHRANK_MODEL)
                    logger.info(f"FlashRank loaded in {time.time() - start:.2f}s")
                except Exception as e:
                    logger.error(f"Failed to load FlashRank: {e}")
                    raise
    return _flashrank_ranker


def _get_cross_encoder():
    """Lazy-load CrossEncoder reranker (GPU-based, accurate)"""
    global _cross_encoder
    if _cross_encoder is None:
        with _reranker_lock:
            if _cross_encoder is None:
                try:
                    from sentence_transformers import CrossEncoder
                    logger.info(f"Loading CrossEncoder reranker: {BGE_RERANKER_MODEL}")
                    start = time.time()
                    _cross_encoder = CrossEncoder(BGE_RERANKER_MODEL, device=device)
                    logger.info(f"CrossEncoder loaded in {time.time() - start:.2f}s")
                except Exception as e:
                    logger.error(f"Failed to load CrossEncoder: {e}")
                    raise
    return _cross_encoder


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    if model is None:
        return jsonify({
            'status': 'unhealthy',
            'error': 'Model not loaded',
            'timestamp': time.time()
        }), 503

    try:
        # Test vectorization
        start_time = time.time()
        test_vec = model.encode("test", convert_to_numpy=True)
        latency = (time.time() - start_time) * 1000

        return jsonify({
            'status': 'healthy',
            'model': MODEL_NAME,
            'device': device,
            'vector_size': len(test_vec),
            'test_latency_ms': round(latency, 2),
            'reranking_enabled': ENABLE_RERANKING,
            'timestamp': time.time()
        }), 200

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return jsonify({
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': time.time()
        }), 503


@app.route('/embed', methods=['POST'])
def embed():
    """Generate embeddings for text"""
    if model is None:
        return jsonify({
            'error': 'Model not loaded',
            'timestamp': time.time()
        }), 503

    try:
        data = request.get_json()

        if not data or 'texts' not in data:
            return jsonify({
                'error': 'Missing "texts" field in request body',
                'timestamp': time.time()
            }), 400

        texts = data['texts']

        # Handle both single string and list of strings
        if isinstance(texts, str):
            texts = [texts]

        if not isinstance(texts, list):
            return jsonify({
                'error': '"texts" must be a string or list of strings',
                'timestamp': time.time()
            }), 400

        # Validate input length
        if len(texts) > 100:
            return jsonify({
                'error': 'Maximum 100 texts per request',
                'timestamp': time.time()
            }), 400

        # Generate embeddings
        start_time = time.time()
        embeddings = model.encode(texts, convert_to_numpy=True, show_progress_bar=False)
        latency = (time.time() - start_time) * 1000

        # Convert to list for JSON serialization
        vectors = embeddings.tolist()

        logger.info(f"Generated {len(vectors)} embeddings in {latency:.2f}ms ({latency/len(texts):.2f}ms/text)")

        return jsonify({
            'vectors': vectors,
            'embeddings': vectors,  # Alias for compatibility
            'dimension': len(vectors[0]) if vectors else 0,
            'count': len(vectors),
            'latency_ms': round(latency, 2),
            'timestamp': time.time()
        }), 200

    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        return jsonify({
            'error': str(e),
            'timestamp': time.time()
        }), 500


@app.route('/embed/batch', methods=['POST'])
def embed_batch():
    """
    Batch embedding endpoint for migration and bulk operations.
    Accepts up to 500 texts, processes in sub-batches of 32.
    """
    if model is None:
        return jsonify({'error': 'Model not loaded', 'timestamp': time.time()}), 503

    try:
        data = request.get_json()
        texts = data.get('texts', [])

        if not texts:
            return jsonify({'error': 'Missing "texts" field', 'timestamp': time.time()}), 400

        if isinstance(texts, str):
            texts = [texts]

        if len(texts) > 500:
            return jsonify({'error': 'Maximum 500 texts per batch request', 'timestamp': time.time()}), 400

        start_time = time.time()
        sub_batch_size = 32
        all_vectors = []

        for i in range(0, len(texts), sub_batch_size):
            batch = texts[i:i + sub_batch_size]
            embeddings = model.encode(batch, convert_to_numpy=True, show_progress_bar=False)
            all_vectors.extend(embeddings.tolist())

        latency = (time.time() - start_time) * 1000

        logger.info(f"Batch: {len(all_vectors)} embeddings in {latency:.2f}ms ({latency/len(texts):.2f}ms/text)")

        return jsonify({
            'vectors': all_vectors,
            'dimension': len(all_vectors[0]) if all_vectors else 0,
            'count': len(all_vectors),
            'latency_ms': round(latency, 2),
            'timestamp': time.time()
        }), 200

    except Exception as e:
        logger.error(f"Batch embedding failed: {e}")
        return jsonify({'error': str(e), 'timestamp': time.time()}), 500


@app.route('/rerank', methods=['POST'])
def rerank():
    """
    2-stage reranking endpoint.
    Stage 1: FlashRank (CPU) - fast filtering from top_k candidates to stage1_top_k
    Stage 2: BGE-reranker-v2-m3 (GPU) - precise scoring of stage1_top_k to top_k

    Input: { query, passages: [{text, id, ...}], top_k: 5, stage1_top_k: 20 }
    Output: { results: [{id, text, rerank_score, stage1_score, stage2_score}] }
    """
    if not ENABLE_RERANKING:
        return jsonify({'error': 'Reranking is disabled', 'timestamp': time.time()}), 503

    try:
        data = request.get_json()
        query = data.get('query', '')
        passages = data.get('passages', [])
        top_k = data.get('top_k', 5)
        stage1_top_k = data.get('stage1_top_k', 20)

        if not query or not passages:
            return jsonify({'error': 'Missing query or passages', 'timestamp': time.time()}), 400

        start_time = time.time()

        # Stage 1: FlashRank (CPU) - fast filtering
        stage1_start = time.time()
        try:
            ranker = _get_flashrank_ranker()
            from flashrank import RerankRequest
            rerank_request = RerankRequest(
                query=query,
                passages=[{"id": str(i), "text": p.get('text', ''), "meta": p} for i, p in enumerate(passages)]
            )
            stage1_results = ranker.rerank(rerank_request)
            stage1_latency = (time.time() - stage1_start) * 1000

            # Map back to original passages with scores
            stage1_scored = []
            for r in stage1_results[:stage1_top_k]:
                idx = int(r['id'])
                stage1_scored.append({
                    **passages[idx],
                    '_stage1_score': float(r['score']),
                    '_original_idx': idx
                })
        except Exception as e:
            logger.warning(f"FlashRank stage failed, passing through: {e}")
            stage1_scored = [{**p, '_stage1_score': 0, '_original_idx': i} for i, p in enumerate(passages[:stage1_top_k])]
            stage1_latency = 0

        # Stage 2: CrossEncoder (GPU) - precise scoring
        stage2_start = time.time()
        try:
            cross_encoder = _get_cross_encoder()
            pairs = [[query, p.get('text', '')] for p in stage1_scored]
            scores = cross_encoder.predict(pairs)
            stage2_latency = (time.time() - stage2_start) * 1000

            # Combine and sort
            for i, score in enumerate(scores):
                stage1_scored[i]['_stage2_score'] = float(score)
            stage1_scored.sort(key=lambda x: x['_stage2_score'], reverse=True)
        except Exception as e:
            logger.warning(f"CrossEncoder stage failed, using stage1 scores: {e}")
            stage1_scored.sort(key=lambda x: x.get('_stage1_score', 0), reverse=True)
            stage2_latency = 0

        # Build final results
        results = []
        for p in stage1_scored[:top_k]:
            results.append({
                'id': p.get('id', p.get('_original_idx')),
                'text': p.get('text', ''),
                'document_id': p.get('document_id', ''),
                'document_name': p.get('document_name', ''),
                'chunk_index': p.get('chunk_index', 0),
                'space_id': p.get('space_id'),
                'space_name': p.get('space_name', ''),
                'rerank_score': p.get('_stage2_score', p.get('_stage1_score', 0)),
                'stage1_score': p.get('_stage1_score', 0),
                'stage2_score': p.get('_stage2_score', 0),
            })

        total_latency = (time.time() - start_time) * 1000
        logger.info(f"Reranked {len(passages)} -> {len(results)} in {total_latency:.0f}ms "
                     f"(stage1: {stage1_latency:.0f}ms, stage2: {stage2_latency:.0f}ms)")

        return jsonify({
            'results': results,
            'total_latency_ms': round(total_latency, 2),
            'stage1_latency_ms': round(stage1_latency, 2),
            'stage2_latency_ms': round(stage2_latency, 2),
            'input_count': len(passages),
            'output_count': len(results),
            'timestamp': time.time()
        }), 200

    except Exception as e:
        logger.error(f"Reranking failed: {e}")
        return jsonify({'error': str(e), 'timestamp': time.time()}), 500


@app.route('/info', methods=['GET'])
def info():
    """Get service information"""
    return jsonify({
        'service': 'Arasul Embedding Service',
        'model': MODEL_NAME,
        'device': device if device else 'not_loaded',
        'vector_size': VECTOR_SIZE,
        'max_input_tokens': MAX_INPUT_TOKENS,
        'model_loaded': model is not None,
        'reranking_enabled': ENABLE_RERANKING,
        'reranker_models': {
            'stage1': FLASHRANK_MODEL,
            'stage2': BGE_RERANKER_MODEL
        } if ENABLE_RERANKING else None,
        'timestamp': time.time()
    }), 200


def main():
    """Main entry point"""
    logger.info("Starting Arasul Embedding Service")
    logger.info(f"Port: {SERVICE_PORT}")
    logger.info(f"Model: {MODEL_NAME}")
    logger.info(f"Reranking: {'enabled' if ENABLE_RERANKING else 'disabled'}")

    # Load model on startup
    if not load_model():
        logger.error("Failed to load model, exiting")
        exit(1)

    # Start Flask server
    app.run(
        host='0.0.0.0',
        port=SERVICE_PORT,
        debug=False,
        threaded=True
    )


if __name__ == '__main__':
    main()
