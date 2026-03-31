#!/usr/bin/env python3
"""
Enhanced Document Indexer for Arasul Platform
Features:
- Automatic document indexing from MinIO to Qdrant
- Comprehensive metadata extraction
- LLM-based categorization and summarization
- PostgreSQL metadata storage
- HTTP API for status and control
- Document similarity detection
"""

import os
import sys
import time
import logging
import hashlib
import uuid
import threading
from typing import List, Dict, Optional, Any
from io import BytesIO
from datetime import datetime

from minio import Minio
from minio.error import S3Error
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue,
    SparseVectorParams, SparseVector, Modifier
)
import requests

from document_parsers import parse_pdf, parse_docx, parse_txt, parse_markdown, parse_yaml_table, parse_image
from text_chunker import chunk_text, chunk_text_hierarchical
from metadata_extractor import extract_metadata, extract_key_topics
from database import DatabaseManager
from ai_services import AIServices, DocumentAnalyzer
from spell_corrector import update_domain_dictionary
from sparse_encoder import compute_sparse_vector
from entity_extractor import extract_from_document, SPACY_AVAILABLE
from graph_store import GraphStore

# Logger inherits structured JSON formatting from api_server.py entry point
logger = logging.getLogger(__name__)


# Resolve Docker secrets (_FILE env vars → regular env vars)
def _resolve_secrets(*var_names):
    for var in var_names:
        file_path = os.environ.get(f'{var}_FILE')
        if file_path and os.path.isfile(file_path):
            with open(file_path) as f:
                os.environ[var] = f.read().strip()

_resolve_secrets('POSTGRES_PASSWORD', 'MINIO_ROOT_USER', 'MINIO_ROOT_PASSWORD')


# Environment variables
MINIO_HOST = os.getenv('MINIO_HOST', 'minio')
MINIO_PORT = os.getenv('MINIO_PORT', '9000')
MINIO_ROOT_USER = os.getenv('MINIO_ROOT_USER', 'arasul_minio_admin')
MINIO_ROOT_PASSWORD = os.getenv('MINIO_ROOT_PASSWORD', '')
MINIO_BUCKET = os.getenv('DOCUMENT_INDEXER_MINIO_BUCKET', 'documents')

QDRANT_HOST = os.getenv('QDRANT_HOST', 'qdrant')
QDRANT_PORT = int(os.getenv('QDRANT_PORT', '6333'))
QDRANT_COLLECTION = os.getenv('QDRANT_COLLECTION_NAME', 'documents')

EMBEDDING_HOST = os.getenv('EMBEDDING_SERVICE_HOST', 'embedding-service')
EMBEDDING_PORT = int(os.getenv('EMBEDDING_SERVICE_PORT', '11435'))
EMBEDDING_VECTOR_SIZE = int(os.getenv('EMBEDDING_VECTOR_SIZE', '1024'))
EMBEDDING_MODEL = os.getenv('EMBEDDING_MODEL', 'BAAI/bge-m3')

CHUNK_SIZE = int(os.getenv('DOCUMENT_INDEXER_CHUNK_SIZE', '500'))
CHUNK_OVERLAP = int(os.getenv('DOCUMENT_INDEXER_CHUNK_OVERLAP', '50'))
PARENT_CHUNK_SIZE = int(os.getenv('DOCUMENT_INDEXER_PARENT_CHUNK_SIZE', '2000'))
CHILD_CHUNK_SIZE = int(os.getenv('DOCUMENT_INDEXER_CHILD_CHUNK_SIZE', '400'))
CHILD_CHUNK_OVERLAP = int(os.getenv('DOCUMENT_INDEXER_CHILD_CHUNK_OVERLAP', '50'))
INDEXER_INTERVAL = int(os.getenv('DOCUMENT_INDEXER_INTERVAL', '120'))

# CRITICAL-FIX: Maximum file size limit to prevent OOM (default: 100MB)
MAX_FILE_SIZE_MB = int(os.getenv('DOCUMENT_MAX_SIZE_MB', '100'))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# AI Features
ENABLE_AI_ANALYSIS = os.getenv('DOCUMENT_INDEXER_ENABLE_AI', 'true').lower() == 'true'
ENABLE_SIMILARITY = os.getenv('DOCUMENT_INDEXER_ENABLE_SIMILARITY', 'true').lower() == 'true'
SIMILARITY_THRESHOLD = float(os.getenv('DOCUMENT_INDEXER_SIMILARITY_THRESHOLD', '0.8'))
ENABLE_KNOWLEDGE_GRAPH = os.getenv('DOCUMENT_INDEXER_ENABLE_KG', 'true').lower() == 'true'

