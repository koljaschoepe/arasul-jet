#!/usr/bin/env python3
"""
Enhanced Document Indexer for Arasul Platform — Orchestrator

This module wires together the extracted components and provides
the public API consumed by api_server.py:
  - EnhancedDocumentIndexer  (the class)
  - get_indexer()             (singleton factory)

Sub-modules:
  config.py            — environment variables, constants, secret resolution
  embedding_client.py  — embedding service HTTP client
  qdrant_manager.py    — Qdrant collection init, upsert, similarity, delete
  document_processor.py — parsing, hashing, AI analysis, indexing pipeline
"""

import os
import sys
import time
import logging
import threading
from typing import Dict, Optional, Any
from datetime import datetime

from minio import Minio
from minio.error import S3Error

from database import DatabaseManager
from ai_services import AIServices, DocumentAnalyzer
from entity_extractor import SPACY_AVAILABLE
from graph_store import GraphStore

from config import (
    MINIO_HOST, MINIO_PORT, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD,
    MINIO_BUCKET, QDRANT_COLLECTION,
    INDEXER_INTERVAL, INDEXER_MAX_DOCS_PER_CYCLE,
    MAX_FILE_SIZE_MB, MAX_FILE_SIZE_BYTES,
    ENABLE_AI_ANALYSIS, ENABLE_SIMILARITY, ENABLE_KNOWLEDGE_GRAPH,
    EMBEDDING_MODEL, POSTGRES_DSN
)
from embedding_client import EmbeddingClient
from qdrant_manager import QdrantManager
from document_processor import (
    calculate_content_hash, calculate_file_hash, get_mime_type,
    parse_document, get_document_space_info, contextualize_chunk,
    run_indexing_pipeline, PARSERS, SUPPORTED_MIMES
)

# Logger inherits structured JSON formatting from api_server.py entry point
logger = logging.getLogger(__name__)


