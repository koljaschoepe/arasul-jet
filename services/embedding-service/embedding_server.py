#!/usr/bin/env python3
"""
ARASUL PLATFORM - Embedding Service
High-performance text embedding with GPU support
"""

import os
import logging
import time
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
# Use HuggingFace model identifier (nomic-ai/nomic-embed-text-v1.5)
MODEL_NAME = os.getenv('EMBEDDING_MODEL', 'nomic-ai/nomic-embed-text-v1.5')
SERVICE_PORT = int(os.getenv('EMBEDDING_SERVICE_PORT', '11435'))
VECTOR_SIZE = int(os.getenv('EMBEDDING_VECTOR_SIZE', '768'))
MAX_INPUT_TOKENS = int(os.getenv('EMBEDDING_MAX_INPUT_TOKENS', '4096'))

# MEDIUM-PRIORITY-FIX 3.8: FP16 quantization for reduced VRAM usage
# Set EMBEDDING_USE_FP16=true to enable half-precision (saves ~50% VRAM)
# Trade-off: ~5% less precision, but significant memory savings on smaller GPUs
USE_FP16 = os.getenv('EMBEDDING_USE_FP16', 'false').lower() == 'true'

# PHASE1-FIX: Whitelist of trusted models that require trust_remote_code
# Only these verified models can execute custom code from HuggingFace
TRUSTED_MODELS_REQUIRING_REMOTE_CODE = frozenset({
    'nomic-ai/nomic-embed-text-v1.5',
    'nomic-ai/nomic-embed-text-v1',
    'jinaai/jina-embeddings-v2-base-en',
    'jinaai/jina-embeddings-v2-small-en',
})

# Initialize Flask app
app = Flask(__name__)

# Global model variable
model = None
device = None


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

        # HIGH-012 FIX: Check if model needs to be downloaded
        from sentence_transformers import util
        import os

        # Get the model cache directory
        cache_folder = os.getenv('SENTENCE_TRANSFORMERS_HOME',
                                 os.path.join(os.path.expanduser('~'), '.cache', 'torch', 'sentence_transformers'))

        model_path = os.path.join(cache_folder, MODEL_NAME.replace('/', '_'))

        if not os.path.exists(model_path):
            logger.warning(f"Model '{MODEL_NAME}' not found in cache at {model_path}")
            logger.warning("Model will be downloaded - this may take several minutes and use disk space")
            logger.info("For production deployments, consider pre-downloading models in Dockerfile")
        else:
            logger.info(f"Model found in cache at {model_path}")

        # Load model (will download if not cached)
        # PHASE1-FIX: Only enable trust_remote_code for whitelisted models
        trust_remote = MODEL_NAME in TRUSTED_MODELS_REQUIRING_REMOTE_CODE
        if trust_remote:
            logger.info(f"Model '{MODEL_NAME}' is in trusted whitelist, enabling remote code execution")
        else:
            logger.info(f"Model '{MODEL_NAME}' not in trusted whitelist, remote code disabled")

        model = SentenceTransformer(MODEL_NAME, device=device, trust_remote_code=trust_remote)

        # MEDIUM-PRIORITY-FIX 3.8: Apply FP16 quantization if enabled and on GPU
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
        logger.error("This may be due to network issues during model download or insufficient disk space")
        return False


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
        latency = (time.time() - start_time) * 1000  # ms

        return jsonify({
            'status': 'healthy',
            'model': MODEL_NAME,
            'device': device,
            'vector_size': len(test_vec),
            'test_latency_ms': round(latency, 2),
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
        latency = (time.time() - start_time) * 1000  # ms

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
        'timestamp': time.time()
    }), 200


def main():
    """Main entry point"""
    logger.info("Starting Arasul Embedding Service")
    logger.info(f"Port: {SERVICE_PORT}")
    logger.info(f"Model: {MODEL_NAME}")

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
