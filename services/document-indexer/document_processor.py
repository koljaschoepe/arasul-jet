"""
Document processing module for Document Indexer.

Handles document parsing, hashing, metadata extraction,
AI analysis, and the shared indexing pipeline used by both
process_new_document() and _index_existing_document().
"""

import hashlib
import logging
import os
import shutil
from io import BytesIO
from typing import Dict, List, Optional, Any

from document_parsers import (
    parse_pdf, parse_pdf_streaming, parse_docx, parse_txt, parse_markdown,
    parse_yaml_table, parse_image
)
from metadata_extractor import extract_metadata, extract_key_topics
from text_chunker import chunk_text_hierarchical
from spell_corrector import update_domain_dictionary
from entity_extractor import extract_from_document

from config import (
    PARENT_CHUNK_SIZE, CHILD_CHUNK_SIZE, CHILD_CHUNK_OVERLAP,
    ENABLE_AI_ANALYSIS, EMBEDDING_MODEL
)

logger = logging.getLogger(__name__)


STREAMING_PDF_THRESHOLD = 50  # Use streaming parser for PDFs with more than 50 pages


def parse_pdf_smart(file_obj):
    """Use streaming parser for large PDFs (>50 pages) to reduce memory usage."""
    import fitz
    file_obj.seek(0)
    pdf_bytes = file_obj.read()
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_count = len(doc)
    doc.close()

    file_obj.seek(0)
    if page_count > STREAMING_PDF_THRESHOLD:
        logger.info(f"Large PDF ({page_count} pages), using streaming parser")
        return "\n\n".join(parse_pdf_streaming(file_obj))
    return parse_pdf(file_obj)


