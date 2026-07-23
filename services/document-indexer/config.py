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
CHILD_CHUNK_SIZE = int(os.getenv('DOCUMENT_INDEXER_CHILD_CHUNK_SIZE', '150'))
CHILD_CHUNK_OVERLAP = int(os.getenv('DOCUMENT_INDEXER_CHILD_CHUNK_OVERLAP', '30'))
INDEXER_INTERVAL = int(os.getenv('DOCUMENT_INDEXER_INTERVAL', '30'))
# Phase 5.1: Cap documents processed per scan cycle to avoid long-running cycles.
# New uploads during a busy cycle wait at most INDEXER_INTERVAL seconds for the next pass.
INDEXER_MAX_DOCS_PER_CYCLE = int(os.getenv('DOCUMENT_INDEXER_MAX_DOCS_PER_CYCLE', '10'))
# Phase 0 (BUG-002): Max automatic retries for failed documents in the scan loop.
# The scan loop must honor this cap; explicit /retry endpoint bypasses it by resetting retry_count.
INDEXER_MAX_RETRIES = int(os.getenv('DOCUMENT_INDEXER_MAX_RETRIES', '3'))
# Periodic watchdog that re-runs DatabaseManager.recover_stuck_processing()
# on a fixed interval. Catches docs left in 'processing' by abrupt shutdowns
# / OOM kills that happened mid-pipeline (the boot-time recover only fires once).
INDEXER_WATCHDOG_INTERVAL_SECONDS = int(os.getenv('INDEXER_WATCHDOG_INTERVAL_SECONDS', '300'))

# Plan 012 Phase F Schritt 19 — Wiederaufnahme unvollstaendig ('partial')
# indexierter Dokumente. Bewusst traege und hart gedeckelt: die Embedding-GPU
# teilt sich mit Chat und Skills, ein enger Takt wuerde sie dauerhaft belegen.
# 0 schaltet die Wiederaufnahme ab.
PARTIAL_REPICKUP_INTERVAL_SECONDS = int(
    os.getenv('PARTIAL_REPICKUP_INTERVAL_SECONDS', '3600')
)
# Wie oft ein einzelnes Dokument insgesamt wieder aufgenommen wird (ueber
# retry_count gezaehlt, also dauerhaft — nicht pro Neustart).
PARTIAL_REPICKUP_MAX_ATTEMPTS = int(
    os.getenv('PARTIAL_REPICKUP_MAX_ATTEMPTS', '2')
)
# Wie viele Dokumente ein Durchlauf hoechstens anfasst.
PARTIAL_REPICKUP_BATCH = int(os.getenv('PARTIAL_REPICKUP_BATCH', '5'))

# --- File Size Limit ---
# CRITICAL-FIX: Maximum file size limit to prevent OOM (default: 100MB)
MAX_FILE_SIZE_MB = int(os.getenv('DOCUMENT_MAX_SIZE_MB', '100'))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# --- AI Features ---
ENABLE_AI_ANALYSIS = os.getenv('DOCUMENT_INDEXER_ENABLE_AI', 'true').lower() == 'true'
ENABLE_SIMILARITY = os.getenv('DOCUMENT_INDEXER_ENABLE_SIMILARITY', 'true').lower() == 'true'
SIMILARITY_THRESHOLD = float(os.getenv('DOCUMENT_INDEXER_SIMILARITY_THRESHOLD', '0.8'))
ENABLE_KNOWLEDGE_GRAPH = os.getenv('DOCUMENT_INDEXER_ENABLE_KG', 'true').lower() == 'true'

# --- Contextual Chunking (Phase 2) ---
# Mode for chunk-context descriptions added during indexing.
#   'heuristic' — rule-based/template descriptions (default, ~10-50ms/chunk).
#   'llm'       — LLM-generated context (~3-5s/chunk). Higher recall on
#                 complex docs but competes with active chat on the GPU
#                 (OLLAMA_NUM_PARALLEL=2 makes this race more visible).
#   'template'  — legacy alias for 'heuristic', kept for backward-compat.
# Default flipped to 'heuristic' so day-to-day indexing does not stall TTFT
# for active chats. Operators can re-enable 'llm' for a one-off re-index of
# critical knowledge bases via DOCUMENT_INDEXER_CONTEXT_MODE=llm.
CHUNK_CONTEXT_MODE = os.getenv('DOCUMENT_INDEXER_CONTEXT_MODE', 'heuristic')

# --- PostgreSQL DSN (for GraphStore) ---
_PG_HOST = os.getenv('POSTGRES_HOST', 'postgres-db')
_PG_PORT = os.getenv('POSTGRES_PORT', '5432')
_PG_USER = os.getenv('POSTGRES_USER', 'arasul')
_PG_PASS = os.getenv('POSTGRES_PASSWORD', '')
_PG_DB = os.getenv('POSTGRES_DB', 'arasul_db')
POSTGRES_DSN = f"host={_PG_HOST} port={_PG_PORT} user={_PG_USER} password={_PG_PASS} dbname={_PG_DB}"
