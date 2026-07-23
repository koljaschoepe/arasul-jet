# Document Indexer

Automatic document indexing service for RAG (Retrieval Augmented Generation).

## Overview

| Property      | Value           |
| ------------- | --------------- |
| Port          | 8080 (internal) |
| Framework     | Flask           |
| Runtime       | Python 3.10+    |
| Scan Interval | 30 seconds      |

## Architecture

```
MinIO (documents bucket)
         │
         ▼
  ┌──────────────┐
  │   Indexer    │ ── Scans for new documents
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │   Parsers    │ ── PDF, DOCX, TXT, Markdown
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │   Chunker    │ ── 500 chars, 50 overlap
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │  Embedding   │ ── Via Embedding Service
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │   Qdrant     │ ── Vector storage
  └──────────────┘
```

## Directory Structure

```
document-indexer/
├── indexer.py            # Main indexing loop
├── enhanced_indexer.py   # Advanced indexing with status tracking
├── document_parsers.py   # PDF, DOCX, TXT, Markdown parsers
├── text_chunker.py       # Document chunking logic
├── metadata_extractor.py # Document metadata extraction
├── ai_services.py        # Embedding service client
├── database.py           # PostgreSQL integration
├── api_server.py         # Flask HTTP API
├── requirements.txt      # Python dependencies
└── Dockerfile           # Container definition
```

## Supported Formats

| Format   | Extension | Parser      |
| -------- | --------- | ----------- |
| PDF      | .pdf      | PyPDF2      |
| Word     | .docx     | python-docx |
| Text     | .txt      | Native      |
| Markdown | .md       | markdown    |

## Indexing Pipeline

1. **Scan**: Check MinIO bucket for new/updated documents
2. **Parse**: Extract text content from document
3. **Chunk**: Split text into 500-character chunks with 50-char overlap
4. **Embed**: Generate vector embeddings via Embedding Service
5. **Store**: Save vectors to Qdrant with metadata
6. **Track**: Update document status in PostgreSQL

## API Endpoints

| Method | Path         | Description                    |
| ------ | ------------ | ------------------------------ |
| GET    | `/health`    | Health check                   |
| GET    | `/status`    | Indexing status                |
| POST   | `/reindex`   | Force reindex of all documents |
| GET    | `/documents` | List indexed documents         |

## Environment Variables

| Variable                       | Default           | Description             |
| ------------------------------ | ----------------- | ----------------------- |
| DOCUMENT_INDEXER_INTERVAL      | 30                | Scan interval (seconds) |
| DOCUMENT_INDEXER_CHUNK_SIZE    | 500               | Chunk size (characters) |
| DOCUMENT_INDEXER_CHUNK_OVERLAP | 50                | Overlap (characters)    |
| DOCUMENT_INDEXER_MINIO_BUCKET  | documents         | MinIO bucket name       |
| MINIO_HOST                     | minio             | MinIO hostname          |
| MINIO_PORT                     | 9000              | MinIO port              |
| MINIO_ROOT_USER                | (required)        | MinIO access key        |
| MINIO_ROOT_PASSWORD            | (required)        | MinIO secret key        |
| EMBEDDING_SERVICE_HOST         | embedding-service | Embedding service host  |
| EMBEDDING_SERVICE_PORT         | 11435             | Embedding service port  |
| QDRANT_HOST                    | qdrant            | Qdrant hostname         |
| QDRANT_PORT                    | 6333              | Qdrant HTTP port        |
| QDRANT_COLLECTION_NAME         | documents         | Collection name         |
| EMBEDDING_VECTOR_SIZE          | 768               | Vector dimension        |
| POSTGRES_HOST                  | postgres-db       | Database host           |
| POSTGRES_PORT                  | 5432              | Database port           |
| POSTGRES_USER                  | arasul            | Database user           |
| POSTGRES_DB                    | arasul_db         | Database name           |

## Chunking Strategy

```python
# Default configuration
CHUNK_SIZE = 500      # characters
CHUNK_OVERLAP = 50    # characters

# Chunks preserve sentence boundaries where possible
# Overlap ensures context continuity between chunks
```

## Vector Metadata

Each vector stored in Qdrant includes:

```json
{
  "document_id": "uuid",
  "document_name": "filename.pdf",
  "chunk_index": 0,
  "chunk_text": "The actual text content...",
  "total_chunks": 10,
  "created_at": "2024-01-15T10:30:00Z"
}
```

## Dependencies

- minio (7.2.5) - MinIO S3 client
- qdrant-client (1.7.3) - Vector database client
- PyPDF2 (3.0.1) - PDF parsing
- python-docx (1.1.0) - DOCX parsing
- markdown (3.5.2) - Markdown parsing
- flask (3.0.0) - HTTP server
- requests (2.31.0) - HTTP client
- psycopg2-binary (2.9.9) - PostgreSQL client
- python-dotenv (1.0.0) - Environment configuration

## Health Check

The service exposes a health endpoint used by Docker:

```bash
curl http://localhost:8080/health
```

Returns `200 OK` when service is healthy.

## Related Documentation

- [RAG System](../../CLAUDE.md#rag-system-retrieval-augmented-generation) - RAG overview
- [Embedding Service](../embedding-service/README.md) - Vector generation

## Robuste Neuindexierung (Plan 012 Phase F)

- **Keine Zombie-Chunks.** Die Qdrant-Point-IDs sind deterministisch
  (`md5(doc_id:global_index)`). Ein Re-Index überschrieb bisher nur `0..N-1`
  und ließ `N..M` einer früheren, längeren Fassung stehen — gelöschter Text
  blieb durchsuchbar. `_index_to_qdrant` löscht jetzt vor dem Upsert alle
  Vektoren des Dokuments (`delete_document_vectors`), und zwar erst, nachdem
  die 0-Chunk-Fälle abgefangen sind: ein Parser-Aussetzer darf ein gut
  indexiertes Dokument nicht stillschweigend aus der Suche entfernen.
  Regressionstest: `tests/test_zombie_chunks.py`.
- **Content-Hash-Gate.** `run_indexing_pipeline(..., skip_if_unchanged=True)`
  überspringt ein Dokument, das mit exakt diesem `content_hash` bereits
  **vollständig** (`status='indexed'`, `chunk_count>0`) indexiert ist.
  Default ist `False`, damit ein ausdrücklich angestoßener `/reindex` immer
  neu baut. `partial` zählt nie als vollständig.
- **Payload-Indizes idempotent.** `space_id`, `document_id` und `category`
  werden bei **jedem** Start sichergestellt, nicht nur bei Neuanlage der
  Collection — sonst bliebe eine ältere Collection dauerhaft ohne sie und der
  ordner-optimierte Scope-Filter scannt linear. Ein fehlgeschlagener Index
  bricht den Start nicht ab (langsamer, aber korrekt).
- **`partial` ist kein Endzustand mehr.** Der Watchdog nimmt unvollständig
  indexierte Dokumente hart gedeckelt wieder auf
  (`PARTIAL_REPICKUP_INTERVAL_SECONDS`, `PARTIAL_REPICKUP_MAX_ATTEMPTS`,
  `PARTIAL_REPICKUP_BATCH`). Die Deckelung ist der Punkt: ohne sie würde ein
  dauerhaft unvollständiges Dokument die Embedding-GPU belegen, die sich Chat,
  Skills und Indexer teilen.