# Build PostgreSQL DSN for GraphStore
_PG_HOST = os.getenv('POSTGRES_HOST', 'postgres-db')
_PG_PORT = os.getenv('POSTGRES_PORT', '5432')
_PG_USER = os.getenv('POSTGRES_USER', 'arasul')
_PG_PASS = os.getenv('POSTGRES_PASSWORD', '')
_PG_DB = os.getenv('POSTGRES_DB', 'arasul_db')
POSTGRES_DSN = f"host={_PG_HOST} port={_PG_PORT} user={_PG_USER} password={_PG_PASS} dbname={_PG_DB}"


class EnhancedDocumentIndexer:
    """Enhanced Document Indexer with metadata, AI analysis, and HTTP API"""

    def __init__(self):
        """Initialize all components"""
        logger.info("Initializing Enhanced Document Indexer...")

        # Initialize components with retry logic
        self.minio_client = self._init_minio()
        self.qdrant_client = self._init_qdrant()
        self.db = DatabaseManager()

        # Crash recovery: reset any documents stuck in 'processing' from a previous crash
        self.db.recover_stuck_processing()

        # Initialize AI services
        self.ai_services = AIServices()
        self.analyzer = DocumentAnalyzer(self.ai_services)

        # Verify embedding service is reachable
        if not self._check_embedding_service():
            logger.warning("Embedding service is not reachable at startup - embeddings will fail until service is available")
        else:
            logger.info("Embedding service health check passed")

        # Initialize Knowledge Graph store
        self.graph_store = GraphStore(POSTGRES_DSN) if ENABLE_KNOWLEDGE_GRAPH and SPACY_AVAILABLE else None
        if self.graph_store:
            logger.info("Knowledge Graph enabled (spaCy + PostgreSQL)")
        else:
            logger.info(f"Knowledge Graph disabled (ENABLE_KG={ENABLE_KNOWLEDGE_GRAPH}, spaCy={SPACY_AVAILABLE})")

        # File parsers
        self.parsers = {
            '.pdf': parse_pdf,
            '.txt': parse_txt,
            '.md': parse_markdown,
            '.markdown': parse_markdown,
            '.docx': parse_docx,
            '.yaml': parse_yaml_table,
            '.yml': parse_yaml_table,
            # Image formats (OCR)
            '.png': parse_image,
            '.jpg': parse_image,
            '.jpeg': parse_image,
            '.tiff': parse_image,
            '.tif': parse_image,
            '.bmp': parse_image,
        }

        # Supported MIME types
        self.supported_mimes = {
            'application/pdf': '.pdf',
            'text/plain': '.txt',
            'text/markdown': '.md',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
            'text/yaml': '.yaml',
            'application/x-yaml': '.yaml',
            # Image formats (OCR)
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/tiff': '.tiff',
            'image/bmp': '.bmp',
        }

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
                logger.warning(f"MinIO connection attempt {attempt + 1}/{max_retries} failed: {e}")
                if attempt < max_retries - 1:
                    time.sleep(5)
                else:
                    raise

    def _init_qdrant(self) -> QdrantClient:
        """Initialize Qdrant client and collection with hybrid dense+sparse vectors"""
        from qdrant_client.models import BinaryQuantization, BinaryQuantizationConfig, HnswConfigDiff

        max_retries = 5
        for attempt in range(max_retries):
            try:
                client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

                # Check/create collection (also handles aliases)
                collection_exists = False
                try:
                    client.get_collection(QDRANT_COLLECTION)
                    collection_exists = True
                except Exception:
                    pass

                if not collection_exists:
                    client.create_collection(
                        collection_name=QDRANT_COLLECTION,
                        vectors_config={
                            "dense": VectorParams(
                                size=EMBEDDING_VECTOR_SIZE,
                                distance=Distance.COSINE,
                                on_disk=True
                            )
                        },
                        sparse_vectors_config={
                            "bm25": SparseVectorParams(
                                modifier=Modifier.IDF
                            )
                        },
                        hnsw_config=HnswConfigDiff(m=16, ef_construct=100),
                        quantization_config=BinaryQuantization(
                            binary=BinaryQuantizationConfig(always_ram=True)
                        )
                    )
                    logger.info(f"Created Qdrant collection: {QDRANT_COLLECTION} (dense + sparse BM25)")

                    # Create payload indices for efficient filtering
                    client.create_payload_index(QDRANT_COLLECTION, "space_id", "keyword")
                    client.create_payload_index(QDRANT_COLLECTION, "document_id", "keyword")
                    client.create_payload_index(QDRANT_COLLECTION, "category", "keyword")
                    logger.info(f"Created payload indices for collection: {QDRANT_COLLECTION}")
                else:
                    logger.info(f"Qdrant collection '{QDRANT_COLLECTION}' ready")

                return client
            except Exception as e:
                logger.warning(f"Qdrant connection attempt {attempt + 1}/{max_retries} failed: {e}")
                if attempt < max_retries - 1:
                    time.sleep(5)
                else:
                    raise

    def _check_embedding_service(self) -> bool:
        """Verify embedding service is reachable."""
        try:
            resp = requests.get(f"http://{EMBEDDING_HOST}:{EMBEDDING_PORT}/health", timeout=5)
            return resp.status_code == 200
        except Exception:
            return False

    def get_embedding(self, text: str) -> Optional[List[float]]:
        """Get embedding vector from embedding service"""
        try:
            response = requests.post(
                f"http://{EMBEDDING_HOST}:{EMBEDDING_PORT}/embed",
                json={"texts": [text]},
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            return result.get('vectors', [])[0] if result.get('vectors') else None
        except Exception as e:
            logger.error(f"Embedding error: {e}")
            return None

    def get_batch_embeddings(self, texts: List[str]) -> List[Optional[List[float]]]:
        """Get embeddings for multiple texts efficiently"""
        try:
            response = requests.post(
                f"http://{EMBEDDING_HOST}:{EMBEDDING_PORT}/embed",
                json={"texts": texts},
                timeout=60
            )
            response.raise_for_status()
            result = response.json()
            return result.get('vectors', [])
        except Exception as e:
            logger.error(f"Batch embedding error: {e}")
            return [None] * len(texts)

    def calculate_content_hash(self, data: bytes) -> str:
        """Calculate SHA256 hash of file content"""
        return hashlib.sha256(data).hexdigest()

    def calculate_file_hash(self, filename: str, size: int) -> str:
        """Calculate quick hash from filename and size"""
        return hashlib.sha256(f"{filename}:{size}".encode()).hexdigest()

    def get_mime_type(self, filename: str) -> str:
        """Get MIME type from filename"""
        ext = os.path.splitext(filename.lower())[1]
        mime_map = {
            '.pdf': 'application/pdf',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.markdown': 'text/markdown',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.yaml': 'text/yaml',
            '.yml': 'text/yaml',
        }
        return mime_map.get(ext, 'application/octet-stream')

    def parse_document(self, data: bytes, filename: str) -> Optional[str]:
        """Parse document and extract text"""
        _, ext = os.path.splitext(filename.lower())

        if ext not in self.parsers:
            logger.warning(f"Unsupported file type: {ext}")
            return None

        try:
            parser = self.parsers[ext]
            text = parser(BytesIO(data))
            logger.debug(f"Parsed {filename}: {len(text)} characters")
            return text
        except Exception as e:
            logger.error(f"Parse error for {filename}: {e}")
            return None

    def get_document_space_info(self, doc_id: str) -> Dict[str, str]:
        """
        Get Knowledge Space info for a document (RAG 2.0)

        Args:
            doc_id: Document UUID

        Returns:
            Dict with space_id, space_name, space_slug
        """
        try:
            with self.db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT d.space_id, ks.name as space_name, ks.slug as space_slug
                        FROM documents d
                        LEFT JOIN knowledge_spaces ks ON d.space_id = ks.id
                        WHERE d.id = %s
                    """, (doc_id,))
                    row = cur.fetchone()
                    if row and row[0]:
                        return {
                            'space_id': str(row[0]),
                            'space_name': row[1] or '',
                            'space_slug': row[2] or ''
                        }
        except Exception as e:
            logger.debug(f"Failed to get space info for {doc_id}: {e}")
        return {'space_id': None, 'space_name': '', 'space_slug': ''}

    @staticmethod
    def contextualize_chunk(chunk_text, document_title, parent_text, chunk_index, total_chunks):
        """
        Add document context to a chunk before embedding (Contextual Retrieval).

        The context header helps the embedding model understand the chunk's
        position and topic within the document. The original chunk_text is
        stored unchanged in the Qdrant payload for display.

        Args:
            chunk_text: Original child chunk text
            document_title: Document title/filename
            parent_text: Parent chunk text for section context
            chunk_index: Global index of the child chunk
            total_chunks: Total number of child chunks

        Returns:
            Contextualized text for embedding
        """
        context = f"[Dokument: {document_title}]"
        if chunk_index == 0:
            context += " [Anfang]"
        elif chunk_index == total_chunks - 1:
            context += " [Ende]"
        if parent_text:
            parent_preview = parent_text[:150].strip().replace('\n', ' ')
            context += f" [Abschnitt: {parent_preview}...]"
        return f"{context}\n{chunk_text}"

    def index_document(self, doc_id: str, text: str, metadata: Dict[str, Any]) -> int:
        """
        Index document text into Qdrant using hierarchical chunking.

        Uses the Parent-Document Retriever pattern:
        - Parent chunks (large) are stored in PostgreSQL for rich LLM context
        - Child chunks (small) are embedded and stored in Qdrant for precise retrieval
        - Each child chunk references its parent for context expansion at query time

        Hybrid vectors (Phase 2):
        - Dense vectors (BGE-M3) for semantic search
        - Sparse vectors (BM25) for keyword matching
        - Both stored in Qdrant for server-side RRF fusion

        Contextual chunking (Phase 2):
        - Each chunk gets a context header before embedding
        - Original text stored unchanged in payload

        Args:
            doc_id: Document UUID
            text: Full document text
            metadata: Document metadata

        Returns:
            Number of child chunks indexed
        """
        # Update status
        self.db.update_document_status(doc_id, 'processing')

        try:
            # Hierarchical chunking: parent chunks for context, child chunks for retrieval
            parent_chunks = chunk_text_hierarchical(
                text, PARENT_CHUNK_SIZE, CHILD_CHUNK_SIZE, CHILD_CHUNK_OVERLAP
            )
            if not parent_chunks:
                logger.warning(f"No chunks generated for document {doc_id}")
                return 0

            total_children = sum(len(p.children) for p in parent_chunks)
            doc_title = metadata.get('title', metadata.get('filename', ''))
            logger.info(
                f"Document {doc_id}: {len(parent_chunks)} parent chunks, "
                f"{total_children} child chunks to index"
            )

            # Save parent chunks to PostgreSQL and get their DB IDs
            parent_id_map = self.db.save_parent_chunks(doc_id, parent_chunks)

            # Generate embeddings and Qdrant points for child chunks
            batch_size = 10
            all_points = []
            chunk_records = []
            domain_texts = []

            for parent in parent_chunks:
                parent_db_id = parent_id_map.get(parent.parent_index)

                # Contextualized texts for embedding (includes document context header)
                contextualized_texts = [
                    self.contextualize_chunk(
                        child.text, doc_title, parent.text,
                        child.global_index, total_children
                    )
                    for child in parent.children
                ]
                # Original texts for payload storage (no context header)
                original_texts = [child.text for child in parent.children]

                for i in range(0, len(contextualized_texts), batch_size):
                    batch_ctx_texts = contextualized_texts[i:i + batch_size]
                    batch_orig_texts = original_texts[i:i + batch_size]
                    batch_children = parent.children[i:i + batch_size]
                    embeddings = self.get_batch_embeddings(batch_ctx_texts)

                    for child, orig_text, embedding in zip(
                        batch_children, batch_orig_texts, embeddings
                    ):
                        if embedding is None:
                            logger.warning(
                                f"Failed to get embedding for child chunk "
                                f"{child.global_index} (parent {parent.parent_index})"
                            )
                            continue

                        # Generate deterministic UUID for child chunk
                        chunk_id = str(uuid.UUID(
                            hashlib.md5(
                                f"{doc_id}:{child.global_index}".encode()
                            ).hexdigest()
                        ))

                        # Compute sparse BM25 vector from original text
                        sparse_indices, sparse_values = compute_sparse_vector(orig_text)

                        # Create Qdrant point with named dense + sparse vectors
                        vector_data = {"dense": embedding}
                        if sparse_indices:
                            vector_data["bm25"] = SparseVector(
                                indices=sparse_indices, values=sparse_values
                            )

                        point = PointStruct(
                            id=chunk_id,
                            vector=vector_data,
                            payload={
                                "document_id": doc_id,
                                "document_name": metadata.get('filename', ''),
                                "document_hash": metadata.get('content_hash', ''),
                                "chunk_index": child.global_index,
                                "child_index": child.child_index,
                                "parent_chunk_id": parent_db_id,
                                "parent_index": parent.parent_index,
                                "total_chunks": total_children,
                                "text": orig_text,
                                "title": metadata.get('title', ''),
                                "category": metadata.get('category_name', 'Allgemein'),
                                "language": metadata.get('language', 'de'),
                                "indexed_at": time.time(),
                                # RAG 2.0: Knowledge Space metadata
                                "space_id": metadata.get('space_id') or None,
                                "space_name": metadata.get('space_name', ''),
                                "space_slug": metadata.get('space_slug', ''),
                            }
                        )
                        all_points.append(point)

                        # Record for database (child chunk with parent reference)
                        chunk_records.append({
                            'id': chunk_id,
                            'chunk_index': child.global_index,
                            'child_index': child.child_index,
                            'parent_chunk_id': parent_db_id,
                            'text': orig_text,
                            'char_start': child.char_start,
                            'char_end': child.char_end,
                            'word_count': child.word_count,
                        })

                        domain_texts.append(orig_text)

            # Upsert to Qdrant (dense + sparse vectors together)
            if all_points:
                self.qdrant_client.upsert(
                    collection_name=QDRANT_COLLECTION,
                    points=all_points
                )
                logger.info(f"Indexed {len(all_points)} child chunks for document {doc_id} (dense + sparse)")

            # Save child chunk records to PostgreSQL (with parent_chunk_id reference)
            self.db.save_chunks(doc_id, chunk_records)

            # Update domain dictionary for spell correction
            if domain_texts:
                try:
                    update_domain_dictionary(domain_texts)
                except Exception as e:
                    logger.warning(f"Domain dictionary update failed (non-critical): {e}")

            return len(all_points)

        except Exception as e:
            logger.error(f"Indexing error for {doc_id}: {e}", exc_info=True)
            raise

    def process_new_document(self, object_name: str, data: bytes) -> Optional[str]:
        """
        Process a new document from MinIO

        Args:
            object_name: Path in MinIO bucket
            data: File data bytes

        Returns:
            Document ID if successful, None otherwise
        """
        doc_id = None  # Initialize for safe exception handling
        filename = os.path.basename(object_name)
        file_ext = os.path.splitext(filename.lower())[1]

        # Check if file type is supported
        if file_ext not in self.parsers:
            logger.info(f"Skipping unsupported file: {filename}")
            return None

        # CRITICAL-FIX: File size validation to prevent OOM on large files
        file_size_mb = len(data) / (1024 * 1024)
        if len(data) > MAX_FILE_SIZE_BYTES:
            logger.warning(
                f"File {filename} exceeds max size ({file_size_mb:.1f}MB > {MAX_FILE_SIZE_MB}MB), "
                f"skipping. Set DOCUMENT_MAX_SIZE_MB to increase limit."
            )
            # Try to create a record to track the rejection
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
                    doc_id,
                    'failed',
                    f'File size ({file_size_mb:.1f}MB) exceeds {MAX_FILE_SIZE_MB}MB limit'
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
                logger.info(f"Document already indexed (content match): {filename}")
                return existing['id']
            elif existing['status'] in ('pending', 'failed'):
                # Document exists but not yet indexed or previously failed - reprocess
                logger.info(f"Found {existing['status']} document, will index: {filename}")
                doc_id = existing['id']
                if existing['status'] == 'failed':
                    self.db.update_document(doc_id, {'retry_count': 0})
                return self._index_existing_document(doc_id, data, filename, content_hash, file_hash)

        # Check by file hash for re-indexing
        existing_by_path = self.db.get_document_by_file_hash(file_hash)
        if existing_by_path:
            if existing_by_path['status'] == 'indexed':
                logger.debug(f"Document already indexed: {filename}")
                return existing_by_path['id']
            elif existing_by_path['status'] == 'pending':
                # Document exists but not yet indexed - continue processing
                logger.info(f"Found pending document by path, will index: {filename}")
                doc_id = existing_by_path['id']
                return self._index_existing_document(doc_id, data, filename, content_hash, file_hash)

        with self._status_lock:
            self.status['current_document'] = filename

        try:
            # Extract metadata
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

            # If document exists but needs reprocessing, update it
            if existing_by_path:
                doc_id = existing_by_path['id']
                self.db.update_document(doc_id, doc_data)
            else:
                doc_id = self.db.create_document(doc_data)

            # Parse document
            text = self.parse_document(data, filename)
            if not text:
                self.db.update_document_status(doc_id, 'failed', 'Failed to parse document')
                return None

            # Get categories for AI analysis
            categories = self.db.get_categories()

            # Run AI analysis if enabled
            if ENABLE_AI_ANALYSIS:
                logger.info(f"Running AI analysis for {filename}")
                analysis = self.analyzer.analyze_document(
                    text=text,
                    filename=filename,
                    title=metadata.get('title'),
                    categories=categories
                )

                # Update document with AI results
                updates = {}
                if analysis.get('summary'):
                    updates['summary'] = analysis['summary']
                if analysis.get('key_topics'):
                    updates['key_topics'] = analysis['key_topics']
                if analysis.get('category'):
                    # Get category ID
                    cat = self.db.get_category_by_name(analysis['category'])
                    if cat:
                        updates['category_id'] = cat['id']
                        updates['category_confidence'] = analysis.get('category_confidence', 0.5)

                if updates:
                    self.db.update_document(doc_id, updates)
            else:
                # Use simple topic extraction
                simple_topics = extract_key_topics(text, max_topics=10)
                if simple_topics:
                    self.db.update_document(doc_id, {'key_topics': simple_topics})

            # RAG 2.0: Get space info for document
            space_info = self.get_document_space_info(doc_id)

            # Index into Qdrant
            chunk_count = self.index_document(doc_id, text, {
                'filename': filename,
                'content_hash': content_hash,
                'title': metadata.get('title', filename),
                'language': metadata.get('language', 'de'),
                'category_name': analysis.get('category', 'Allgemein') if ENABLE_AI_ANALYSIS else 'Allgemein',
                **space_info  # RAG 2.0: Include space metadata
            })

            # Mark as indexed (only if chunks were actually created)
            if chunk_count and chunk_count > 0:
                self.db.update_document_status(doc_id, 'indexed', chunk_count=chunk_count)
                self.db.update_document(doc_id, {'embedding_model': EMBEDDING_MODEL})
            else:
                self.db.update_document_status(doc_id, 'failed', 'No chunks created — document may be empty or unparseable')
                logger.warning(f"Document {filename} produced 0 chunks, marked as failed")
                return doc_id

            with self._status_lock:
                self.status['documents_processed'] += 1

            logger.info(f"Successfully indexed document: {filename} ({chunk_count} chunks) [space: {space_info.get('space_name', 'none')}]")

            # Calculate similarity if enabled
            if ENABLE_SIMILARITY:
                self._calculate_similarities(doc_id)

            # Knowledge Graph: extract entities and relations
            if self.graph_store:
                try:
                    doc_title = metadata.get('title') or filename
                    extraction = extract_from_document(text, str(doc_id), doc_title)
                    if extraction:
                        self.graph_store.store_document_graph(str(doc_id), extraction)
                        entity_count = len(extraction.get('entities', []))
                        relation_count = len(extraction.get('relations', []))
                        logger.info(f"Graph: {entity_count} entities, {relation_count} relations for {filename}")
                except Exception as e:
                    logger.warning(f"Knowledge graph extraction failed for {filename}: {e}")

            return doc_id

        except Exception as e:
            logger.error(f"Error processing {filename}: {e}", exc_info=True)
            if doc_id:
                try:
                    self.db.update_document_status(doc_id, 'failed', str(e))
                except Exception as status_err:
                    logger.error(f"Failed to update status to 'failed' for {doc_id}: {status_err}")
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
        Index an existing document that is in pending state.

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
            # Parse document
            text = self.parse_document(data, filename)
            if not text:
                self.db.update_document_status(doc_id, 'failed', 'Failed to parse document')
                return None

            # Extract metadata
            file_ext = os.path.splitext(filename.lower())[1]
            metadata = extract_metadata(data, filename, file_ext)

            # Get categories for AI analysis
            categories = self.db.get_categories()

            # Run AI analysis if enabled
            analysis = {}
            if ENABLE_AI_ANALYSIS:
                logger.info(f"Running AI analysis for pending document {filename}")
                analysis = self.analyzer.analyze_document(
                    text=text,
                    filename=filename,
                    title=metadata.get('title'),
                    categories=categories
                )

                # Update document with AI results
                updates = {}
                if analysis.get('summary'):
                    updates['summary'] = analysis['summary']
                if analysis.get('key_topics'):
                    updates['key_topics'] = analysis['key_topics']
                if analysis.get('category'):
                    cat = self.db.get_category_by_name(analysis['category'])
                    if cat:
                        updates['category_id'] = cat['id']
                        updates['category_confidence'] = analysis.get('category_confidence', 0.5)

                if updates:
                    self.db.update_document(doc_id, updates)
            else:
                # Use simple topic extraction
                simple_topics = extract_key_topics(text, max_topics=10)
                if simple_topics:
                    self.db.update_document(doc_id, {'key_topics': simple_topics})

            # RAG 2.0: Get space info for document
            space_info = self.get_document_space_info(doc_id)

            # Index into Qdrant
            chunk_count = self.index_document(doc_id, text, {
                'filename': filename,
                'content_hash': content_hash,
                'title': metadata.get('title', filename),
                'language': metadata.get('language', 'de'),
                'category_name': analysis.get('category', 'Allgemein') if ENABLE_AI_ANALYSIS else 'Allgemein',
                **space_info  # RAG 2.0: Include space metadata
            })

            # Mark as indexed (only if chunks were actually created)
            if chunk_count and chunk_count > 0:
                self.db.update_document_status(doc_id, 'indexed', chunk_count=chunk_count)
                self.db.update_document(doc_id, {'embedding_model': EMBEDDING_MODEL})
            else:
                self.db.update_document_status(doc_id, 'failed', 'No chunks created — document may be empty or unparseable')
                logger.warning(f"Document {filename} produced 0 chunks, marked as failed")
                return doc_id

            with self._status_lock:
                self.status['documents_processed'] += 1

            logger.info(f"Successfully indexed pending document: {filename} ({chunk_count} chunks) [space: {space_info.get('space_name', 'none')}]")

            # Calculate similarity if enabled
            if ENABLE_SIMILARITY:
                self._calculate_similarities(doc_id)

            # Knowledge Graph: extract entities and relations
            if self.graph_store:
                try:
                    doc_title = metadata.get('title') or filename
                    extraction = extract_from_document(text, str(doc_id), doc_title)
                    if extraction:
                        self.graph_store.store_document_graph(str(doc_id), extraction)
                        logger.info(f"Graph: {len(extraction.get('entities', []))} entities for {filename}")
                except Exception as e:
                    logger.warning(f"Knowledge graph extraction failed for {filename}: {e}")

            return doc_id

        except Exception as e:
            logger.error(f"Error indexing pending document {filename}: {e}", exc_info=True)
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

    def _calculate_similarities(self, doc_id: str):
        """
        Calculate similarity scores with other documents

        MEDIUM-PRIORITY-FIX 3.4: Optimized similarity calculation
        - Uses Qdrant's HNSW index for O(log n) search
        - Applies score_threshold in search to reduce data transfer
        - Limits results to top 15 (instead of 20) since we only save meaningful ones
        """
        try:
            # Get document's average embedding
            doc = self.db.get_document(doc_id)
            if not doc:
                return

            # Get first chunk embedding as representative
            chunks = self.qdrant_client.scroll(
                collection_name=QDRANT_COLLECTION,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(
                            key="document_id",
                            match=MatchValue(value=doc_id)
                        )
                    ]
                ),
                limit=1,
                with_vectors=True
            )

            if not chunks[0]:
                return

            # Named vector: extract "dense" vector from dict
            raw_vector = chunks[0][0].vector
            if isinstance(raw_vector, dict):
                query_vector = raw_vector.get("dense", raw_vector)
            else:
                query_vector = raw_vector  # Legacy unnamed vector

            # Search using named "dense" vector (qdrant-client >= 1.17 uses query_points)
            from qdrant_client.models import NamedVector
            similar = self.qdrant_client.query_points(
                collection_name=QDRANT_COLLECTION,
                query=query_vector,
                using="dense",
                limit=15,
                score_threshold=SIMILARITY_THRESHOLD,
                with_payload=True
            )

            # Group by document and calculate max similarity
            doc_similarities = {}
            for result in similar.points:
                other_doc_id = result.payload.get('document_id')
                if other_doc_id and other_doc_id != doc_id:
                    current_score = doc_similarities.get(other_doc_id, 0)
                    doc_similarities[other_doc_id] = max(current_score, result.score)

            # Save only top 10 similarities (sorted by score)
            # This prevents database bloat for documents similar to many others
            top_similarities = sorted(
                doc_similarities.items(),
                key=lambda x: x[1],
                reverse=True
            )[:10]

            for other_id, score in top_similarities:
                self.db.save_similarity(doc_id, other_id, score, 'semantic')
                logger.debug(f"Found similar documents: {doc_id} <-> {other_id} ({score:.2f})")

            if top_similarities:
                logger.info(f"Saved {len(top_similarities)} similarity relationships for doc {doc_id[:8]}...")

        except Exception as e:
            logger.error(f"Similarity calculation error: {e}")

    def delete_document(self, doc_id: str) -> bool:
        """
        Delete a document from the system

        Args:
            doc_id: Document UUID

        Returns:
            True if successful
        """
        try:
            # Delete from Qdrant
            self.qdrant_client.delete(
                collection_name=QDRANT_COLLECTION,
                points_selector=Filter(
                    must=[
                        FieldCondition(
                            key="document_id",
                            match=MatchValue(value=doc_id)
                        )
                    ]
                )
            )

            # Delete from MinIO
            doc = self.db.get_document(doc_id)
            if doc and doc.get('file_path'):
                try:
                    self.minio_client.remove_object(MINIO_BUCKET, doc['file_path'])
                except Exception as e:
                    logger.warning(f"Failed to delete from MinIO: {e}")

            # Clean up knowledge graph data for this document
            if self.graph_store:
                try:
                    self.graph_store.delete_document_graph(doc_id)
                except Exception as e:
                    logger.warning(f"Failed to clean up graph for deleted document: {e}")

            # Soft delete from database
            self.db.delete_document(doc_id, soft=True)

            logger.info(f"Deleted document: {doc_id}")
            return True

        except Exception as e:
            logger.error(f"Delete error: {e}")
            return False

    def scan_and_index(self):
        """Scan MinIO bucket and index new documents"""
        try:
            objects = self.minio_client.list_objects(MINIO_BUCKET, recursive=True)

            for obj in objects:
                try:
                    # Quick check: skip download if file hash (name:size) already indexed
                    file_hash = self.calculate_file_hash(obj.object_name, obj.size or 0)
                    existing = self.db.get_document_by_file_hash(file_hash)
                    if existing and existing['status'] == 'indexed':
                        logger.info(f"Document already indexed (content match): {os.path.basename(obj.object_name)}")
                        continue

                    # Download object only if not yet indexed
                    response = self.minio_client.get_object(MINIO_BUCKET, obj.object_name)
                    try:
                        data = response.read()
                    finally:
                        response.close()
                        response.release_conn()

                    # Process document
                    self.process_new_document(obj.object_name, data)

                except Exception as e:
                    logger.error(f"Error processing {obj.object_name}: {e}")
                    continue

            # Get actual pending count from database (not local counter)
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
        try:
            collection_info = self.qdrant_client.get_collection(QDRANT_COLLECTION)
            status['qdrant'] = {
                'collection': QDRANT_COLLECTION,
                'points_count': collection_info.points_count,
                'vectors_count': collection_info.vectors_count
            }
        except Exception as e:
            status['qdrant'] = {'error': str(e)}

        return status

    def run(self):
        """Main loop - run indexing periodically"""
        logger.info(f"Starting Enhanced Document Indexer (interval: {INDEXER_INTERVAL}s)")

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
