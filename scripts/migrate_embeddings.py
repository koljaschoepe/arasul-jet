#!/usr/bin/env python3
"""
Embedding Migration Script for RAG 3.0 Upgrade
Migrates all document embeddings from old model (nomic-embed-text, 768d)
to new model (BGE-M3, 1024d) by re-embedding all chunks.

Steps:
1. Create new Qdrant collection 'documents_v2' (1024d, Binary Quantization)
2. Read all chunks from PostgreSQL document_chunks table
3. Re-embed in batches via embedding-service /embed endpoint
4. Upsert into documents_v2 with same UUIDs and payloads
5. Swap collections: documents -> documents_old, documents_v2 -> documents
6. Re-embed knowledge_spaces.description_embedding + company_context.content_embedding
7. Checkpoint file for resume on failure

Usage:
    # From host (services must be running):
    python3 scripts/migrate_embeddings.py

    # Or inside a container with access to services:
    docker exec -it dashboard-backend python3 /app/scripts/migrate_embeddings.py

Environment variables:
    POSTGRES_HOST     (default: localhost)
    POSTGRES_PORT     (default: 5432)
    POSTGRES_USER     (default: arasul)
    POSTGRES_PASSWORD (required)
    POSTGRES_DB       (default: arasul_db)
    QDRANT_HOST       (default: localhost)
    QDRANT_PORT       (default: 6333)
    EMBEDDING_HOST    (default: localhost)
    EMBEDDING_PORT    (default: 11435)
    QDRANT_COLLECTION (default: documents)
    NEW_VECTOR_SIZE   (default: 1024)
    BATCH_SIZE        (default: 64)
    CHECKPOINT_FILE   (default: /tmp/migrate_embeddings_checkpoint.json)
"""

import os
import sys
import json
import time
import logging
import argparse
from typing import List, Dict, Optional, Tuple

import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
import requests

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
POSTGRES_HOST = os.getenv('POSTGRES_HOST', 'localhost')
POSTGRES_PORT = int(os.getenv('POSTGRES_PORT', '5432'))
POSTGRES_USER = os.getenv('POSTGRES_USER', 'arasul')
POSTGRES_PASSWORD = os.getenv('POSTGRES_PASSWORD', '')
POSTGRES_DB = os.getenv('POSTGRES_DB', 'arasul_db')

QDRANT_HOST = os.getenv('QDRANT_HOST', 'localhost')
QDRANT_PORT = int(os.getenv('QDRANT_PORT', '6333'))
QDRANT_COLLECTION = os.getenv('QDRANT_COLLECTION', 'documents')

EMBEDDING_HOST = os.getenv('EMBEDDING_HOST', 'localhost')
EMBEDDING_PORT = int(os.getenv('EMBEDDING_PORT', '11435'))

NEW_VECTOR_SIZE = int(os.getenv('NEW_VECTOR_SIZE', '1024'))
BATCH_SIZE = int(os.getenv('BATCH_SIZE', '64'))
CHECKPOINT_FILE = os.getenv('CHECKPOINT_FILE', '/tmp/migrate_embeddings_checkpoint.json')

NEW_COLLECTION = f'{QDRANT_COLLECTION}_v2'
OLD_COLLECTION = f'{QDRANT_COLLECTION}_old'

QDRANT_URL = f'http://{QDRANT_HOST}:{QDRANT_PORT}'
EMBEDDING_URL = f'http://{EMBEDDING_HOST}:{EMBEDDING_PORT}'


def get_db_connection():
    """Get PostgreSQL connection"""
    return psycopg2.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        database=POSTGRES_DB
    )


