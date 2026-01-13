#!/usr/bin/env python3
"""
Document Indexer Service for Arasul Platform
Automatically indexes documents from MinIO into Qdrant vector database
Runs every 30 seconds and supports PDF, TXT, DOCX, and Markdown files

RAG 2.0: Extended with Knowledge Space metadata support
"""

import os
import sys
import time
import logging
import hashlib
import uuid
from typing import List, Dict, Optional, Tuple
from io import BytesIO

from minio import Minio
from minio.error import S3Error
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import requests
import psycopg2
from psycopg2.extras import RealDictCursor

from document_parsers import parse_pdf, parse_docx, parse_txt, parse_markdown
from text_chunker import chunk_text

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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
EMBEDDING_VECTOR_SIZE = int(os.getenv('EMBEDDING_VECTOR_SIZE', '768'))

CHUNK_SIZE = int(os.getenv('DOCUMENT_INDEXER_CHUNK_SIZE', '500'))
CHUNK_OVERLAP = int(os.getenv('DOCUMENT_INDEXER_CHUNK_OVERLAP', '50'))
INDEXER_INTERVAL = int(os.getenv('DOCUMENT_INDEXER_INTERVAL', '30'))

# PostgreSQL configuration (RAG 2.0)
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'postgres-db')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', '5432'))
POSTGRES_DB = os.getenv('POSTGRES_DB', 'arasul_db')
POSTGRES_USER = os.getenv('POSTGRES_USER', 'arasul')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', '')


