-- 008_llm_queue_schema.sql
-- Queue-System für LLM-Jobs
-- Ermöglicht sequentielle Verarbeitung von Anfragen

-- Queue-Spalten für llm_jobs
ALTER TABLE llm_jobs ADD COLUMN IF NOT EXISTS queue_position INTEGER;
ALTER TABLE llm_jobs ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE llm_jobs ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- Index für effiziente Queue-Abfragen
CREATE INDEX IF NOT EXISTS idx_llm_jobs_queue
    ON llm_jobs(queue_position ASC NULLS LAST)
    WHERE status = 'pending';

-- Funktion: Nächste Queue-Position holen
CREATE OR REPLACE FUNCTION get_next_queue_position()
RETURNS INTEGER AS $$
DECLARE
    next_pos INTEGER;
BEGIN
    SELECT COALESCE(MAX(queue_position), 0) + 1 INTO next_pos
    FROM llm_jobs
    WHERE status IN ('pending', 'streaming');
    RETURN next_pos;
END;
$$ LANGUAGE plpgsql;

-- sources Spalte für chat_messages (für RAG-Quellen)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sources JSONB DEFAULT NULL;
