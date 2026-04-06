-- Index tracking fields for periodic re-indexing of datentabellen in Qdrant
ALTER TABLE dt_tables ADD COLUMN IF NOT EXISTS needs_reindex BOOLEAN DEFAULT FALSE;
ALTER TABLE dt_tables ADD COLUMN IF NOT EXISTS last_indexed_at TIMESTAMPTZ;
ALTER TABLE dt_tables ADD COLUMN IF NOT EXISTS index_row_count INTEGER DEFAULT 0;
