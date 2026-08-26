"""
Konfiguration des Document Indexers.

Seit Phase B4 (26.08.2026) braucht der Dienst nur noch eine Groessengrenze
fuer Uploads. Alles zu MinIO, Postgres, Embedding, Chunking und Zeittakt ist
mit dem Hintergrund-Indexer gefallen.
"""

import os

# Groessengrenze fuer Uploads, damit ein einzelnes Dokument den Prozess nicht
# aus dem Speicher draengt (Voreinstellung: 100 MB).
MAX_FILE_SIZE_MB = int(os.getenv('DOCUMENT_MAX_SIZE_MB', '100'))
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024
