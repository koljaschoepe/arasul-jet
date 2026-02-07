-- Meta-Schema for Dynamic Tables (Datentabellen)
-- This schema stores table definitions and field metadata
-- for user-created tables in arasul_data_db

-- Ensure extension for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function for updated_at trigger (used by all tables)
CREATE OR REPLACE FUNCTION update_dt_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Table definitions (meta-data about user tables)
CREATE TABLE IF NOT EXISTS dt_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50) DEFAULT '📦',
    color VARCHAR(7) DEFAULT '#45ADFF',
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),

    CONSTRAINT valid_slug CHECK (slug ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT valid_color CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
);

-- Field definitions (columns for user tables)
CREATE TABLE IF NOT EXISTS dt_fields (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES dt_tables(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    field_type VARCHAR(50) NOT NULL,
    field_order INTEGER NOT NULL DEFAULT 0,
    is_required BOOLEAN DEFAULT FALSE,
    is_unique BOOLEAN DEFAULT FALSE,
    is_primary_display BOOLEAN DEFAULT FALSE,
    default_value JSONB,
    options JSONB DEFAULT '{}'::jsonb,
    validation JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(table_id, slug),
    CONSTRAINT valid_field_slug CHECK (slug ~ '^[a-z][a-z0-9_]*$'),
    CONSTRAINT valid_field_type CHECK (field_type IN (
        'text', 'textarea', 'number', 'currency', 'date', 'datetime',
        'select', 'multiselect', 'checkbox', 'relation',
        'file', 'image', 'email', 'url', 'phone', 'formula'
    ))
);

-- Relations between tables
CREATE TABLE IF NOT EXISTS dt_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_table_id UUID NOT NULL REFERENCES dt_tables(id) ON DELETE CASCADE,
    source_field_id UUID NOT NULL REFERENCES dt_fields(id) ON DELETE CASCADE,
    target_table_id UUID NOT NULL REFERENCES dt_tables(id) ON DELETE CASCADE,
    relation_type VARCHAR(20) NOT NULL,
    back_reference_name VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_relation_type CHECK (relation_type IN ('one_to_one', 'one_to_many', 'many_to_many'))
);

-- Views/Filters for tables (saved filter configurations)
CREATE TABLE IF NOT EXISTS dt_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES dt_tables(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    filters JSONB DEFAULT '[]'::jsonb,
    sort JSONB DEFAULT '[]'::jsonb,
    visible_fields JSONB DEFAULT '[]'::jsonb,
    group_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_dt_fields_table ON dt_fields(table_id);
CREATE INDEX IF NOT EXISTS idx_dt_fields_order ON dt_fields(table_id, field_order);
CREATE INDEX IF NOT EXISTS idx_dt_relations_source ON dt_relations(source_table_id);
CREATE INDEX IF NOT EXISTS idx_dt_relations_target ON dt_relations(target_table_id);
CREATE INDEX IF NOT EXISTS idx_dt_views_table ON dt_views(table_id);
CREATE INDEX IF NOT EXISTS idx_dt_tables_slug ON dt_tables(slug);

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trigger_dt_tables_updated_at ON dt_tables;
CREATE TRIGGER trigger_dt_tables_updated_at
    BEFORE UPDATE ON dt_tables
    FOR EACH ROW
    EXECUTE FUNCTION update_dt_updated_at();

DROP TRIGGER IF EXISTS trigger_dt_fields_updated_at ON dt_fields;
CREATE TRIGGER trigger_dt_fields_updated_at
    BEFORE UPDATE ON dt_fields
    FOR EACH ROW
    EXECUTE FUNCTION update_dt_updated_at();

DROP TRIGGER IF EXISTS trigger_dt_views_updated_at ON dt_views;
CREATE TRIGGER trigger_dt_views_updated_at
    BEFORE UPDATE ON dt_views
    FOR EACH ROW
    EXECUTE FUNCTION update_dt_updated_at();

-- Ensure only one default view per table
CREATE UNIQUE INDEX IF NOT EXISTS idx_dt_views_default
    ON dt_views(table_id)
    WHERE is_default = TRUE;

-- Function to generate slug from name
CREATE OR REPLACE FUNCTION generate_slug(input_name TEXT)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    result := LOWER(input_name);
    -- German umlauts
    result := REPLACE(result, 'ä', 'ae');
    result := REPLACE(result, 'ö', 'oe');
    result := REPLACE(result, 'ü', 'ue');
    result := REPLACE(result, 'ß', 'ss');
    -- Replace non-alphanumeric with underscore
    result := REGEXP_REPLACE(result, '[^a-z0-9]+', '_', 'g');
    -- Remove leading/trailing underscores
    result := TRIM(BOTH '_' FROM result);
    -- Ensure starts with letter
    IF result ~ '^[0-9]' THEN
        result := 't_' || result;
    END IF;
    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Comments
COMMENT ON TABLE dt_tables IS 'Meta-information about user-created dynamic tables';
COMMENT ON TABLE dt_fields IS 'Field/column definitions for dynamic tables';
COMMENT ON TABLE dt_relations IS 'Relationships between dynamic tables';
COMMENT ON TABLE dt_views IS 'Saved view configurations (filters, sorts, visible columns)';
COMMENT ON FUNCTION generate_slug(TEXT) IS 'Generates URL-safe slug from table/field names';
