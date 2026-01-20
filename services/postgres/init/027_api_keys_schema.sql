-- API Keys for external app access (n8n, workflows, etc.)
-- Provides API key authentication for LLM queue access

CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    key_hash VARCHAR(128) NOT NULL,  -- bcrypt hash of the API key
    key_prefix VARCHAR(8) NOT NULL,   -- First 8 chars for identification (e.g., "aras_abc")
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_by INTEGER REFERENCES admin_users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    rate_limit_per_minute INTEGER DEFAULT 60,
    allowed_endpoints TEXT[] DEFAULT ARRAY['llm:chat', 'llm:status'],
    metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

-- API key usage tracking
CREATE TABLE IF NOT EXISTS api_key_usage (
    id SERIAL PRIMARY KEY,
    api_key_id INTEGER REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER,
    response_time_ms INTEGER,
    request_ip VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_key_id ON api_key_usage(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_created ON api_key_usage(created_at);

-- Function to validate and log API key usage
CREATE OR REPLACE FUNCTION log_api_key_usage(
    p_key_prefix VARCHAR(8),
    p_endpoint VARCHAR(255),
    p_method VARCHAR(10),
    p_status_code INTEGER,
    p_response_time_ms INTEGER,
    p_request_ip VARCHAR(45),
    p_user_agent TEXT
) RETURNS VOID AS $$
DECLARE
    v_key_id INTEGER;
BEGIN
    -- Get key ID and update last_used_at
    UPDATE api_keys
    SET last_used_at = NOW()
    WHERE key_prefix = p_key_prefix AND is_active = true
    RETURNING id INTO v_key_id;

    -- Log usage if key exists
    IF v_key_id IS NOT NULL THEN
        INSERT INTO api_key_usage (api_key_id, endpoint, method, status_code, response_time_ms, request_ip, user_agent)
        VALUES (v_key_id, p_endpoint, p_method, p_status_code, p_response_time_ms, p_request_ip, p_user_agent);
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE api_keys IS 'API keys for external app access (n8n, automations, etc.)';
