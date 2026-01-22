-- ============================================================================
-- Migration 010: Performance Indexes
-- Created: 2026-01-04
-- Purpose: Add missing indexes for common query patterns
-- Expected improvement: 10-100x faster queries on documents, chats, metrics
-- ============================================================================

-- ============================================================================
-- DOCUMENTS TABLE INDEXES
-- ============================================================================

-- Index for filtering by category + sorting by upload date (most common query)
-- Used by: GET /api/documents?category_id=X&order_by=uploaded_at
CREATE INDEX IF NOT EXISTS idx_documents_category_uploaded
    ON documents(category_id, uploaded_at DESC)
    WHERE deleted_at IS NULL;

-- Index for filename/title search (replaces slow ILIKE scans)
-- Used by: GET /api/documents?search=X
CREATE INDEX IF NOT EXISTS idx_documents_search_gin
    ON documents
    USING GIN(to_tsvector('german', COALESCE(filename, '') || ' ' || COALESCE(title, '')))
    WHERE deleted_at IS NULL;

-- Index for status filtering
-- Used by: Document indexer status queries
CREATE INDEX IF NOT EXISTS idx_documents_status
    ON documents(status)
    WHERE deleted_at IS NULL;

-- Index for content hash lookups (duplicate detection)
-- Used by: POST /api/documents/upload duplicate check
CREATE INDEX IF NOT EXISTS idx_documents_content_hash
    ON documents(content_hash)
    WHERE deleted_at IS NULL;

-- ============================================================================
-- CHAT MESSAGES TABLE INDEXES
-- ============================================================================

-- Composite index for loading messages by conversation (critical for chat performance)
-- Used by: GET /api/chats/:id/messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
    ON chat_messages(conversation_id, created_at ASC);

-- Index for job_id lookups
-- Used by: LLM job status updates
CREATE INDEX IF NOT EXISTS idx_chat_messages_job_id
    ON chat_messages(job_id)
    WHERE job_id IS NOT NULL;

-- ============================================================================
-- CHAT CONVERSATIONS TABLE INDEXES
-- ============================================================================

-- Index for listing active conversations sorted by update time
-- Used by: GET /api/chats
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated
    ON chat_conversations(updated_at DESC)
    WHERE deleted_at IS NULL;

-- ============================================================================
-- LLM JOBS TABLE INDEXES
-- ============================================================================

-- Composite index for active job queries
-- Used by: Queue management, streaming status checks
CREATE INDEX IF NOT EXISTS idx_llm_jobs_conversation_status
    ON llm_jobs(conversation_id, status)
    WHERE status IN ('pending', 'queued', 'streaming');

-- Index for queue ordering
-- Used by: LLM queue service
CREATE INDEX IF NOT EXISTS idx_llm_jobs_queue_position
    ON llm_jobs(queue_position ASC)
    WHERE status IN ('pending', 'queued');

-- Index for cleanup queries
-- Used by: cleanup_old_llm_jobs() function
CREATE INDEX IF NOT EXISTS idx_llm_jobs_completed_at
    ON llm_jobs(completed_at)
    WHERE status IN ('completed', 'error', 'cancelled');

-- ============================================================================
-- LOGIN ATTEMPTS TABLE INDEXES (Security)
-- ============================================================================

-- Index for brute force detection by username
-- Used by: is_user_locked() function
CREATE INDEX IF NOT EXISTS idx_login_attempts_username_time
    ON login_attempts(username, attempted_at DESC);

-- Index for IP-based rate limiting
-- Used by: Distributed attack prevention
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
    ON login_attempts(ip_address, attempted_at DESC);

-- ============================================================================
-- METRICS TABLES INDEXES
-- ============================================================================

-- Index for recent metrics queries (dashboard live data)
-- Used by: GET /api/metrics/live, /api/metrics/history
CREATE INDEX IF NOT EXISTS idx_metrics_cpu_recent
    ON metrics_cpu(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_ram_recent
    ON metrics_ram(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_gpu_recent
    ON metrics_gpu(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_temperature_recent
    ON metrics_temperature(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_disk_recent
    ON metrics_disk(timestamp DESC);

-- ============================================================================
-- DOCUMENT CHUNKS TABLE INDEXES
-- ============================================================================

-- Index for chunk lookups by document
-- Used by: RAG queries, document detail views
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
    ON document_chunks(document_id);

-- Index for chunk ordering
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_index
    ON document_chunks(document_id, chunk_index ASC);

-- ============================================================================
-- SELF HEALING EVENTS TABLE INDEXES
-- ============================================================================

-- Index for recent events query
-- Used by: Dashboard self-healing status
CREATE INDEX IF NOT EXISTS idx_self_healing_events_timestamp
    ON self_healing_events(timestamp DESC);

-- Index for severity filtering
CREATE INDEX IF NOT EXISTS idx_self_healing_events_severity
    ON self_healing_events(severity, timestamp DESC);

-- ============================================================================
-- DOCUMENT CATEGORIES TABLE INDEXES
-- ============================================================================

-- Index for category listing (sorted by name)
CREATE INDEX IF NOT EXISTS idx_document_categories_name
    ON document_categories(name ASC);

-- ============================================================================
-- Analyze tables to update statistics for query planner
-- ============================================================================

ANALYZE documents;
ANALYZE chat_messages;
ANALYZE chat_conversations;
ANALYZE llm_jobs;
ANALYZE login_attempts;
ANALYZE metrics_cpu;
ANALYZE metrics_ram;
ANALYZE metrics_gpu;
ANALYZE metrics_temperature;
ANALYZE metrics_disk;
ANALYZE document_chunks;
ANALYZE self_healing_events;
ANALYZE document_categories;

-- ============================================================================
-- Log completion
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE 'Migration 010: Performance indexes created successfully';
END $$;