class EnhancedDocumentIndexer:
    """Enhanced Document Indexer with metadata, AI analysis, and HTTP API"""

    def __init__(self):
        """Initialize all components"""
        logger.info("Initializing Enhanced Document Indexer...")

        # Initialize components with retry logic
        self.minio_client = self._init_minio()

        # Qdrant manager (owns the QdrantClient)
        self._qdrant_manager = QdrantManager()
        self.qdrant_client = self._qdrant_manager.client

        # Database
        self.db = DatabaseManager()

        # Crash recovery: reset any documents stuck in 'processing'
        self.db.recover_stuck_processing()

        # AI services
        self.ai_services = AIServices()
        self.analyzer = DocumentAnalyzer(self.ai_services)

        # Embedding client
        self._embedding_client = EmbeddingClient()

        # Verify embedding service is reachable
        if not self._embedding_client.check_health():
            logger.warning(
                "Embedding service is not reachable at startup "
                "- embeddings will fail until service is available"
            )
        else:
            logger.info("Embedding service health check passed")

        # Initialize Knowledge Graph store
        self.graph_store = (
            GraphStore(POSTGRES_DSN)
            if ENABLE_KNOWLEDGE_GRAPH and SPACY_AVAILABLE
            else None
        )
        if self.graph_store:
            logger.info("Knowledge Graph enabled (spaCy + PostgreSQL)")
        else:
            logger.info(
                f"Knowledge Graph disabled "
                f"(ENABLE_KG={ENABLE_KNOWLEDGE_GRAPH}, "
                f"spaCy={SPACY_AVAILABLE})"
            )

        # Keep parser/mime references for backward compatibility
        self.parsers = PARSERS
        self.supported_mimes = SUPPORTED_MIMES

        # Status tracking
        self.status = {
            'running': True,
            'last_scan': None,
            'documents_processed': 0,
            'documents_pending': 0,
            'documents_failed': 0,
            'current_document': None,
            'errors': []
        }

        # Lock for thread safety
        self._status_lock = threading.Lock()

        logger.info("Enhanced Document Indexer initialized successfully")

    # ------------------------------------------------------------------
    # MinIO initialization (stays here — only used once in __init__)
    # ------------------------------------------------------------------

    def _init_minio(self) -> Minio:
        """Initialize MinIO client with retry logic"""
        max_retries = 5
        for attempt in range(max_retries):
            try:
                client = Minio(
                    f"{MINIO_HOST}:{MINIO_PORT}",
                    access_key=MINIO_ROOT_USER,
                    secret_key=MINIO_ROOT_PASSWORD,
                    secure=False
                )

                # Create bucket if needed
                if not client.bucket_exists(MINIO_BUCKET):
                    client.make_bucket(MINIO_BUCKET)
                    logger.info(f"Created MinIO bucket: {MINIO_BUCKET}")
                else:
                    logger.info(f"MinIO bucket '{MINIO_BUCKET}' ready")

                return client
            except Exception as e:
                logger.warning(
                    f"MinIO connection attempt {attempt + 1}/{max_retries} "
                    f"failed: {e}"
                )
                if attempt < max_retries - 1:
                    time.sleep(5)
                else:
                    raise

    # ------------------------------------------------------------------
    # Delegating methods (preserve the public API surface)
    # ------------------------------------------------------------------

    def _check_embedding_service(self) -> bool:
        """Verify embedding service is reachable."""
        return self._embedding_client.check_health()

    def get_embedding(self, text: str):
        """Get embedding vector from embedding service"""
        return self._embedding_client.get_embedding(text)

    def get_batch_embeddings(self, texts):
        """Get embeddings for multiple texts efficiently"""
        return self._embedding_client.get_batch_embeddings(texts)

    def calculate_content_hash(self, data: bytes) -> str:
        """Calculate SHA256 hash of file content"""
        return calculate_content_hash(data)

    def calculate_file_hash(self, filename: str, size: int) -> str:
        """Calculate quick hash from filename and size"""
        return calculate_file_hash(filename, size)

    def get_mime_type(self, filename: str) -> str:
        """Get MIME type from filename"""
        return get_mime_type(filename)

    def parse_document(self, data: bytes, filename: str):
        """Parse document and extract text"""
        return parse_document(data, filename)

    def get_document_space_info(self, doc_id: str) -> Dict[str, str]:
        """Get Knowledge Space info for a document (RAG 2.0)"""
        return get_document_space_info(self.db, doc_id)

    @staticmethod
    def contextualize_chunk(chunk_text, document_title, parent_text,
                            chunk_index, total_chunks):
        """Add document context to a chunk before embedding."""
        return contextualize_chunk(
            chunk_text, document_title, parent_text,
            chunk_index, total_chunks
        )

    # ------------------------------------------------------------------
    # index_document — delegates to document_processor._index_to_qdrant
    # ------------------------------------------------------------------

    def index_document(self, doc_id: str, text: str,
                       metadata: Dict[str, Any]) -> int:
        """
        Index document text into Qdrant using hierarchical chunking.

        Delegates to document_processor._index_to_qdrant.
        """
        from document_processor import _index_to_qdrant
        return _index_to_qdrant(
            doc_id=doc_id,
            text=text,
            metadata=metadata,
            db=self.db,
            embedding_client=self._embedding_client,
            qdrant_manager=self._qdrant_manager
        )

    # ------------------------------------------------------------------
    # Document lifecycle
    # ------------------------------------------------------------------

    def process_new_document(self, object_name: str,
                             data: bytes) -> Optional[str]:
        """
        Process a new document from MinIO.

        Args:
            object_name: Path in MinIO bucket
            data: File data bytes

        Returns:
            Document ID if successful, None otherwise
        """
        doc_id = None
        filename = os.path.basename(object_name)
        file_ext = os.path.splitext(filename.lower())[1]

        # Check if file type is supported
        if file_ext not in self.parsers:
            logger.info(f"Skipping unsupported file: {filename}")
            return None

        # CRITICAL-FIX: File size validation to prevent OOM
        file_size_mb = len(data) / (1024 * 1024)
        if len(data) > MAX_FILE_SIZE_BYTES:
            logger.warning(
                f"File {filename} exceeds max size "
                f"({file_size_mb:.1f}MB > {MAX_FILE_SIZE_MB}MB), "
                f"skipping. Set DOCUMENT_MAX_SIZE_MB to increase limit."
            )
            try:
                doc_data = {
                    'filename': filename,
                    'original_filename': filename,
                    'file_path': object_name,
                    'file_size': len(data),
                    'mime_type': self.get_mime_type(filename),
                    'file_extension': file_ext,
                    'status': 'failed',
                }
                doc_id = self.db.create_document(doc_data)
                self.db.update_document_status(
                    doc_id, 'failed',
                    f'File size ({file_size_mb:.1f}MB) exceeds '
                    f'{MAX_FILE_SIZE_MB}MB limit'
                )
            except Exception as e:
                logger.debug(f"Could not create rejection record: {e}")
            return None

        # Calculate hashes
        content_hash = self.calculate_content_hash(data)
        file_hash = self.calculate_file_hash(object_name, len(data))

        # Check for existing document by content hash (duplicate detection)
        existing = self.db.get_document_by_hash(content_hash)
        if existing:
            if existing['status'] == 'indexed':
                logger.info(
                    f"Document already indexed (content match): {filename}"
                )
                return existing['id']
            elif existing['status'] in ('pending', 'failed'):
                logger.info(
                    f"Found {existing['status']} document, "
                    f"will index: {filename}"
                )
                doc_id = existing['id']
                if existing['status'] == 'failed':
                    self.db.update_document(doc_id, {'retry_count': 0})
                return self._index_existing_document(
                    doc_id, data, filename, content_hash, file_hash
                )

        # Check by file hash for re-indexing
        existing_by_path = self.db.get_document_by_file_hash(file_hash)
        if existing_by_path:
            if existing_by_path['status'] == 'indexed':
                logger.debug(f"Document already indexed: {filename}")
                return existing_by_path['id']
            elif existing_by_path['status'] == 'pending':
                logger.info(
                    f"Found pending document by path, "
                    f"will index: {filename}"
                )
                doc_id = existing_by_path['id']
                return self._index_existing_document(
                    doc_id, data, filename, content_hash, file_hash
                )

        with self._status_lock:
            self.status['current_document'] = filename

        try:
            # Extract metadata for document record creation
            from metadata_extractor import extract_metadata
            metadata = extract_metadata(data, filename, file_ext)

            # Create document record
            doc_data = {
                'filename': filename,
                'original_filename': filename,
                'file_path': object_name,
                'file_size': len(data),
                'mime_type': self.get_mime_type(filename),
                'file_extension': file_ext,
                'content_hash': content_hash,
                'file_hash': file_hash,
                'status': 'pending',
                'title': metadata.get('title'),
                'author': metadata.get('author'),
                'language': metadata.get('language', 'de'),
                'page_count': metadata.get('page_count'),
                'word_count': metadata.get('word_count', 0),
                'char_count': metadata.get('char_count', 0),
            }

            if existing_by_path:
                doc_id = existing_by_path['id']
                self.db.update_document(doc_id, doc_data)
            else:
                doc_id = self.db.create_document(doc_data)

            # Run shared indexing pipeline
            chunk_count = run_indexing_pipeline(
                doc_id=doc_id,
                data=data,
                filename=filename,
                content_hash=content_hash,
                db=self.db,
                analyzer=self.analyzer,
                embedding_client=self._embedding_client,
                qdrant_manager=self._qdrant_manager,
                graph_store=self.graph_store,
                enable_similarity=ENABLE_SIMILARITY
            )

            if chunk_count is None:
                # parse_document failed inside pipeline
                return None

            if chunk_count == 0:
                return doc_id

            with self._status_lock:
                self.status['documents_processed'] += 1

            return doc_id

        except Exception as e:
            logger.error(
                f"Error processing {filename}: {e}", exc_info=True
            )
            if doc_id:
                try:
                    self.db.update_document_status(
                        doc_id, 'failed', str(e)
                    )
                except Exception as status_err:
                    logger.error(
                        f"Failed to update status to 'failed' for "
                        f"{doc_id}: {status_err}"
                    )
            with self._status_lock:
                self.status['documents_failed'] += 1
                self.status['errors'].append({
                    'file': filename,
                    'error': str(e),
                    'timestamp': datetime.now().isoformat()
                })
                # Keep only last 20 errors
                self.status['errors'] = self.status['errors'][-20:]
            return None
        finally:
            with self._status_lock:
                self.status['current_document'] = None

    def _index_existing_document(
        self,
        doc_id: str,
        data: bytes,
        filename: str,
        content_hash: str,
        file_hash: str
    ) -> Optional[str]:
        """
        Index an existing document that is in pending/failed state.

        Args:
            doc_id: Existing document UUID
            data: File data bytes
            filename: Filename
            content_hash: Content hash
            file_hash: File hash

        Returns:
            Document ID if successful, None otherwise
        """
        with self._status_lock:
            self.status['current_document'] = filename

        try:
            # Run shared indexing pipeline
            chunk_count = run_indexing_pipeline(
                doc_id=doc_id,
                data=data,
                filename=filename,
                content_hash=content_hash,
                db=self.db,
                analyzer=self.analyzer,
                embedding_client=self._embedding_client,
                qdrant_manager=self._qdrant_manager,
                graph_store=self.graph_store,
                enable_similarity=ENABLE_SIMILARITY
            )

            if chunk_count is None:
                return None

            if chunk_count == 0:
                return doc_id

            with self._status_lock:
                self.status['documents_processed'] += 1

            return doc_id

        except Exception as e:
            logger.error(
                f"Error indexing pending document {filename}: {e}",
                exc_info=True
            )
            self.db.update_document_status(doc_id, 'failed', str(e))
            with self._status_lock:
                self.status['documents_failed'] += 1
                self.status['errors'].append({
                    'file': filename,
                    'error': str(e),
                    'timestamp': datetime.now().isoformat()
                })
                self.status['errors'] = self.status['errors'][-20:]
            return None
        finally:
            with self._status_lock:
                self.status['current_document'] = None

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    def delete_document(self, doc_id: str) -> bool:
        """
        Delete a document from the system.

        Args:
            doc_id: Document UUID

        Returns:
            True if successful
        """
        try:
            # Delete from Qdrant
            self._qdrant_manager.delete_document_vectors(doc_id)

            # Delete from MinIO
            doc = self.db.get_document(doc_id)
            if doc and doc.get('file_path'):
                try:
                    self.minio_client.remove_object(
                        MINIO_BUCKET, doc['file_path']
                    )
                except Exception as e:
                    logger.warning(f"Failed to delete from MinIO: {e}")

            # Clean up knowledge graph data for this document
            if self.graph_store:
                try:
                    self.graph_store.delete_document_graph(doc_id)
                except Exception as e:
                    logger.warning(
                        f"Failed to clean up graph for deleted document: {e}"
                    )

            # Soft delete from database
            self.db.delete_document(doc_id, soft=True)

            logger.info(f"Deleted document: {doc_id}")
            return True

        except Exception as e:
            logger.error(f"Delete error: {e}")
            return False

    # ------------------------------------------------------------------
    # Scan loop & lifecycle
    # ------------------------------------------------------------------

    def scan_and_index(self):
        """Scan MinIO bucket and index new documents (capped per cycle)."""
        try:
            objects = self.minio_client.list_objects(
                MINIO_BUCKET, recursive=True
            )

            processed_this_cycle = 0
            cap_reached = False
            for obj in objects:
                try:
                    # Quick check: skip download if file hash already indexed
                    file_hash = self.calculate_file_hash(
                        obj.object_name, obj.size or 0
                    )
                    existing = self.db.get_document_by_file_hash(file_hash)
                    if existing and existing['status'] == 'indexed':
                        logger.debug(
                            f"Document already indexed (content match): "
                            f"{os.path.basename(obj.object_name)}"
                        )
                        continue

                    # Phase 5.1: cap per-cycle work to keep scan cycles bounded.
                    if processed_this_cycle >= INDEXER_MAX_DOCS_PER_CYCLE:
                        cap_reached = True
                        break

                    # Download object only if not yet indexed
                    response = self.minio_client.get_object(
                        MINIO_BUCKET, obj.object_name
                    )
                    try:
                        data = response.read()
                    finally:
                        response.close()
                        response.release_conn()

                    # Process document
                    self.process_new_document(obj.object_name, data)
                    processed_this_cycle += 1

                except Exception as e:
                    logger.error(
                        f"Error processing {obj.object_name}: {e}"
                    )
                    continue

            if cap_reached:
                logger.info(
                    f"Scan cycle cap reached "
                    f"({INDEXER_MAX_DOCS_PER_CYCLE} docs); "
                    f"remaining pending documents will be picked up in next cycle."
                )

            # Get actual pending count from database
            try:
                stats = self.db.get_statistics()
                db_pending = stats.get('pending_documents', 0) or 0
            except Exception:
                db_pending = 0

            with self._status_lock:
                self.status['documents_pending'] = db_pending
                self.status['last_scan'] = datetime.now().isoformat()

            logger.info("Scan and index cycle completed")

        except S3Error as e:
            logger.error(f"MinIO error during scan: {e}")
        except Exception as e:
            logger.error(f"Scan error: {e}", exc_info=True)

    def get_status(self) -> Dict[str, Any]:
        """Get current indexer status"""
        with self._status_lock:
            status = dict(self.status)

        # Add statistics from database
        try:
            stats = self.db.get_statistics()
            status['statistics'] = stats
        except Exception as e:
            logger.error(f"Failed to get statistics: {e}")
            status['statistics'] = {}

        # Add Qdrant info
        status['qdrant'] = self._qdrant_manager.get_collection_info()

        return status

    def run(self):
        """Main loop - run indexing periodically"""
        logger.info(
            f"Starting Enhanced Document Indexer "
            f"(interval: {INDEXER_INTERVAL}s)"
        )

        while self.status['running']:
            try:
                self.scan_and_index()
            except Exception as e:
                logger.error(f"Main loop error: {e}", exc_info=True)

            time.sleep(INDEXER_INTERVAL)

    def stop(self):
        """Stop the indexer"""
        self.status['running'] = False
        self.db.close()
        logger.info("Enhanced Document Indexer stopped")


# Singleton instance for API access
_indexer_instance: Optional[EnhancedDocumentIndexer] = None


def get_indexer() -> EnhancedDocumentIndexer:
    """Get or create indexer instance"""
    global _indexer_instance
    if _indexer_instance is None:
        _indexer_instance = EnhancedDocumentIndexer()
    return _indexer_instance


if __name__ == "__main__":
    try:
        indexer = get_indexer()
        indexer.run()
    except KeyboardInterrupt:
        logger.info("Indexer stopped by user")
        if _indexer_instance:
            _indexer_instance.stop()
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)