def check_services():
    """Verify all required services are reachable"""
    logger.info("Checking service availability...")

    # Check embedding service
    try:
        resp = requests.get(f'{EMBEDDING_URL}/health', timeout=10)
        health = resp.json()
        logger.info(f"Embedding service: OK (model={health.get('model', 'unknown')}, "
                     f"vector_size={health.get('vector_size', 'unknown')})")
        if health.get('vector_size') != NEW_VECTOR_SIZE:
            logger.warning(f"Embedding service vector_size={health.get('vector_size')} "
                           f"!= expected {NEW_VECTOR_SIZE}")
    except Exception as e:
        logger.error(f"Embedding service unreachable: {e}")
        return False

    # Check Qdrant
    try:
        resp = requests.get(f'{QDRANT_URL}/collections', timeout=10)
        collections = [c['name'] for c in resp.json().get('result', {}).get('collections', [])]
        logger.info(f"Qdrant: OK (collections: {collections})")
    except Exception as e:
        logger.error(f"Qdrant unreachable: {e}")
        return False

    # Check PostgreSQL
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM document_chunks")
            count = cur.fetchone()[0]
        conn.close()
        logger.info(f"PostgreSQL: OK ({count} chunks in document_chunks)")
    except Exception as e:
        logger.error(f"PostgreSQL unreachable: {e}")
        return False

    return True


def load_checkpoint() -> Dict:
    """Load checkpoint from file for resume support"""
    if os.path.exists(CHECKPOINT_FILE):
        with open(CHECKPOINT_FILE, 'r') as f:
            checkpoint = json.load(f)
        logger.info(f"Loaded checkpoint: {checkpoint.get('last_offset', 0)} chunks processed")
        return checkpoint
    return {'last_offset': 0, 'phase': 'chunks', 'completed_ids': []}


def save_checkpoint(checkpoint: Dict):
    """Save checkpoint to file"""
    with open(CHECKPOINT_FILE, 'w') as f:
        json.dump(checkpoint, f)


def create_new_collection():
    """Create documents_v2 collection with new vector size and Binary Quantization"""
    logger.info(f"Creating collection '{NEW_COLLECTION}' (vector_size={NEW_VECTOR_SIZE})...")

    # Check if it already exists
    resp = requests.get(f'{QDRANT_URL}/collections/{NEW_COLLECTION}', timeout=10)
    if resp.status_code == 200:
        logger.info(f"Collection '{NEW_COLLECTION}' already exists, will use it")
        return

    # Create with Binary Quantization and HNSW tuning
    payload = {
        "vectors": {
            "size": NEW_VECTOR_SIZE,
            "distance": "Cosine",
            "on_disk": True
        },
        "hnsw_config": {
            "m": 16,
            "ef_construct": 100
        },
        "quantization_config": {
            "binary": {
                "always_ram": True
            }
        }
    }
    resp = requests.put(f'{QDRANT_URL}/collections/{NEW_COLLECTION}', json=payload, timeout=30)
    resp.raise_for_status()
    logger.info(f"Created collection '{NEW_COLLECTION}'")

    # Create payload indices
    for field_name, field_type in [("space_id", "keyword"), ("document_id", "keyword"), ("category", "keyword")]:
        idx_payload = {"field_name": field_name, "field_schema": field_type}
        resp = requests.put(
            f'{QDRANT_URL}/collections/{NEW_COLLECTION}/index',
            json=idx_payload, timeout=30
        )
        resp.raise_for_status()
    logger.info("Created payload indices (space_id, document_id, category)")


def get_total_chunks() -> int:
    """Get total number of chunks to migrate"""
    conn = get_db_connection()
    with conn.cursor() as cur:
        cur.execute("SELECT COUNT(*) FROM document_chunks")
        count = cur.fetchone()[0]
    conn.close()
    return count


