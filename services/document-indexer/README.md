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

| Format   | Extension            | Parser                        |
| -------- | -------------------- | ----------------------------- |
| PDF      | .pdf                 | PyMuPDF (+ OCR-Fallback)      |
| Word     | .docx                | python-docx                   |
| Text     | .txt, .log           | Native                        |
| Markdown | .md, .markdown       | Native (Struktur bleibt)      |
| HTML/XML | .html, .htm, .xml    | stdlib HTMLParser (Tag-Strip) |
| Daten    | .csv, .json          | Native (Klartext)             |
| YAML     | .yaml, .yml          | PyYAML (Tabellen-Format)      |
| Bilder   | .png .jpg .tiff .bmp | OCR                           |

Die Liste ist deckungsgleich mit der `INDEXIERBAR`-Whitelist des
Ordner-Syncs (`apps/dashboard-backend/src/services/projects/ordnerSyncService.js`) —
eine dort indexierbare Endung MUSS hier einen Parser haben, sonst bleibt
das Dokument dauerhaft `pending` („wird indexiert" im Explorer).

## Indexing Pipeline

1. **Scan**: Check MinIO bucket for new/updated documents
2. **Parse**: Extract text content from document
3. **Chunk**: Split text into 500-character chunks with 50-char overlap
4. **Embed**: Generate vector embeddings via Embedding Service
5. **Store**: Save chunks to the PostgreSQL text layer with metadata
6. **Track**: Update document status in PostgreSQL

## API Endpoints

| Method | Path           | Description                                                                                              |
| ------ | -------------- | -------------------------------------------------------------------------------------------------------- |
| GET    | `/health`      | Health check                                                                                             |
| GET    | `/status`      | Indexing status                                                                                          |
| POST   | `/reindex`     | Force reindex of all documents                                                                           |
| GET    | `/documents`   | List indexed documents                                                                                   |
| POST   | `/gpu/vorrang` | Das Backend meldet, dass es die GPU fuer einen Nutzerlauf haelt. Body `{"sekunden": 30}`, Null gibt frei |
| GET    | `/gpu/vorrang` | Was der Indexer gerade glaubt. Fuer die Abnahme und die Fehlersuche                                      |

### Warum es `/gpu/vorrang` gibt

Das Geraet hat **eine** GPU. Das Backend serialisiert seine eigenen Aufrufe
ueber `services/flows/gpuQueue.js`, aber der Indexer ist ein eigener Prozess in
einem eigenen Container und ruft Ollama direkt auf. Er kann diese Sperre nicht
nehmen.

Am 22.08.2026 auf dem Orin gemessen, was das kostet: der Indexer laedt zum
Anreichern `qwen3:14b` (14 GB), der Chat rechnet mit dem 27B-Modell (22 GB),
zusammen passen sie nicht in das Budget. In `llm_model_switches` stehen fuer
vierzig Minuten 35 Zeilen `auto_unload_ollama_keepalive` im Wechsel und neun
Ladevorgaenge zwischen 11 827 und 60 066 Millisekunden. Der Nutzer wartet also
bei fast jeder Chat-Runde eine halbe bis eine ganze Minute auf ein Modell, das
kurz zuvor schon im Speicher war.

Gemeldet wird eine **Frist**, kein Schalter: faellt das Backend aus, laeuft sie
ab und der Indexer arbeitet von selbst weiter. Zurueckgehalten wird nur der
START eines Modellaufrufs; ein laufender wird nicht abgebrochen, weil das
Modell ohnehin zu Ende rechnet und ein halbes Ergebnis schlechter waere als gar
keins.

Bewusst ohne Anmeldung: der Dienst hat keinen veroeffentlichten Port und ist
nur im internen Docker-Netz erreichbar. Der einzige Schaden, den ein Aufruf
anrichten koennte, ist eine Anreicherung, die hoechstens
`GPU_VORRANG_HOECHSTFRIST_S` Sekunden spaeter laeuft.

## Environment Variables

| Variable                       | Default           | Description                                                        |
| ------------------------------ | ----------------- | ------------------------------------------------------------------ |
| DOCUMENT_INDEXER_INTERVAL      | 30                | Scan interval (seconds)                                            |
| DOCUMENT_INDEXER_CHUNK_SIZE    | 500               | Chunk size (characters)                                            |
| DOCUMENT_INDEXER_CHUNK_OVERLAP | 50                | Overlap (characters)                                               |
| DOCUMENT_INDEXER_MINIO_BUCKET  | documents         | MinIO bucket name                                                  |
| MINIO_HOST                     | minio             | MinIO hostname                                                     |
| MINIO_PORT                     | 9000              | MinIO port                                                         |
| MINIO_ROOT_USER                | (required)        | MinIO access key                                                   |
| MINIO_ROOT_PASSWORD            | (required)        | MinIO secret key                                                   |
| EMBEDDING_SERVICE_HOST         | embedding-service | Embedding service host                                             |
| EMBEDDING_SERVICE_PORT         | 11435             | Embedding service port                                             |
| EMBEDDING_VECTOR_SIZE          | 768               | Vector dimension                                                   |
| POSTGRES_HOST                  | postgres-db       | Database host                                                      |
| POSTGRES_PORT                  | 5432              | Database port                                                      |
| POSTGRES_USER                  | arasul            | Database user                                                      |
| POSTGRES_DB                    | arasul_db         | Database name                                                      |
| GPU_VORRANG_HOECHSTFRIST_S     | 120               | Laenger haelt sich der Indexer nie zurueck, egal was gemeldet wird |

## Chunking Strategy

```python
# Default configuration
CHUNK_SIZE = 500      # characters
CHUNK_OVERLAP = 50    # characters

# Chunks preserve sentence boundaries where possible
# Overlap ensures context continuity between chunks
```

## Vector Metadata

Each chunk stored in the text layer includes:

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
  Flows und Indexer teilen.
