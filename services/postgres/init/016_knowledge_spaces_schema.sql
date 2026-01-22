-- ============================================================================
-- Knowledge Spaces Schema for RAG 2.0
-- Version: 1.0.0
--
-- Implements hierarchical context system:
-- 1. Company Context - Global background information
-- 2. Knowledge Spaces - Themed document collections with descriptions
-- 3. Auto-generated context - LLM-summarized space content
-- ============================================================================

-- ============================================================================
-- COMPANY CONTEXT (Global, Singleton)
-- ============================================================================

CREATE TABLE IF NOT EXISTS company_context (
    id INTEGER PRIMARY KEY DEFAULT 1,

    -- Content
    content TEXT NOT NULL DEFAULT '',                    -- Markdown content
    content_embedding TEXT,                              -- JSON-serialized embedding vector

    -- Metadata
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by INTEGER,

    -- Singleton constraint
    CONSTRAINT company_context_singleton CHECK (id = 1)
);

-- Insert default empty row
INSERT INTO company_context (id, content)
VALUES (1, '# Unternehmensprofil

**Firma:** [Firmenname]
**Branche:** [Branche]

## Hauptprodukte/Dienstleistungen
- [Produkt 1]
- [Produkt 2]

## Kunden
- [Kundensegment 1]
- [Kundensegment 2]

---
*Diese Informationen werden bei jeder RAG-Anfrage als Hintergrundkontext bereitgestellt.*')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- KNOWLEDGE SPACES (Document Collections)
-- ============================================================================

CREATE TABLE IF NOT EXISTS knowledge_spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,                   -- URL-safe identifier

    -- UI customization
    icon VARCHAR(50) DEFAULT 'folder',
    color VARCHAR(7) DEFAULT '#6366f1',
    sort_order INTEGER DEFAULT 0,

    -- MANUAL: User-provided description (required)
    description TEXT NOT NULL,                           -- For routing & display
    description_embedding TEXT,                          -- JSON-serialized embedding

    -- AUTOMATIC: LLM-generated context (updated on document changes)
    auto_summary TEXT,                                   -- Summary of all documents
    auto_topics JSONB DEFAULT '[]'::jsonb,              -- [{topic, count, sample_docs}]
    auto_glossary JSONB DEFAULT '[]'::jsonb,            -- [{term, definition}]
    auto_generated_at TIMESTAMPTZ,
    auto_generation_status VARCHAR(20) DEFAULT 'pending', -- pending, generating, completed, failed
    auto_generation_error TEXT,

    -- Statistics (updated by triggers/jobs)
    document_count INTEGER DEFAULT 0,
    total_chunks INTEGER DEFAULT 0,
    total_size_bytes BIGINT DEFAULT 0,

    -- Flags
    is_default BOOLEAN DEFAULT FALSE,                    -- Default space for unassigned docs
    is_system BOOLEAN DEFAULT FALSE,                     -- Cannot be deleted

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT knowledge_spaces_name_not_empty CHECK (length(trim(name)) > 0),
    CONSTRAINT knowledge_spaces_description_not_empty CHECK (length(trim(description)) > 0)
);

-- Create unique partial index for single default space
CREATE UNIQUE INDEX IF NOT EXISTS idx_knowledge_spaces_single_default
ON knowledge_spaces (is_default) WHERE is_default = TRUE;

-- Insert default "Allgemein" space
INSERT INTO knowledge_spaces (name, slug, description, icon, is_default, is_system)
VALUES (
    'Allgemein',
    'allgemein',
    'Dokumente ohne spezifische Zuordnung. Dieser Bereich enthält alle Dokumente, die keinem spezifischen Wissensbereich zugeordnet wurden.',
    'inbox',
    TRUE,
    TRUE
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- EXTEND DOCUMENTS TABLE
-- ============================================================================

-- Add space_id column to documents if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'documents' AND column_name = 'space_id'
    ) THEN
        ALTER TABLE documents ADD COLUMN space_id UUID REFERENCES knowledge_spaces(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add document_summary column if not exists (for individual doc summaries)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'documents' AND column_name = 'document_summary'
    ) THEN
        ALTER TABLE documents ADD COLUMN document_summary TEXT;
    END IF;
