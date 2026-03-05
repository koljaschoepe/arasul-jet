-- 045: Knowledge Graph Refinement Support
-- Adds entity resolution tracking for LLM-based graph refinement (Phase 5)

-- Track which entities have been refined by LLM
ALTER TABLE kg_entities ADD COLUMN IF NOT EXISTS refined BOOLEAN DEFAULT FALSE;

-- Self-reference for entity resolution: merged entities point to their canonical form
-- NULL = this is the canonical entity (or unmerged)
ALTER TABLE kg_entities ADD COLUMN IF NOT EXISTS canonical_id INTEGER REFERENCES kg_entities(id) ON DELETE SET NULL;

-- Track which relations have been refined from generic VERWANDT_MIT
ALTER TABLE kg_relations ADD COLUMN IF NOT EXISTS refined BOOLEAN DEFAULT FALSE;

-- Index for finding unrefined entities/relations efficiently
CREATE INDEX IF NOT EXISTS idx_kg_entities_unrefined ON kg_entities(refined) WHERE refined = FALSE;
CREATE INDEX IF NOT EXISTS idx_kg_relations_unrefined ON kg_relations(refined) WHERE refined = FALSE AND relation_type = 'VERWANDT_MIT';

-- Index for canonical entity lookups
CREATE INDEX IF NOT EXISTS idx_kg_entities_canonical ON kg_entities(canonical_id) WHERE canonical_id IS NOT NULL;

-- Trigram similarity index for finding duplicate entity names
-- (gin_trgm_ops index already exists from 044, but add similarity function support)
CREATE INDEX IF NOT EXISTS idx_kg_entities_name_lower ON kg_entities(LOWER(name));
