"""
Qdrant vector database manager for Document Indexer.

Handles collection initialization, vector upsert, similarity search,
and document deletion from Qdrant.
"""

import hashlib
import logging
import time
import uuid
from typing import Dict, List, Any, Optional

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue,
    SparseVectorParams, SparseVector, Modifier,
    BinaryQuantization, BinaryQuantizationConfig, HnswConfigDiff, NamedVector
)

from sparse_encoder import compute_sparse_vector
from config import (
    QDRANT_HOST, QDRANT_PORT, QDRANT_COLLECTION,
    EMBEDDING_VECTOR_SIZE, SIMILARITY_THRESHOLD
)

logger = logging.getLogger(__name__)


class QdrantManager:
    """Manages all Qdrant vector database operations."""

    def __init__(self, host: str = None, port: int = None,
                 collection: str = None):
        self.host = host or QDRANT_HOST
        self.port = port or QDRANT_PORT
        self.collection = collection or QDRANT_COLLECTION
        self.client = self._init_qdrant()

    def _init_qdrant(self) -> QdrantClient:
        """Initialize Qdrant client and collection with hybrid dense+sparse vectors."""
        max_retries = 5
        for attempt in range(max_retries):
            try:
                client = QdrantClient(host=self.host, port=self.port)

                # Check/create collection (also handles aliases)
                collection_exists = False
                try:
                    client.get_collection(self.collection)
                    collection_exists = True
                except Exception:
                    pass

                if not collection_exists:
                    client.create_collection(
                        collection_name=self.collection,
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
                    logger.info(
                        f"Created Qdrant collection: {self.collection} "
                        f"(dense + sparse BM25)"
                    )

                    # Create payload indices for efficient filtering
                    client.create_payload_index(
                        self.collection, "space_id", "keyword"
                    )
                    client.create_payload_index(
                        self.collection, "document_id", "keyword"
                    )
                    client.create_payload_index(
                        self.collection, "category", "keyword"
                    )
                    logger.info(
                        f"Created payload indices for collection: "
                        f"{self.collection}"
                    )
                else:
                    logger.info(
                        f"Qdrant collection '{self.collection}' ready"
                    )

                return client
            except Exception as e:
                logger.warning(
                    f"Qdrant connection attempt {attempt + 1}/{max_retries} "
                    f"failed: {e}"
                )
                if attempt < max_retries - 1:
                    time.sleep(5)
                else:
                    raise

    def upsert_points(self, points: List[PointStruct]):
        """Upsert points into the Qdrant collection."""
        if points:
            self.client.upsert(
                collection_name=self.collection,
                points=points
            )
            logger.info(
                f"Upserted {len(points)} points into Qdrant "
                f"(dense + sparse)"
            )

    def build_point(
        self,
        doc_id: str,
        chunk_global_index: int,
        child_index: int,
        parent_db_id: Optional[str],
        parent_index: int,
        total_children: int,
        original_text: str,
        embedding: List[float],
        metadata: Dict[str, Any]
    ) -> PointStruct:
        """
        Build a Qdrant PointStruct for a child chunk.

        Args:
            doc_id: Document UUID
            chunk_global_index: Global index of the child chunk
            child_index: Index within its parent
            parent_db_id: Database ID of the parent chunk
            parent_index: Index of the parent chunk
            total_children: Total number of child chunks in the document
            original_text: Original chunk text (no context header)
            embedding: Dense embedding vector
            metadata: Document metadata dict

        Returns:
            A PointStruct ready for upsert
        """
        # Generate deterministic UUID for child chunk
        chunk_id = str(uuid.UUID(
            hashlib.md5(
                f"{doc_id}:{chunk_global_index}".encode()
            ).hexdigest()
        ))

        # Compute sparse BM25 vector from original text
        sparse_indices, sparse_values = compute_sparse_vector(original_text)

        # Create vector data with named dense + sparse vectors
        vector_data = {"dense": embedding}
        if sparse_indices:
            vector_data["bm25"] = SparseVector(
                indices=sparse_indices, values=sparse_values
            )

        return PointStruct(
            id=chunk_id,
            vector=vector_data,
            payload={
                "document_id": doc_id,
                "document_name": metadata.get('filename', ''),
                "document_hash": metadata.get('content_hash', ''),
                "chunk_index": chunk_global_index,
                "child_index": child_index,
                "parent_chunk_id": parent_db_id,
                "parent_index": parent_index,
                "total_chunks": total_children,
                "text": original_text,
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

    def get_chunk_id(self, doc_id: str, chunk_global_index: int) -> str:
        """Generate deterministic UUID for a child chunk."""
        return str(uuid.UUID(
            hashlib.md5(
                f"{doc_id}:{chunk_global_index}".encode()
            ).hexdigest()
        ))

    def delete_document_vectors(self, doc_id: str):
        """Delete all vectors for a document from Qdrant."""
        self.client.delete(
            collection_name=self.collection,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="document_id",
                        match=MatchValue(value=doc_id)
                    )
                ]
            )
        )

    def calculate_similarities(
        self, doc_id: str, db
    ) -> None:
        """
        Calculate similarity scores between doc_id and other documents.

        Uses Qdrant's HNSW index for O(log n) search,
        applies score_threshold, and saves top 10 to the database.

        Args:
            doc_id: Document UUID
            db: DatabaseManager instance (for saving similarities)
        """
        try:
            # Get document's first chunk embedding as representative
            doc = db.get_document(doc_id)
            if not doc:
                return

            chunks = self.client.scroll(
                collection_name=self.collection,
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

            # Search using named "dense" vector
            similar = self.client.query_points(
                collection_name=self.collection,
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
                    doc_similarities[other_doc_id] = max(
                        current_score, result.score
                    )

            # Save only top 10 similarities (sorted by score)
            top_similarities = sorted(
                doc_similarities.items(),
                key=lambda x: x[1],
                reverse=True
            )[:10]

            for other_id, score in top_similarities:
                db.save_similarity(doc_id, other_id, score, 'semantic')
                logger.debug(
                    f"Found similar documents: {doc_id} <-> {other_id} "
                    f"({score:.2f})"
                )

            if top_similarities:
                logger.info(
                    f"Saved {len(top_similarities)} similarity relationships "
                    f"for doc {doc_id[:8]}..."
                )

        except Exception as e:
            logger.error(f"Similarity calculation error: {e}")

    def get_collection_info(self) -> Dict[str, Any]:
        """Get collection info for status reporting."""
        try:
            info = self.client.get_collection(self.collection)
            return {
                'collection': self.collection,
                'points_count': info.points_count,
                'vectors_count': info.vectors_count
            }
        except Exception as e:
            return {'error': str(e)}
