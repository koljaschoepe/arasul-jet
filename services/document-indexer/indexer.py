#!/usr/bin/env python3
"""
Document Indexer Service for Arasul Platform
Automatically indexes documents from MinIO into Qdrant vector database
Runs every 30 seconds and supports PDF, TXT, DOCX, and Markdown files
"""

import os
import sys
import time
import logging
import hashlib
import uuid
from typing import List, Dict, Optional
from io import BytesIO

from minio import Minio
from minio.error import S3Error
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import requests

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


class DocumentIndexer:
    def __init__(self):
        """Initialize the document indexer"""
        logger.info("Initializing Document Indexer...")

        # Initialize MinIO client
        self.minio_client = self._init_minio()

        # Initialize Qdrant client
        self.qdrant_client = self._init_qdrant()

        # File extension to parser mapping
        self.parsers = {
            '.pdf': parse_pdf,
            '.txt': parse_txt,
            '.md': parse_markdown,
            '.markdown': parse_markdown,
            '.docx': parse_docx,
        }

        logger.info("Document Indexer initialized successfully")

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

            # Parse document
            text = self.parse_document(object_name, data)
            if not text:
                logger.warning(f"Failed to extract text from {object_name}")
                return

            # Chunk text
            chunks = chunk_text(text, CHUNK_SIZE, CHUNK_OVERLAP)
            logger.info(f"Split {object_name} into {len(chunks)} chunks")

            if not chunks:
                logger.warning(f"No chunks generated for {object_name}")
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

                point = PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload={
                        "document_name": object_name,
                        "document_hash": doc_hash,
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                        "text": chunk,
                        "indexed_at": time.time()
                    }
                )
                points.append(point)

            if points:
                self.qdrant_client.upsert(
                    collection_name=QDRANT_COLLECTION,
                    points=points
                )
                logger.info(f"Indexed {len(points)} chunks from {object_name}")
            else:
                logger.warning(f"No points to index for {object_name}")

        except Exception as e:
            logger.error(f"Error indexing document {object_name}: {e}", exc_info=True)

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