class DocumentIndexer:
    def __init__(self):
        """Initialize the document indexer"""
        logger.info("Initializing Document Indexer...")

        # Initialize MinIO client
        self.minio_client = self._init_minio()

        # Initialize Qdrant client
        self.qdrant_client = self._init_qdrant()

        # Initialize PostgreSQL connection (RAG 2.0)
        self.pg_conn = None

        # File extension to parser mapping
        self.parsers = {
            '.pdf': parse_pdf,
            '.txt': parse_txt,
            '.md': parse_markdown,
            '.markdown': parse_markdown,
            '.docx': parse_docx,
        }

        logger.info("Document Indexer initialized successfully")

    def _get_pg_connection(self):
        """Get or create PostgreSQL connection (RAG 2.0)"""
        try:
            if self.pg_conn is None or self.pg_conn.closed:
                self.pg_conn = psycopg2.connect(
                    host=POSTGRES_HOST,
                    port=POSTGRES_PORT,
                    dbname=POSTGRES_DB,
                    user=POSTGRES_USER,
                    password=POSTGRES_PASSWORD
                )
                self.pg_conn.autocommit = True
                logger.info("PostgreSQL connection established")
            return self.pg_conn
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}")
            return None

    def get_document_metadata(self, file_path: str) -> Optional[Dict]:
        """Get document metadata including space info from PostgreSQL (RAG 2.0)"""
        try:
            conn = self._get_pg_connection()
            if not conn:
                return None

            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT d.id, d.filename, d.space_id, d.title, d.document_summary,
                           ks.name as space_name, ks.slug as space_slug
                    FROM documents d
                    LEFT JOIN knowledge_spaces ks ON d.space_id = ks.id
                    WHERE d.file_path = %s AND d.deleted_at IS NULL
                """, (file_path,))
                result = cur.fetchone()
                return dict(result) if result else None
        except Exception as e:
            logger.error(f"Failed to get document metadata: {e}")
            return None

    def update_document_status(self, file_path: str, status: str, chunk_count: int = None, error: str = None):
        """Update document status in PostgreSQL (RAG 2.0)"""
        try:
            conn = self._get_pg_connection()
            if not conn:
                return

            with conn.cursor() as cur:
                if status == 'indexed':
                    cur.execute("""
                        UPDATE documents
                        SET status = %s, chunk_count = %s, indexed_at = NOW(),
                            processing_completed_at = NOW(), processing_error = NULL
                        WHERE file_path = %s
                    """, (status, chunk_count, file_path))
                elif status == 'failed':
                    cur.execute("""
                        UPDATE documents
                        SET status = %s, processing_error = %s,
                            processing_completed_at = NOW(), retry_count = retry_count + 1
                        WHERE file_path = %s
                    """, (status, error, file_path))
                elif status == 'processing':
                    cur.execute("""
                        UPDATE documents
                        SET status = %s, processing_started_at = NOW()
                        WHERE file_path = %s
                    """, (status, file_path))
                logger.debug(f"Updated document status: {file_path} -> {status}")
        except Exception as e:
            logger.error(f"Failed to update document status: {e}")

    def update_space_statistics(self, space_id: str):
        """Update space statistics after indexing (RAG 2.0)"""
        try:
            conn = self._get_pg_connection()
            if not conn or not space_id:
                return

            with conn.cursor() as cur:
                cur.execute("SELECT update_space_statistics(%s)", (space_id,))
                logger.debug(f"Updated statistics for space: {space_id}")
        except Exception as e:
            logger.error(f"Failed to update space statistics: {e}")

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

                # Create bucket if it doesn't exist
                if not client.bucket_exists(MINIO_BUCKET):
                    client.make_bucket(MINIO_BUCKET)
                    logger.info(f"Created MinIO bucket: {MINIO_BUCKET}")
                else:
                    logger.info(f"MinIO bucket '{MINIO_BUCKET}' already exists")

                return client
            except Exception as e:
                logger.warning(f"MinIO connection attempt {attempt + 1}/{max_retries} failed: {e}")
                if attempt < max_retries - 1:
                    time.sleep(5)
                else:
                    raise

    def _init_qdrant(self) -> QdrantClient:
        """Initialize Qdrant client and create collection if needed"""
        max_retries = 5
        for attempt in range(max_retries):
            try:
                client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

                # Check if collection exists, create if not
                collections = client.get_collections().collections
                collection_names = [c.name for c in collections]

                if QDRANT_COLLECTION not in collection_names:
                    client.create_collection(
                        collection_name=QDRANT_COLLECTION,
                        vectors_config=VectorParams(
                            size=EMBEDDING_VECTOR_SIZE,
                            distance=Distance.COSINE
                        )
                    )
                    logger.info(f"Created Qdrant collection: {QDRANT_COLLECTION}")
                else:
                    logger.info(f"Qdrant collection '{QDRANT_COLLECTION}' already exists")

                return client
            except Exception as e:
                logger.warning(f"Qdrant connection attempt {attempt + 1}/{max_retries} failed: {e}")
                if attempt < max_retries - 1:
                    time.sleep(5)
                else:
                    raise

    def get_embedding(self, text: str) -> Optional[List[float]]:
        """Get embedding vector for text from embedding service"""
        try:
            response = requests.post(
                f"http://{EMBEDDING_HOST}:{EMBEDDING_PORT}/embed",
                json={"texts": text},
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            # Return first embedding from vectors array
            return result.get('vectors', [])[0] if result.get('vectors') else None
        except Exception as e:
            logger.error(f"Error getting embedding: {e}")
            return None

    def get_document_hash(self, object_name: str, data: bytes) -> str:
        """Calculate hash of document for tracking"""
        return hashlib.sha256(f"{object_name}:{len(data)}".encode()).hexdigest()

    def is_document_indexed(self, doc_hash: str) -> bool:
        """Check if document is already indexed in Qdrant"""
        try:
            # Search for existing document by hash in metadata
            result = self.qdrant_client.scroll(
                collection_name=QDRANT_COLLECTION,
                scroll_filter={
                    "must": [
                        {
                            "key": "document_hash",
                            "match": {"value": doc_hash}
                        }
                    ]
                },
                limit=1
            )
            return len(result[0]) > 0
        except Exception as e:
            logger.error(f"Error checking if document indexed: {e}")
            return False

    def parse_document(self, object_name: str, data: bytes) -> Optional[str]:
        """Parse document based on file extension"""
        _, ext = os.path.splitext(object_name.lower())

        if ext not in self.parsers:
            logger.warning(f"Unsupported file type: {ext} for {object_name}")
            return None

        try:
            parser = self.parsers[ext]
            text = parser(BytesIO(data))
            logger.info(f"Parsed {object_name}: {len(text)} characters")
            return text
        except Exception as e:
            logger.error(f"Error parsing {object_name}: {e}")
            return None

    def index_document(self, object_name: str, data: bytes):
        """Index a single document into Qdrant"""
        try:
            # Calculate document hash
            doc_hash = self.get_document_hash(object_name, data)

            # Check if already indexed
            if self.is_document_indexed(doc_hash):
                logger.debug(f"Document {object_name} already indexed, skipping")
                return

            # RAG 2.0: Get document metadata including space info from PostgreSQL
            doc_meta = self.get_document_metadata(object_name)
            document_id = str(doc_meta.get('id', '')) if doc_meta else None
            space_id = str(doc_meta.get('space_id', '')) if doc_meta and doc_meta.get('space_id') else None
            space_name = doc_meta.get('space_name', '') if doc_meta else None
            space_slug = doc_meta.get('space_slug', '') if doc_meta else None
            doc_title = doc_meta.get('title', '') if doc_meta else None
            doc_summary = doc_meta.get('document_summary', '') if doc_meta else None

            # Update status to processing
            self.update_document_status(object_name, 'processing')

            # Parse document
            text = self.parse_document(object_name, data)
            if not text:
                logger.warning(f"Failed to extract text from {object_name}")
                self.update_document_status(object_name, 'failed', error='Failed to extract text')
                return

            # Chunk text
            chunks = chunk_text(text, CHUNK_SIZE, CHUNK_OVERLAP)
            logger.info(f"Split {object_name} into {len(chunks)} chunks")

            if not chunks:
                logger.warning(f"No chunks generated for {object_name}")
                self.update_document_status(object_name, 'failed', error='No chunks generated')
                return

            # Generate embeddings and store in Qdrant
            points = []
            for i, chunk in enumerate(chunks):
                embedding = self.get_embedding(chunk)
                if embedding is None:
                    logger.warning(f"Failed to get embedding for chunk {i} of {object_name}")
                    continue

                # Generate UUID from hash for deterministic but valid point ID
                point_id = str(uuid.UUID(hashlib.md5(f"{doc_hash}:{i}".encode()).hexdigest()))

                # RAG 2.0: Extended payload with space metadata
                payload = {
                    "document_name": object_name,
                    "document_hash": doc_hash,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                    "text": chunk,
                    "indexed_at": time.time(),
                    # RAG 2.0 fields
                    "document_id": document_id,
                    "space_id": space_id,
                    "space_name": space_name or "",
                    "space_slug": space_slug or "",
                    "title": doc_title or object_name,
                    "document_summary": doc_summary or ""
                }

                point = PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload=payload
                )
                points.append(point)

            if points:
                self.qdrant_client.upsert(
                    collection_name=QDRANT_COLLECTION,
                    points=points
                )
                logger.info(f"Indexed {len(points)} chunks from {object_name}")

                # RAG 2.0: Update document status and space statistics
                self.update_document_status(object_name, 'indexed', chunk_count=len(points))
                if space_id:
                    self.update_space_statistics(space_id)
            else:
                logger.warning(f"No points to index for {object_name}")
                self.update_document_status(object_name, 'failed', error='No embeddings generated')

        except Exception as e:
            logger.error(f"Error indexing document {object_name}: {e}", exc_info=True)
            self.update_document_status(object_name, 'failed', error=str(e))

    def scan_and_index(self):
        """Scan MinIO bucket and index new documents"""
        try:
            objects = self.minio_client.list_objects(MINIO_BUCKET, recursive=True)

            for obj in objects:
                try:
                    # Download object
                    response = self.minio_client.get_object(MINIO_BUCKET, obj.object_name)
                    data = response.read()
                    response.close()
                    response.release_conn()

                    # Index document
                    self.index_document(obj.object_name, data)

                except Exception as e:
                    logger.error(f"Error processing {obj.object_name}: {e}")
                    continue

            logger.info("Scan and index cycle completed")

        except S3Error as e:
            logger.error(f"MinIO error during scan: {e}")
        except Exception as e:
            logger.error(f"Unexpected error during scan: {e}", exc_info=True)

    def run(self):
        """Main loop - run indexing every INDEXER_INTERVAL seconds"""
        logger.info(f"Starting Document Indexer main loop (interval: {INDEXER_INTERVAL}s)")

        while True:
            try:
                self.scan_and_index()
            except Exception as e:
                logger.error(f"Error in main loop: {e}", exc_info=True)

            time.sleep(INDEXER_INTERVAL)


if __name__ == "__main__":
    try:
        indexer = DocumentIndexer()
        indexer.run()
    except KeyboardInterrupt:
        logger.info("Document Indexer stopped by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)
