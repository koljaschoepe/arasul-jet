-- ============================================================================
-- Migration 047: Telegram Bot RAG Configuration
-- Adds RAG (Retrieval-Augmented Generation) fields to telegram_bots table
-- ============================================================================

-- Bot-level RAG configuration
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS rag_enabled BOOLEAN DEFAULT false;
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS rag_space_ids UUID[] DEFAULT NULL;
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS rag_show_sources BOOLEAN DEFAULT true;
ALTER TABLE telegram_bots ADD COLUMN IF NOT EXISTS rag_context_limit INTEGER DEFAULT 2000;

-- For Master Bot: rag_space_ids = NULL means "all spaces"
-- For Custom Bots: rag_space_ids = '{uuid1,uuid2}' = specific spaces

COMMENT ON COLUMN telegram_bots.rag_enabled IS 'Whether RAG (document-based answers) is enabled for this bot';
COMMENT ON COLUMN telegram_bots.rag_space_ids IS 'Array of space UUIDs to search. NULL = all spaces (Master Bot)';
COMMENT ON COLUMN telegram_bots.rag_show_sources IS 'Whether to show document sources after bot response';
COMMENT ON COLUMN telegram_bots.rag_context_limit IS 'Maximum characters of RAG context to inject into prompt';
