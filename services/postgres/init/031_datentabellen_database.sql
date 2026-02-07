-- Migration 031: Datentabellen Configuration
-- Reference table for the separate user data database
-- Part of the Dynamic Database Builder feature

-- Configuration table for the data database connection
CREATE TABLE IF NOT EXISTS datentabellen_config (
    id SERIAL PRIMARY KEY,
    data_db_host VARCHAR(255) DEFAULT 'postgres-db',
    data_db_port INTEGER DEFAULT 5432,
    data_db_name VARCHAR(100) DEFAULT 'arasul_data_db',
    data_db_user VARCHAR(100) DEFAULT 'arasul_data',
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default configuration
INSERT INTO datentabellen_config (data_db_host, data_db_port, data_db_name, data_db_user, is_enabled)
VALUES ('postgres-db', 5432, 'arasul_data_db', 'arasul_data', true)
ON CONFLICT DO NOTHING;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_datentabellen_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_datentabellen_config_updated_at ON datentabellen_config;
CREATE TRIGGER trigger_datentabellen_config_updated_at
    BEFORE UPDATE ON datentabellen_config
    FOR EACH ROW
    EXECUTE FUNCTION update_datentabellen_config_updated_at();

-- Comment on table
COMMENT ON TABLE datentabellen_config IS
    'Configuration for the separate arasul_data_db used by the Datentabellen feature';
