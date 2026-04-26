# Frontend Document-Manager — Findings

## Uncommitted Change

- `DocumentManager.tsx`: Nur `Table` Icon-Import zugefügt — harmlos, committen.

## MAJORS

### DM-01: Kein TanStack Query im DocumentManager

- Nur `RagMetricsCard` nutzt TanStack (`useQuery(['rag-metrics', window])`)
- DocumentManager.tsx nutzt useState + Refs + manuelles Polling
- Bei parallelen Mounts: duplicate Requests
- Fix: Migration auf TanStack Query für /documents, /statistics, /spaces

### DM-02: Keine Real-Time-Updates — nur Polling

- Schnell-Poll 5s bei pending/processing, idle 30s
- Skaliert nicht für 1000+ Docs
- Keine WS/SSE-Integration
- Fix: SSE-Subscription für Indexing-Status-Changes

### DM-03: Kein Embedding-Service-Health-Indicator

- Wenn document-indexer (:9102) oder embedding-service (:11435) down → Fehler erst beim Upload/Search
- Kein UI-Warnbanner
- Fix: Health-Polling + Banner "Indexer offline"

### DM-04: Keine inline PDF-Vorschau

- Nur Download möglich
- `react-pdf` / `pdfjs-dist` könnte eingebaut werden
- Low-Prio, aber häufig gewünscht

### DM-05: Upload Queue-Limit hart

- `MAX_CONCURRENT = 3`, pro Datei 120s Timeout
- Bei 50MB-Limit: OK, bei späterer Erhöhung: Problem

## MINORS

### DM-06: Pre-Upload-Quota-Warnung fehlt

- Backend prüft `enforceQuota`, UI zeigt nichts proaktiv
- Fix: `GET /documents/quota` → Banner bei >80%

### DM-07: Batch-Reindex ohne exponential Backoff

- `retry_count` erhöht sich, aber kein Threshold / Alerting
- Fix: Nach N Fehlversuchen → permanent-failed + Admin-Notification

### DM-08: Space-Filter im Chat nicht exponiert

- Backend kann Space-Filter, Chat-UI nicht
- Fix: RAG-Space-Selector im Chat-Input bereits vorhanden (laut Chat-Analyse) — aber prüfen ob konsistent

### DM-09: Datentabellen-Suche nur Name-basiert

- Keine semantische Suche für Tables

## OK / FUNKTIONIERT

- Upload mit D&D, Multi-File, 3 parallel, Retry 1x, Progress
- Client-Validation: Extensions + 50MB + Magic-Bytes (Backend)
- Delete kaskadiert DB + MinIO + Qdrant (+ cleanup_pending Flag)
- Cleanup-Funktion für Orphans + 30d-Soft-Delete-Purge
- Adaptive Polling (5s/30s)
- Toast-Spam-Prevention via `prevStatusesRef`
- Spaces-Feature komplett (CRUD, Tabs, Move, Batch-Move)
- Favoriten, Filter, Sort, Pagination, Kategorien
- DocumentDetailsModal mit Similar-Docs, Key-Topics, Summary
- Soft-Delete statt Hard-Delete
