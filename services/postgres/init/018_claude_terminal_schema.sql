-- Claude Terminal Query History Schema
-- Migration: 015_claude_terminal_schema.sql
-- Purpose: Stores Claude Terminal queries for history and context

-- Claude Terminal Sessions
CREATE TABLE IF NOT EXISTS claude_terminal_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    session_context JSONB DEFAULT '{}'::jsonb
);

-- Claude Terminal Query History (max 100 per user, enforced by application)
CREATE TABLE IF NOT EXISTS claude_terminal_queries (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES claude_terminal_sessions(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    response TEXT,
    injected_context JSONB,
    model_used VARCHAR(100),
    tokens_used INTEGER,
    response_time_ms INTEGER,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'streaming', 'completed', 'error', 'timeout')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_claude_terminal_queries_user_id ON claude_terminal_queries(user_id);
CREATE INDEX IF NOT EXISTS idx_claude_terminal_queries_session_id ON claude_terminal_queries(session_id);
CREATE INDEX IF NOT EXISTS idx_claude_terminal_queries_created_at ON claude_terminal_queries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_claude_terminal_queries_status ON claude_terminal_queries(status);
CREATE INDEX IF NOT EXISTS idx_claude_terminal_sessions_user_id ON claude_terminal_sessions(user_id);

-- Function to enforce max 100 queries per user
CREATE OR REPLACE FUNCTION enforce_claude_terminal_query_limit()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete oldest queries beyond limit (keep last 100)
    DELETE FROM claude_terminal_queries
    WHERE id IN (
        SELECT id FROM claude_terminal_queries
        WHERE user_id = NEW.user_id
        ORDER BY created_at DESC
        OFFSET 100
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if not exists (drop first to make idempotent)
DROP TRIGGER IF EXISTS trg_enforce_claude_terminal_query_limit ON claude_terminal_queries;
CREATE TRIGGER trg_enforce_claude_terminal_query_limit
    AFTER INSERT ON claude_terminal_queries
    FOR EACH ROW
    EXECUTE FUNCTION enforce_claude_terminal_query_limit();

-- Comment on tables
COMMENT ON TABLE claude_terminal_sessions IS 'Claude Terminal user sessions for context persistence';
COMMENT ON TABLE claude_terminal_queries IS 'Claude Terminal query history (max 100 per user)';
