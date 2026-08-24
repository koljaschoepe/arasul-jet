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

# --- Embedding Service ---
EMBEDDING_HOST = os.getenv('EMBEDDING_SERVICE_HOST', 'embedding-service')
EMBEDDING_PORT = int(os.getenv('EMBEDDING_SERVICE_PORT', '11435'))
EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'BAAI/bge-m3')

# Plan 021 (agentic RAG): Ist der klassische Vektor-Zweig (Embedding + Qdrant)
# abgeschaltet, indexiert der Indexer NUR noch den Textlayer (document_chunks) —
# der agentische Pfad (ladeDokumentText / rag_suche dateiname) liest diesen
# unabhängig von Embeddings. Default TRUE = unverändertes Verhalten; wird beim
# Ausbau des klassischen RAG (Container-Abschaltung) auf false gesetzt.
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
# Plan 023 G4: Pause, wenn im letzten Zyklus Arbeit liegen blieb.
#
# Der Deckel oben haelt einen Zyklus ueberschaubar. Danach dreissig Sekunden zu
# schlafen, obwohl noch neunzig Dokumente warten, ist die eigentliche
# Wartezeit: am 22.08.2026 auf dem Orin gemessen, 93 Dokumente auf `pending`,
# Indexer bei 0,01 Prozent CPU. Ein Dokument braucht rund eine Sekunde.
INDEXER_NACHBRENNER = int(os.getenv('DOCUMENT_INDEXER_NACHBRENNER', '2'))
# Plan 023 G4: wie viele Dokumente je Zyklus nachtraeglich angereichert werden.
#
# Indexieren und Anreichern sind seit dem 22.08.2026 getrennt. Das Indexieren
# ist schnell (rund eine Drittelsekunde je Dokument, gemessen), die drei
# Modellaufrufe der Anreicherung brauchten auf dem Orin rund fuenfzig Sekunden.
# Standen sie in derselben Warteschlange, wartete eine gerade geschriebene
# Datei hinter jedem Vorgaenger: bei 71 offenen Dokumenten ueber eine Stunde.
#
# Nachgeholt wird nur, wenn der Scan nichts Neues mehr findet, und eine laufende
# Runde bricht ab, sobald ein Weckruf kommt.
#
# EINS je Runde, nicht mehr: ein Weckruf kann nur ZWISCHEN zwei Dokumenten
# greifen, nie mitten in einem Modellaufruf. Der Deckel ist damit die
# Wartezeit im schlechtesten Fall. Bei drei Stueck waren das zweieinhalb
# Minuten, bei einem sind es rund fuenfzig Sekunden. Der Durchsatz leidet
# nicht: hat eine Runde etwas geschafft, geht es nach INDEXER_NACHBRENNER
# Sekunden weiter statt nach INDEXER_INTERVAL. 0 schaltet das Nachholen ab.
INDEXER_ANREICHERUNG_PRO_ZYKLUS = int(
    os.getenv('DOCUMENT_INDEXER_ANREICHERUNG_PRO_ZYKLUS', '1')
)
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
