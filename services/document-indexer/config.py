"""
Configuration module for Document Indexer.

Handles Docker secret resolution, environment variable parsing,
and all service constants.
"""

import os
import logging

logger = logging.getLogger(__name__)


def _resolve_secrets(*var_names):
    """Resolve Docker secrets (_FILE env vars -> regular env vars)."""
    for var in var_names:
        file_path = os.environ.get(f'{var}_FILE')
        if file_path and os.path.isfile(file_path):
            with open(file_path) as f:
                os.environ[var] = f.read().strip()


# Resolve secrets before reading env vars
_resolve_secrets('POSTGRES_PASSWORD', 'MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD')


# --- MinIO ---
MINIO_HOST = os.getenv('MINIO_HOST', 'minio')
MINIO_PORT = os.getenv('MINIO_PORT', '9000')
MINIO_ROOT_USER = os.getenv('MINIO_ROOT_USER', 'arasul_minio_admin')
MINIO_ROOT_PASSWORD = os.getenv('MINIO_ROOT_PASSWORD', '')
MINIO_BUCKET = os.getenv('DOCUMENT_INDEXER_MINIO_BUCKET', 'documents')

# --- Qdrant ---
QDRANT_HOST = os.getenv('QDRANT_HOST', 'qdrant')
QDRANT_PORT = int(os.getenv('QDRANT_PORT', '6333'))
QDRANT_COLLECTION = os.getenv('QDRANT_COLLECTION_NAME', 'documents')

# --- Embedding Service ---
EMBEDDING_HOST = os.getenv('EMBEDDING_SERVICE_HOST', 'embedding-service')
EMBEDDING_PORT = int(os.getenv('EMBEDDING_SERVICE_PORT', '11435'))
EMBEDDING_VECTOR_SIZE = int(os.getenv('EMBEDDING_VECTOR_SIZE', '1024'))
EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'BAAI/bge-m3')

# --- Chunking ---
CHUNK_SIZE = int(os.getenv('DOCUMENT_INDEXER_CHUNK_SIZE', '500'))
CHUNK_OVERLAP = int(os.getenv('DOCUMENT_INDEXER_CHUNK_OVERLAP', '50'))
PARENT_CHUNK_SIZE = int(os.getenv('DOCUMENT_INDEXER_PARENT_CHUNK_SIZE', '2000'))
CHILD_CHUNK_SIZE = int(os.getenv('DOCUMENT_INDEXER_CHILD_CHUNK_SIZE', '300'))
CHILD_CHUNK_OVERLAP = int(os.getenv('DOCUMENT_INDEXER_CHILD_CHUNK_OVERLAP', '75'))
INDEXER_INTERVAL = int(os.getenv('DOCUMENT_INDEXER_INTERVAL', '120'))

# --- File Size Limit ---
# CRITICAL-FIX: Maximum file size limit to prevent OOM (default: 100MB)
MAX_FILE_SIZE_MB = int(os.getenv('DOCUMENT_MAX_SIZE_MB', '100'))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# --- AI Features ---
ENABLE_AI_ANALYSIS = os.getenv('DOCUMENT_INDEXER_ENABLE_AI', 'true').lower() == 'true'
ENABLE_SIMILARITY = os.getenv('DOCUMENT_INDEXER_ENABLE_SIMILARITY', 'true').lower() == 'true'
SIMILARITY_THRESHOLD = float(os.getenv('DOCUMENT_INDEXER_SIMILARITY_THRESHOLD', '0.8'))
ENABLE_KNOWLEDGE_GRAPH = os.getenv('DOCUMENT_INDEXER_ENABLE_KG', 'true').lower() == 'true'

# --- PostgreSQL DSN (for GraphStore) ---
_PG_HOST = os.getenv('POSTGRES_HOST', 'postgres-db')
_PG_PORT = os.getenv('POSTGRES_PORT', '5432')
_PG_USER = os.getenv('POSTGRES_USER', 'arasul')
_PG_PASS = os.getenv('POSTGRES_PASSWORD', '')
_PG_DB = os.getenv('POSTGRES_DB', 'arasul_db')
POSTGRES_DSN = f"host={_PG_HOST} port={_PG_PORT} user={_PG_USER} password={_PG_PASS} dbname={_PG_DB}"
