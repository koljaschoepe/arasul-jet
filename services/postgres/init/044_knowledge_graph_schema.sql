-- 044: Knowledge Graph Schema
-- Stores entities and relations extracted from documents for graph-enriched RAG

-- Required for trigram similarity index and similarity() function
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Entity types: Person, Organisation, Produkt, Technologie, Prozess, Konzept, Ort, Dokument
CREATE TABLE IF NOT EXISTS kg_entities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    properties JSONB DEFAULT '{}',
    mention_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, entity_type)
);

-- Link entities to source documents (many-to-many)
CREATE TABLE IF NOT EXISTS kg_entity_documents (
    entity_id INTEGER NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    mention_count INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (entity_id, document_id)
);

-- Relations between entities
CREATE TABLE IF NOT EXISTS kg_relations (
    id SERIAL PRIMARY KEY,
    source_entity_id INTEGER NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    target_entity_id INTEGER NOT NULL REFERENCES kg_entities(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    context TEXT,
    properties JSONB DEFAULT '{}',
    weight REAL DEFAULT 1.0,
    source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_entity_id, target_entity_id, relation_type)
);

-- Indexes for efficient graph traversal
CREATE INDEX IF NOT EXISTS idx_kg_entities_type ON kg_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_kg_entities_name_trgm ON kg_entities USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_kg_relations_source ON kg_relations(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_relations_target ON kg_relations(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_kg_relations_type ON kg_relations(relation_type);
CREATE INDEX IF NOT EXISTS idx_kg_entity_documents_doc ON kg_entity_documents(document_id);

-- Helper: update updated_at on entity change
CREATE OR REPLACE FUNCTION kg_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kg_entities_updated ON kg_entities;
CREATE TRIGGER kg_entities_updated
    BEFORE UPDATE ON kg_entities
    FOR EACH ROW EXECUTE FUNCTION kg_update_timestamp();
