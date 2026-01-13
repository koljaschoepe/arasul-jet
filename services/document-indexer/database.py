"""
Database Manager for Document Intelligence System
Handles all PostgreSQL interactions for document metadata
"""

import os
import logging
import uuid
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime
from contextlib import contextmanager

import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor, execute_values

logger = logging.getLogger(__name__)

# Database configuration from environment
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'postgres-db'),
    'port': int(os.getenv('POSTGRES_PORT', '5432')),
    'user': os.getenv('POSTGRES_USER', 'arasul'),
    'password': os.getenv('POSTGRES_PASSWORD', ''),
    'database': os.getenv('POSTGRES_DB', 'arasul_db'),
}


class DatabaseManager:
    """Manages PostgreSQL connections and document operations"""

    def __init__(self, min_conn: int = 2, max_conn: int = 10):
        """Initialize database connection pool"""
        self._pool = None
        self.min_conn = min_conn
        self.max_conn = max_conn
        self._init_pool()

    def _init_pool(self):
        """Initialize the connection pool with retry logic"""
        max_retries = 5
        for attempt in range(max_retries):
            try:
                self._pool = pool.ThreadedConnectionPool(
                    self.min_conn,
                    self.max_conn,
                    host=DB_CONFIG['host'],
                    port=DB_CONFIG['port'],
                    user=DB_CONFIG['user'],
                    password=DB_CONFIG['password'],
                    database=DB_CONFIG['database']
                )
                logger.info("Database connection pool initialized")
                return
            except Exception as e:
                logger.warning(f"Database connection attempt {attempt + 1}/{max_retries} failed: {e}")
                if attempt < max_retries - 1:
                    import time
                    time.sleep(5)
                else:
                    raise

    @contextmanager
    def get_connection(self):
        """Get a connection from the pool"""
        conn = None
        try:
            conn = self._pool.getconn()
            yield conn
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            raise
        finally:
            if conn:
                self._pool.putconn(conn)

    def close(self):
        """Close all connections in the pool"""
        if self._pool:
            self._pool.closeall()
            logger.info("Database connection pool closed")

    # ==================== Document Operations ====================

    def create_document(self, document_data: Dict[str, Any]) -> str:
        """
        Create a new document record

        Args:
            document_data: Dictionary with document fields

        Returns:
            UUID of created document
        """
        doc_id = str(uuid.uuid4())

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO documents (
                        id, filename, original_filename, file_path, file_size,
                        mime_type, file_extension, content_hash, file_hash,
                        status, title, author, language, page_count,
                        word_count, char_count, uploaded_by
                    ) VALUES (
                        %s, %s, %s, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s, %s, %s, %s,
                        %s, %s, %s
                    )
                    RETURNING id
                """, (
                    doc_id,
                    document_data.get('filename'),
                    document_data.get('original_filename'),
                    document_data.get('file_path'),
                    document_data.get('file_size'),
                    document_data.get('mime_type'),
                    document_data.get('file_extension'),
                    document_data.get('content_hash'),
                    document_data.get('file_hash'),
                    document_data.get('status', 'pending'),
                    document_data.get('title'),
                    document_data.get('author'),
                    document_data.get('language', 'de'),
                    document_data.get('page_count'),
                    document_data.get('word_count', 0),
                    document_data.get('char_count', 0),
                    document_data.get('uploaded_by', 'admin')
                ))

        logger.info(f"Created document record: {doc_id}")
        return doc_id

    def get_document(self, doc_id: str) -> Optional[Dict[str, Any]]:
        """Get document by ID"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT * FROM documents_with_category
                    WHERE id = %s
                """, (doc_id,))
                result = cur.fetchone()
                return dict(result) if result else None

    def get_document_by_hash(self, content_hash: str) -> Optional[Dict[str, Any]]:
        """Get document by content hash"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT * FROM documents
                    WHERE content_hash = %s AND deleted_at IS NULL
                """, (content_hash,))
                result = cur.fetchone()
                return dict(result) if result else None

    def get_document_by_file_hash(self, file_hash: str) -> Optional[Dict[str, Any]]:
        """Get document by file hash (filename + size)"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT * FROM documents
                    WHERE file_hash = %s AND deleted_at IS NULL
                """, (file_hash,))
                result = cur.fetchone()
                return dict(result) if result else None

    # PHASE1-FIX: Whitelist of allowed fields to prevent SQL injection
    ALLOWED_UPDATE_FIELDS = frozenset({
        'status', 'title', 'author', 'language', 'page_count',
        'word_count', 'char_count', 'chunk_count', 'processing_error',
        'processing_started_at', 'processing_completed_at', 'indexed_at',
        'summary', 'keywords', 'category_id', 'space_id', 'metadata'
    })

    def update_document(self, doc_id: str, updates: Dict[str, Any]) -> bool:
        """Update document fields"""
        if not updates:
            return False

        # PHASE1-FIX: Validate field names against whitelist to prevent SQL injection
        set_parts = []
        values = []
        for key, value in updates.items():
            if key not in self.ALLOWED_UPDATE_FIELDS:
                logger.warning(f"Attempted to update non-whitelisted field: {key}")
                continue
            set_parts.append(f"{key} = %s")
            values.append(value)

        if not set_parts:
            logger.warning("No valid fields to update after whitelist filtering")
            return False

        values.append(doc_id)

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    UPDATE documents
                    SET {', '.join(set_parts)}
                    WHERE id = %s
                """, values)
                return cur.rowcount > 0

    def update_document_status(
        self,
        doc_id: str,
        status: str,
        error: Optional[str] = None,
        chunk_count: Optional[int] = None
    ) -> bool:
        """Update document processing status"""
        updates = {'status': status}

        if status == 'processing':
            updates['processing_started_at'] = datetime.now()
        elif status == 'indexed':
            updates['processing_completed_at'] = datetime.now()
            updates['indexed_at'] = datetime.now()
            if chunk_count is not None:
                updates['chunk_count'] = chunk_count
        elif status == 'failed':
            updates['processing_error'] = error
            # Increment retry count
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE documents
                        SET retry_count = retry_count + 1
                        WHERE id = %s
                    """, (doc_id,))

        return self.update_document(doc_id, updates)

    def delete_document(self, doc_id: str, soft: bool = True) -> bool:
        """Delete document (soft delete by default)"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                if soft:
                    cur.execute("""
                        UPDATE documents
                        SET deleted_at = NOW(), status = 'deleted'
                        WHERE id = %s
                    """, (doc_id,))
                else:
                    cur.execute("DELETE FROM documents WHERE id = %s", (doc_id,))
                return cur.rowcount > 0

    def list_documents(
        self,
        status: Optional[str] = None,
        category_id: Optional[int] = None,
        search: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        order_by: str = 'uploaded_at',
        order_dir: str = 'DESC'
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        List documents with filtering and pagination

        Returns:
            Tuple of (documents list, total count)
        """
        conditions = ["deleted_at IS NULL"]
        params = []

        if status:
            conditions.append("status = %s")
            params.append(status)

        if category_id:
            conditions.append("category_id = %s")
            params.append(category_id)

        if search:
            conditions.append("(filename ILIKE %s OR title ILIKE %s)")
            search_pattern = f"%{search}%"
            params.extend([search_pattern, search_pattern])

        where_clause = " AND ".join(conditions)

        # Validate order_by to prevent SQL injection
        valid_order_fields = ['uploaded_at', 'filename', 'title', 'file_size', 'status']
        if order_by not in valid_order_fields:
            order_by = 'uploaded_at'
        if order_dir.upper() not in ['ASC', 'DESC']:
            order_dir = 'DESC'

        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Get total count
                cur.execute(f"""
                    SELECT COUNT(*) FROM documents WHERE {where_clause}
                """, params)
                total = cur.fetchone()['count']

                # Get documents
                cur.execute(f"""
                    SELECT * FROM documents_with_category
                    WHERE {where_clause}
                    ORDER BY {order_by} {order_dir}
                    LIMIT %s OFFSET %s
                """, params + [limit, offset])

                documents = [dict(row) for row in cur.fetchall()]

        return documents, total

    def get_pending_documents(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get documents pending processing"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT * FROM documents
                    WHERE status = 'pending'
                    AND retry_count < 3
                    ORDER BY uploaded_at ASC
                    LIMIT %s
                """, (limit,))
                return [dict(row) for row in cur.fetchall()]

    # ==================== Category Operations ====================

    def get_categories(self) -> List[Dict[str, Any]]:
        """Get all document categories"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT * FROM document_categories
                    ORDER BY is_system DESC, name ASC
                """)
                return [dict(row) for row in cur.fetchall()]

    def get_category_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Get category by name"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT * FROM document_categories WHERE name = %s
                """, (name,))
                result = cur.fetchone()
                return dict(result) if result else None

    def update_document_category(
        self,
        doc_id: str,
        category_id: int,
        confidence: float = 1.0
    ) -> bool:
        """Update document's category"""
        return self.update_document(doc_id, {
            'category_id': category_id,
            'category_confidence': confidence
        })

    # ==================== Chunk Operations ====================

    def save_chunks(self, doc_id: str, chunks: List[Dict[str, Any]]) -> int:
        """Save document chunks to database"""
        if not chunks:
            return 0

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                # Delete existing chunks
                cur.execute("""
                    DELETE FROM document_chunks WHERE document_id = %s
                """, (doc_id,))

                # Insert new chunks
                chunk_data = [
                    (
                        chunk['id'],
                        doc_id,
                        chunk['chunk_index'],
                        chunk['text'],
                        chunk.get('char_start'),
                        chunk.get('char_end'),
                        chunk.get('word_count', len(chunk['text'].split()))
                    )
                    for chunk in chunks
                ]

                execute_values(cur, """
                    INSERT INTO document_chunks
                    (id, document_id, chunk_index, chunk_text, char_start, char_end, word_count)
                    VALUES %s
                """, chunk_data)

        return len(chunks)

    # ==================== Similarity Operations ====================

    def save_similarity(
        self,
        doc_id_1: str,
        doc_id_2: str,
        score: float,
        similarity_type: str = 'semantic'
    ) -> bool:
        """Save document similarity score"""
        # Ensure consistent ordering
        if doc_id_1 > doc_id_2:
            doc_id_1, doc_id_2 = doc_id_2, doc_id_1

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO document_similarities
                    (document_id_1, document_id_2, similarity_score, similarity_type)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (document_id_1, document_id_2)
                    DO UPDATE SET
                        similarity_score = EXCLUDED.similarity_score,
                        similarity_type = EXCLUDED.similarity_type,
                        calculated_at = NOW()
                """, (doc_id_1, doc_id_2, score, similarity_type))
                return True

    def get_similar_documents(
        self,
        doc_id: str,
        min_similarity: float = 0.7,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get similar documents"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT * FROM find_similar_documents(%s, %s, %s)
                """, (doc_id, min_similarity, limit))
                return [dict(row) for row in cur.fetchall()]

    # ==================== Statistics Operations ====================

    def get_statistics(self) -> Dict[str, Any]:
        """Get document statistics"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT * FROM get_document_statistics()")
                result = cur.fetchone()
                return dict(result) if result else {}

    def log_access(
        self,
        doc_id: str,
        access_type: str,
        user_id: Optional[str] = None,
        query_text: Optional[str] = None
    ):
        """Log document access for analytics"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO document_access_log
                    (document_id, access_type, user_id, query_text)
                    VALUES (%s, %s, %s, %s)
                """, (doc_id, access_type, user_id, query_text))

    # ==================== Processing Queue ====================

    def add_to_queue(
        self,
        doc_id: str,
        task_type: str,
        priority: int = 0
    ) -> bool:
        """Add document to processing queue"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO document_processing_queue
                    (document_id, task_type, priority)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (document_id, task_type, status) DO NOTHING
                """, (doc_id, task_type, priority))
                return cur.rowcount > 0

    def get_next_queue_item(self, task_type: str) -> Optional[Dict[str, Any]]:
        """Get next item from processing queue"""
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    UPDATE document_processing_queue
                    SET status = 'processing', started_at = NOW()
                    WHERE id = (
                        SELECT id FROM document_processing_queue
                        WHERE task_type = %s
                        AND status = 'pending'
                        AND attempts < max_attempts
                        ORDER BY priority DESC, created_at ASC
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING *
                """, (task_type,))
                result = cur.fetchone()
                return dict(result) if result else None

    def complete_queue_item(self, queue_id: int, success: bool, error: Optional[str] = None):
        """Complete a queue item"""
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                if success:
                    cur.execute("""
                        UPDATE document_processing_queue
                        SET status = 'completed', completed_at = NOW()
                        WHERE id = %s
                    """, (queue_id,))
                else:
                    cur.execute("""
                        UPDATE document_processing_queue
                        SET status = 'pending',
                            attempts = attempts + 1,
                            error_message = %s
                        WHERE id = %s
                    """, (error, queue_id))