# File parsers registry
PARSERS = {
    '.pdf': parse_pdf_smart,
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

# Supported MIME types mapping
SUPPORTED_MIMES = {
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


def calculate_content_hash(data: bytes) -> str:
    """Calculate SHA256 hash of file content."""
    return hashlib.sha256(data).hexdigest()


def calculate_file_hash(filename: str, size: int) -> str:
    """Calculate quick hash from filename and size."""
    return hashlib.sha256(f"{filename}:{size}".encode()).hexdigest()


def get_mime_type(filename: str) -> str:
    """Get MIME type from filename."""
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


def parse_document(data: bytes, filename: str) -> Optional[str]:
    """Parse document and extract text."""
    _, ext = os.path.splitext(filename.lower())

    if ext not in PARSERS:
        logger.warning(f"Unsupported file type: {ext}")
        return None

    try:
        parser = PARSERS[ext]
        text = parser(BytesIO(data))
        logger.debug(f"Parsed {filename}: {len(text)} characters")
        return text
    except Exception as e:
        logger.error(f"Parse error for {filename}: {e}")
        return None


def get_document_space_info(db, doc_id: str) -> Dict[str, str]:
    """
    Get Knowledge Space info for a document (RAG 2.0).

    Args:
        db: DatabaseManager instance
        doc_id: Document UUID

    Returns:
        Dict with space_id, space_name, space_slug
    """
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT d.space_id, ks.name as space_name,
                           ks.slug as space_slug
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


def contextualize_chunk(
    chunk_text: str,
    document_title: str,
    parent_text: str,
    chunk_index: int,
    total_chunks: int
) -> str:
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


def run_indexing_pipeline(
    doc_id: str,
    data: bytes,
    filename: str,
    content_hash: str,
    db,
    analyzer,
    embedding_client,
    qdrant_manager,
    graph_store,
    enable_similarity: bool
) -> Optional[int]:
    """
    Shared indexing pipeline for both new and existing documents.

    Performs: parse -> AI analysis -> chunk -> embed -> upsert -> post-process.

    Args:
        doc_id: Document UUID
        data: Raw file bytes
        filename: Filename
        content_hash: Content hash string
        db: DatabaseManager instance
        analyzer: DocumentAnalyzer instance
        embedding_client: EmbeddingClient instance
        qdrant_manager: QdrantManager instance
        graph_store: GraphStore instance or None
        enable_similarity: Whether to calculate similarity scores

    Returns:
        Number of chunks indexed, or None on failure
    """
    # Pre-flight: check available disk space (need ~10x file size for chunks + embeddings)
    MIN_FREE_MB = 500
    try:
        free_mb = shutil.disk_usage('/').free // (1024 * 1024)
        if free_mb < MIN_FREE_MB:
            msg = f'Low disk space ({free_mb}MB free, need {MIN_FREE_MB}MB minimum)'
            logger.error(f"Skipping indexing for {filename}: {msg}")
            db.update_document_status(doc_id, 'failed', msg)
            return None
    except OSError:
        pass  # Non-critical — proceed if disk check fails

    # Parse document
    text = parse_document(data, filename)
    if not text:
        db.update_document_status(doc_id, 'failed', 'Failed to parse document')
        return None

    # Extract metadata
    file_ext = os.path.splitext(filename.lower())[1]
    metadata = extract_metadata(data, filename, file_ext)

    # Get categories for AI analysis
    categories = db.get_categories()

    # Run AI analysis if enabled
    analysis = {}
    if ENABLE_AI_ANALYSIS:
        logger.info(f"Running AI analysis for {filename}")
        analysis = analyzer.analyze_document(
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
            cat = db.get_category_by_name(analysis['category'])
            if cat:
                updates['category_id'] = cat['id']
                updates['category_confidence'] = analysis.get(
                    'category_confidence', 0.5
                )

        if updates:
            db.update_document(doc_id, updates)
    else:
        # Use simple topic extraction
        simple_topics = extract_key_topics(text, max_topics=10)
        if simple_topics:
            db.update_document(doc_id, {'key_topics': simple_topics})

    # RAG 2.0: Get space info for document
    space_info = get_document_space_info(db, doc_id)

    # Index into Qdrant (chunking + embedding + upsert)
    chunk_count = _index_to_qdrant(
        doc_id=doc_id,
        text=text,
        metadata={
            'filename': filename,
            'content_hash': content_hash,
            'title': metadata.get('title', filename),
            'language': metadata.get('language', 'de'),
            'category_name': (
                analysis.get('category', 'Allgemein')
                if ENABLE_AI_ANALYSIS else 'Allgemein'
            ),
            **space_info
        },
        db=db,
        embedding_client=embedding_client,
        qdrant_manager=qdrant_manager
    )

    # Mark as indexed (only if chunks were actually created)
    if chunk_count and chunk_count > 0:
        db.update_document_status(doc_id, 'indexed', chunk_count=chunk_count)
        db.update_document(doc_id, {'embedding_model': EMBEDDING_MODEL})
    else:
        # Clean up any partial vectors that may have been upserted
        try:
            qdrant_manager.delete_document_vectors(doc_id)
        except Exception as cleanup_err:
            logger.warning(f"Failed to clean up vectors for {doc_id}: {cleanup_err}")
        db.update_document_status(
            doc_id, 'failed',
            'No chunks created \u2014 document may be empty or unparseable'
        )
        logger.warning(
            f"Document {filename} produced 0 chunks, marked as failed"
        )
        return 0

    logger.info(
        f"Successfully indexed document: {filename} ({chunk_count} chunks) "
        f"[space: {space_info.get('space_name', 'none')}]"
    )

    # Calculate similarity if enabled
    if enable_similarity:
        qdrant_manager.calculate_similarities(doc_id, db)

    # Knowledge Graph: extract entities and relations
    if graph_store:
        try:
            doc_title = metadata.get('title') or filename
            extraction = extract_from_document(text, str(doc_id), doc_title)
            if extraction:
                graph_store.store_document_graph(str(doc_id), extraction)
                entity_count = len(extraction.get('entities', []))
                relation_count = len(extraction.get('relations', []))
                logger.info(
                    f"Graph: {entity_count} entities, "
                    f"{relation_count} relations for {filename}"
                )
        except Exception as e:
            logger.warning(
                f"Knowledge graph extraction failed for {filename}: {e}"
            )

    return chunk_count


def _index_to_qdrant(
    doc_id: str,
    text: str,
    metadata: Dict[str, Any],
    db,
    embedding_client,
    qdrant_manager
) -> int:
    """
    Chunk, embed, and upsert document text into Qdrant.

    Uses the Parent-Document Retriever pattern:
    - Parent chunks (large) stored in PostgreSQL for rich LLM context
    - Child chunks (small) embedded and stored in Qdrant for precise retrieval

    Args:
        doc_id: Document UUID
        text: Full document text
        metadata: Document metadata
        db: DatabaseManager instance
        embedding_client: EmbeddingClient instance
        qdrant_manager: QdrantManager instance

    Returns:
        Number of child chunks indexed
    """
    db.update_document_status(doc_id, 'processing')

    try:
        # Hierarchical chunking
        parent_chunks = chunk_text_hierarchical(
            text, PARENT_CHUNK_SIZE, CHILD_CHUNK_SIZE, CHILD_CHUNK_OVERLAP
        )
        if not parent_chunks:
            logger.warning(f"No chunks generated for document {doc_id}")
            return 0

        # Filter out tiny child chunks (< 20 words) — headers, page numbers, etc.
        # produce poor embeddings and add noise to retrieval
        MIN_CHILD_WORDS = 20
        for parent in parent_chunks:
            parent.children = [c for c in parent.children if c.word_count >= MIN_CHILD_WORDS]
        # Remove parents with no remaining children
        parent_chunks = [p for p in parent_chunks if p.children]
        if not parent_chunks:
            logger.warning(f"No chunks above {MIN_CHILD_WORDS} words for document {doc_id}")
            return 0

        # Re-index global child indices after filtering
        global_idx = 0
        for parent in parent_chunks:
            for child in parent.children:
                child.global_index = global_idx
                global_idx += 1

        total_children = sum(len(p.children) for p in parent_chunks)
        doc_title = metadata.get('title', metadata.get('filename', ''))
        logger.info(
            f"Document {doc_id}: {len(parent_chunks)} parent chunks, "
            f"{total_children} child chunks to index"
        )

        # Save parent chunks to PostgreSQL and get their DB IDs
        parent_id_map = db.save_parent_chunks(doc_id, parent_chunks)

        # Generate embeddings and Qdrant points for child chunks
        batch_size = 10
        all_points = []
        chunk_records = []
        domain_texts = []

        for parent in parent_chunks:
            parent_db_id = parent_id_map.get(parent.parent_index)

            # Contextualized texts for embedding
            contextualized_texts = [
                contextualize_chunk(
                    child.text, doc_title, parent.text,
                    child.global_index, total_children
                )
                for child in parent.children
            ]
            # Original texts for payload storage
            original_texts = [child.text for child in parent.children]

            for i in range(0, len(contextualized_texts), batch_size):
                batch_ctx_texts = contextualized_texts[i:i + batch_size]
                batch_orig_texts = original_texts[i:i + batch_size]
                batch_children = parent.children[i:i + batch_size]
                embeddings = embedding_client.get_batch_embeddings(
                    batch_ctx_texts
                )

                for child, orig_text, embedding in zip(
                    batch_children, batch_orig_texts, embeddings
                ):
                    if embedding is None:
                        logger.warning(
                            f"Failed to get embedding for child chunk "
                            f"{child.global_index} "
                            f"(parent {parent.parent_index})"
                        )
                        continue

                    point = qdrant_manager.build_point(
                        doc_id=doc_id,
                        chunk_global_index=child.global_index,
                        child_index=child.child_index,
                        parent_db_id=parent_db_id,
                        parent_index=parent.parent_index,
                        total_children=total_children,
                        original_text=orig_text,
                        embedding=embedding,
                        metadata=metadata
                    )
                    all_points.append(point)

                    # Record for database
                    chunk_id = qdrant_manager.get_chunk_id(
                        doc_id, child.global_index
                    )
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

        # Validate embedding completeness — detect silent failures
        skipped_chunks = total_children - len(all_points)
        if skipped_chunks > 0:
            skip_pct = (skipped_chunks / total_children * 100) if total_children else 0
            logger.error(
                f"Document {doc_id}: {skipped_chunks}/{total_children} chunks "
                f"({skip_pct:.0f}%) failed to embed — document partially indexed"
            )
            if len(all_points) == 0:
                logger.error(f"Document {doc_id}: ALL chunks failed — aborting indexing")
                return 0

        # Upsert to Qdrant in batches to prevent OOM on large documents
        UPSERT_BATCH_SIZE = 100
        total_points = len(all_points)
        for i in range(0, total_points, UPSERT_BATCH_SIZE):
            batch = all_points[i:i + UPSERT_BATCH_SIZE]
            qdrant_manager.upsert_points(batch)
        all_points.clear()  # Free memory immediately
        if total_points:
            logger.info(
                f"Indexed {total_points} child chunks for document "
                f"{doc_id} (dense + sparse)"
            )

        # Save child chunk records to PostgreSQL
        db.save_chunks(doc_id, chunk_records)

        # Update domain dictionary for spell correction
        if domain_texts:
            try:
                update_domain_dictionary(domain_texts)
            except Exception as e:
                logger.warning(
                    f"Domain dictionary update failed (non-critical): {e}"
                )

        return total_points

    except Exception as e:
        logger.error(
            f"Indexing error for {doc_id}: {e}", exc_info=True
        )
        # Rollback: remove any partially upserted vectors from Qdrant
        try:
            qdrant_manager.delete_document_vectors(doc_id)
            logger.info(f"Rolled back partial vectors for {doc_id}")
        except Exception as cleanup_err:
            logger.warning(
                f"Failed to rollback vectors for {doc_id}: {cleanup_err}"
            )
        raise