END $$;

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_documents_space_id ON documents(space_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_spaces_sort ON knowledge_spaces(sort_order, name);
CREATE INDEX IF NOT EXISTS idx_knowledge_spaces_updated ON knowledge_spaces(updated_at DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update space updated_at
CREATE OR REPLACE FUNCTION update_knowledge_spaces_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_knowledge_spaces_updated_at ON knowledge_spaces;
CREATE TRIGGER trigger_knowledge_spaces_updated_at
    BEFORE UPDATE ON knowledge_spaces
    FOR EACH ROW
    EXECUTE FUNCTION update_knowledge_spaces_updated_at();

-- Trigger to update company_context updated_at
DROP TRIGGER IF EXISTS trigger_company_context_updated_at ON company_context;
CREATE TRIGGER trigger_company_context_updated_at
    BEFORE UPDATE ON company_context
    FOR EACH ROW
    EXECUTE FUNCTION update_knowledge_spaces_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get space statistics
CREATE OR REPLACE FUNCTION get_space_statistics(p_space_id UUID)
RETURNS TABLE (
    document_count BIGINT,
    indexed_count BIGINT,
    total_chunks BIGINT,
    total_size_bytes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*) FILTER (WHERE status != 'deleted'),
        COUNT(*) FILTER (WHERE status = 'indexed'),
        COALESCE(SUM(chunk_count) FILTER (WHERE status = 'indexed'), 0),
        COALESCE(SUM(file_size) FILTER (WHERE status != 'deleted'), 0)
    FROM documents
    WHERE space_id = p_space_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update space statistics (called after document changes)
CREATE OR REPLACE FUNCTION update_space_statistics(p_space_id UUID)
RETURNS void AS $$
DECLARE
    v_doc_count BIGINT;
    v_chunk_count BIGINT;
    v_size_bytes BIGINT;
BEGIN
    SELECT
        COUNT(*) FILTER (WHERE status != 'deleted'),
        COALESCE(SUM(chunk_count) FILTER (WHERE status = 'indexed'), 0),
        COALESCE(SUM(file_size) FILTER (WHERE status != 'deleted'), 0)
    INTO v_doc_count, v_chunk_count, v_size_bytes
    FROM documents
    WHERE space_id = p_space_id;

    UPDATE knowledge_spaces
    SET
        document_count = v_doc_count,
        total_chunks = v_chunk_count,
        total_size_bytes = v_size_bytes
    WHERE id = p_space_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get all spaces with statistics
CREATE OR REPLACE FUNCTION get_all_spaces_with_stats()
RETURNS TABLE (
    id UUID,
    name VARCHAR(100),
    slug VARCHAR(100),
    icon VARCHAR(50),
    color VARCHAR(7),
    description TEXT,
    auto_summary TEXT,
    auto_topics JSONB,
    document_count INTEGER,
    total_chunks INTEGER,
    is_default BOOLEAN,
    is_system BOOLEAN,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ks.id,
        ks.name,
        ks.slug,
        ks.icon,
        ks.color,
        ks.description,
        ks.auto_summary,
        ks.auto_topics,
        ks.document_count,
        ks.total_chunks,
        ks.is_default,
        ks.is_system,
        ks.created_at,
        ks.updated_at
    FROM knowledge_spaces ks
    ORDER BY ks.sort_order, ks.name;
END;
$$ LANGUAGE plpgsql;

-- Function to generate URL-safe slug from name
CREATE OR REPLACE FUNCTION generate_space_slug(p_name VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    v_slug VARCHAR;
    v_counter INTEGER := 0;
    v_base_slug VARCHAR;
BEGIN
    -- Convert to lowercase, replace spaces and special chars with hyphens
    v_slug := lower(regexp_replace(
        regexp_replace(p_name, '[^a-zA-Z0-9äöüÄÖÜß\s-]', '', 'g'),
        '[\s]+', '-', 'g'
    ));

    -- Replace German umlauts
    v_slug := replace(replace(replace(replace(v_slug, 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss');

    -- Trim hyphens from start/end
    v_slug := trim(both '-' from v_slug);

    v_base_slug := v_slug;

    -- Check for uniqueness, append counter if needed
    WHILE EXISTS (SELECT 1 FROM knowledge_spaces WHERE slug = v_slug) LOOP
        v_counter := v_counter + 1;
        v_slug := v_base_slug || '-' || v_counter;
    END LOOP;

    RETURN v_slug;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for documents with space info
CREATE OR REPLACE VIEW documents_with_space AS
SELECT
    d.*,
    ks.name as space_name,
    ks.slug as space_slug,
    ks.icon as space_icon,
    ks.color as space_color
FROM documents d
LEFT JOIN knowledge_spaces ks ON d.space_id = ks.id
WHERE d.deleted_at IS NULL;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE company_context IS 'Singleton table for global company context used in all RAG queries';
COMMENT ON TABLE knowledge_spaces IS 'Knowledge spaces (themed document collections) for hierarchical RAG';
COMMENT ON COLUMN knowledge_spaces.description IS 'User-provided description used for intelligent space routing';
COMMENT ON COLUMN knowledge_spaces.description_embedding IS 'JSON-serialized embedding vector for semantic routing';
COMMENT ON COLUMN knowledge_spaces.auto_summary IS 'LLM-generated summary of all documents in this space';
COMMENT ON COLUMN knowledge_spaces.auto_topics IS 'LLM-extracted key topics as JSON array';
COMMENT ON COLUMN knowledge_spaces.auto_glossary IS 'LLM-extracted glossary terms as JSON array';