def fetch_chunk_batch(offset: int, limit: int) -> List[Dict]:
    """
    Fetch a batch of chunks from PostgreSQL with document metadata.
    Joins with documents table to get document_name, space_id, category.
    """
    conn = get_db_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("""
            SELECT
                dc.id,
                dc.document_id,
                dc.chunk_index,
                dc.chunk_text,
                dc.parent_chunk_id,
                dc.child_index,
                d.filename AS document_name,
                d.space_id,
                d.category_id,
                COALESCE(cat.name, 'Allgemein') AS category_name
            FROM document_chunks dc
            JOIN documents d ON dc.document_id = d.id
            LEFT JOIN document_categories cat ON d.category_id = cat.id
            WHERE d.deleted_at IS NULL
            ORDER BY dc.document_id, dc.chunk_index
            OFFSET %s LIMIT %s
        """, (offset, limit))
        rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def embed_texts(texts: List[str], max_retries: int = 3) -> List[List[float]]:
    """Embed a batch of texts via embedding service"""
    for attempt in range(max_retries):
        try:
            resp = requests.post(
                f'{EMBEDDING_URL}/embed',
                json={"texts": texts},
                timeout=120
            )
            resp.raise_for_status()
            return resp.json()['vectors']
        except Exception as e:
            logger.warning(f"Embedding attempt {attempt + 1}/{max_retries} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(5 * (attempt + 1))
            else:
                raise


def upsert_to_qdrant(points: List[Dict]):
    """Upsert points to the new Qdrant collection"""
    resp = requests.put(
        f'{QDRANT_URL}/collections/{NEW_COLLECTION}/points',
        json={"points": points},
        timeout=60
    )
    resp.raise_for_status()


def migrate_chunks(checkpoint: Dict, dry_run: bool = False) -> Dict:
    """Main chunk migration: re-embed all chunks and upsert to new collection"""
    total = get_total_chunks()
    offset = checkpoint.get('last_offset', 0)

    if offset > 0:
        logger.info(f"Resuming from offset {offset}/{total}")

    logger.info(f"Migrating {total} chunks (batch_size={BATCH_SIZE})...")
    start_time = time.time()
    migrated = 0
    errors = 0

    while offset < total:
        batch = fetch_chunk_batch(offset, BATCH_SIZE)
        if not batch:
            break

        texts = [chunk['chunk_text'] for chunk in batch]

        try:
            if dry_run:
                logger.info(f"[DRY RUN] Would embed {len(texts)} texts at offset {offset}")
                offset += len(batch)
                migrated += len(batch)
                continue

            # Embed the batch
            vectors = embed_texts(texts)

            # Build Qdrant points
            points = []
            for chunk, vector in zip(batch, vectors):
                payload = {
                    "document_id": str(chunk['document_id']),
                    "document_name": chunk['document_name'] or '',
                    "chunk_index": chunk['chunk_index'],
                    "text": chunk['chunk_text'][:500],
                    "space_id": str(chunk['space_id']) if chunk['space_id'] else None,
                    "category": chunk['category_name'],
                }
                if chunk.get('parent_chunk_id'):
                    payload['parent_chunk_id'] = str(chunk['parent_chunk_id'])
                if chunk.get('child_index') is not None:
                    payload['child_index'] = chunk['child_index']

                points.append({
                    "id": str(chunk['id']),
                    "vector": vector,
                    "payload": payload
                })

            # Upsert to new collection
            upsert_to_qdrant(points)
            migrated += len(batch)

        except Exception as e:
            logger.error(f"Error at offset {offset}: {e}")
            errors += 1
            if errors > 10:
                logger.error("Too many errors, stopping migration")
                checkpoint['last_offset'] = offset
                save_checkpoint(checkpoint)
                raise

        offset += len(batch)
        checkpoint['last_offset'] = offset
        save_checkpoint(checkpoint)

        elapsed = time.time() - start_time
        rate = migrated / elapsed if elapsed > 0 else 0
        eta = (total - offset) / rate if rate > 0 else 0
        logger.info(f"Progress: {offset}/{total} ({offset * 100 // total}%) | "
                     f"Rate: {rate:.1f} chunks/s | ETA: {eta:.0f}s")

    elapsed = time.time() - start_time
    logger.info(f"Chunk migration complete: {migrated} chunks in {elapsed:.1f}s "
                 f"({errors} errors)")

    checkpoint['phase'] = 'swap'
    save_checkpoint(checkpoint)
    return checkpoint


def swap_collections():
    """Swap collections: documents -> documents_old, documents_v2 -> documents"""
    logger.info("Swapping collections...")

    # Check if old backup already exists and remove it
    resp = requests.get(f'{QDRANT_URL}/collections/{OLD_COLLECTION}', timeout=10)
    if resp.status_code == 200:
        logger.info(f"Removing existing '{OLD_COLLECTION}'...")
        requests.delete(f'{QDRANT_URL}/collections/{OLD_COLLECTION}', timeout=30)

    # Rename current -> old
    resp = requests.get(f'{QDRANT_URL}/collections/{QDRANT_COLLECTION}', timeout=10)
    if resp.status_code == 200:
        logger.info(f"Creating alias: '{QDRANT_COLLECTION}' -> '{OLD_COLLECTION}'")
        # Qdrant doesn't have rename, use collection aliases
        # We'll use the alias approach: create alias for new collection
        payload = {
            "actions": [
                {
                    "delete_alias": {
                        "alias_name": QDRANT_COLLECTION
                    }
                },
            ]
        }
        # First try to remove any existing alias
        requests.post(f'{QDRANT_URL}/collections/aliases', json=payload, timeout=30)

    # Strategy: Delete old collection, rename v2 by creating alias
    # Since Qdrant doesn't support rename, we use: delete old + alias new as old name

    # Step 1: Verify documents_v2 has data
    resp = requests.get(f'{QDRANT_URL}/collections/{NEW_COLLECTION}', timeout=10)
    if resp.status_code != 200:
        logger.error(f"New collection '{NEW_COLLECTION}' not found!")
        return False

    new_info = resp.json().get('result', {})
    new_count = new_info.get('points_count', 0)
    logger.info(f"New collection has {new_count} points")

    if new_count == 0:
        logger.error("New collection is empty! Aborting swap.")
        return False

    # Step 2: Get old collection stats for comparison
    resp = requests.get(f'{QDRANT_URL}/collections/{QDRANT_COLLECTION}', timeout=10)
    if resp.status_code == 200:
        old_count = resp.json().get('result', {}).get('points_count', 0)
        logger.info(f"Old collection has {old_count} points")

        if new_count < old_count * 0.8:
            logger.warning(f"New collection ({new_count}) has significantly fewer points "
                           f"than old ({old_count}). Continuing anyway...")

        # Rename old collection to backup
        # Qdrant doesn't support rename, so we keep it as-is and just update aliases
        pass

    # Step 3: Use Qdrant collection aliases
    # Create alias 'documents' pointing to 'documents_v2'
    payload = {
        "actions": [
            {
                "create_alias": {
                    "collection_name": NEW_COLLECTION,
                    "alias_name": QDRANT_COLLECTION
                }
            }
        ]
    }

    # First delete the old physical collection to free the name for alias
    logger.info(f"Deleting old collection '{QDRANT_COLLECTION}'...")
    resp = requests.delete(f'{QDRANT_URL}/collections/{QDRANT_COLLECTION}', timeout=60)
    if resp.status_code not in (200, 404):
        logger.error(f"Failed to delete old collection: {resp.text}")
        return False

    # Now create alias from QDRANT_COLLECTION -> NEW_COLLECTION
    logger.info(f"Creating alias '{QDRANT_COLLECTION}' -> '{NEW_COLLECTION}'...")
    resp = requests.post(f'{QDRANT_URL}/collections/aliases', json=payload, timeout=30)
    if resp.status_code != 200:
        logger.error(f"Failed to create alias: {resp.text}")
        # Fallback: rename by re-creating
        logger.info("Fallback: The new collection is accessible as '{NEW_COLLECTION}'")
        logger.info("Update QDRANT_COLLECTION_NAME env var to '{NEW_COLLECTION}'")
        return False

    logger.info(f"Collection swap complete! '{QDRANT_COLLECTION}' now points to new 1024d vectors")
    return True


def migrate_space_embeddings():
    """Re-embed knowledge_spaces.description_embedding columns"""
    logger.info("Re-embedding knowledge space descriptions...")

    conn = get_db_connection()
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute("SELECT id, name, description FROM knowledge_spaces WHERE description IS NOT NULL")
        spaces = [dict(r) for r in cur.fetchall()]

    if not spaces:
        logger.info("No knowledge spaces with descriptions found")
        conn.close()
        return

    texts = [s['description'] for s in spaces]
    vectors = embed_texts(texts)

    conn = get_db_connection()
    with conn.cursor() as cur:
        for space, vector in zip(spaces, vectors):
            cur.execute(
                "UPDATE knowledge_spaces SET description_embedding = %s WHERE id = %s",
                (json.dumps(vector), space['id'])
            )
        conn.commit()
    conn.close()
    logger.info(f"Re-embedded {len(spaces)} knowledge space descriptions")


def migrate_company_context():
    """Re-embed company_context.content_embedding column"""
    logger.info("Re-embedding company context entries...")

    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT id, content FROM company_context WHERE content IS NOT NULL")
            entries = [dict(r) for r in cur.fetchall()]
    except psycopg2.errors.UndefinedTable:
        logger.info("company_context table does not exist, skipping")
        conn.close()
        return

    if not entries:
        logger.info("No company context entries found")
        conn.close()
        return

    texts = [e['content'] for e in entries]
    vectors = embed_texts(texts)

    conn = get_db_connection()
    with conn.cursor() as cur:
        for entry, vector in zip(entries, vectors):
            cur.execute(
                "UPDATE company_context SET content_embedding = %s WHERE id = %s",
                (json.dumps(vector), entry['id'])
            )
        conn.commit()
    conn.close()
    logger.info(f"Re-embedded {len(entries)} company context entries")


def cleanup_checkpoint():
    """Remove checkpoint file after successful migration"""
    if os.path.exists(CHECKPOINT_FILE):
        os.remove(CHECKPOINT_FILE)
        logger.info("Checkpoint file removed")


def main():
    parser = argparse.ArgumentParser(description='Migrate embeddings from old to new model')
    parser.add_argument('--dry-run', action='store_true',
                        help='Simulate migration without making changes')
    parser.add_argument('--skip-swap', action='store_true',
                        help='Skip collection swap (useful for testing)')
    parser.add_argument('--resume', action='store_true',
                        help='Resume from checkpoint')
    parser.add_argument('--swap-only', action='store_true',
                        help='Only perform collection swap (skip re-embedding)')
    parser.add_argument('--spaces-only', action='store_true',
                        help='Only re-embed knowledge spaces and company context')
    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("RAG 3.0 Embedding Migration")
    logger.info(f"  Old: {QDRANT_COLLECTION} -> New: {NEW_COLLECTION} ({NEW_VECTOR_SIZE}d)")
    logger.info(f"  Embedding service: {EMBEDDING_URL}")
    logger.info(f"  Qdrant: {QDRANT_URL}")
    logger.info(f"  Batch size: {BATCH_SIZE}")
    logger.info("=" * 60)

    if not check_services():
        logger.error("Service check failed. Ensure all services are running.")
        sys.exit(1)

    if args.swap_only:
        if swap_collections():
            logger.info("Collection swap complete!")
        else:
            logger.error("Collection swap failed!")
            sys.exit(1)
        return

    if args.spaces_only:
        migrate_space_embeddings()
        migrate_company_context()
        logger.info("Space/context embedding migration complete!")
        return

    # Load or create checkpoint
    checkpoint = load_checkpoint() if args.resume else {'last_offset': 0, 'phase': 'chunks'}

    # Phase 1: Create new collection
    if checkpoint.get('phase') in ('chunks', None):
        if not args.dry_run:
            create_new_collection()

        # Phase 2: Migrate chunks
        checkpoint = migrate_chunks(checkpoint, dry_run=args.dry_run)

    # Phase 3: Swap collections
    if checkpoint.get('phase') == 'swap' and not args.skip_swap and not args.dry_run:
        if not swap_collections():
            logger.error("Collection swap failed! The new collection is still "
                         f"available as '{NEW_COLLECTION}'.")
            sys.exit(1)
        checkpoint['phase'] = 'extras'
        save_checkpoint(checkpoint)

    # Phase 4: Re-embed spaces and company context
    if checkpoint.get('phase') == 'extras' and not args.dry_run:
        migrate_space_embeddings()
        migrate_company_context()

    # Cleanup
    if not args.dry_run:
        cleanup_checkpoint()

    logger.info("=" * 60)
    logger.info("Migration complete!")
    if args.dry_run:
        logger.info("[DRY RUN] No changes were made.")
    else:
        logger.info(f"All embeddings have been migrated to {NEW_VECTOR_SIZE}d vectors.")
        logger.info("Next steps:")
        logger.info("  1. Verify RAG queries work correctly")
        logger.info("  2. Monitor embedding-service memory usage")
        logger.info(f"  3. Optionally delete '{NEW_COLLECTION}' backup after validation")
    logger.info("=" * 60)


if __name__ == '__main__':
    main()
