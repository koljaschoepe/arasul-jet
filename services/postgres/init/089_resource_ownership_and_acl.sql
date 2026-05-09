-- Migration 089: Multi-User-Isolation MVP (Phase 1.1)
--
-- Plan-Ref: COMMERCIAL_LAUNCH_MASTER_PLAN.md Phase 1.1
--
-- Bisher: alle eingeloggten Benutzer sehen Projects/Documents/Knowledge-Spaces
-- jedes anderen Users. Killer für Kanzleien (Mandantengeheimnis), Praxen
-- (Patientendaten), Steuerberater. Diese Migration setzt Per-User-Ownership +
-- Per-Space-ACL, sodass das Backend pro Resource isolieren kann.
--
-- Pattern:
--   - projects.owner_id, documents.owner_id, knowledge_spaces.owner_id
--     (BIGINT FK auf admin_users, NOT NULL nach Backfill)
--   - space_members(space_id, user_id, permission ENUM)
--   - Backfill: bestehende Resources gehen an Bootstrap-Admin (kleinste id).
--   - Indexe für Hot-Path (user_id-Filter)
--
-- Roles werden NICHT in dieser Migration verändert; admin_users.role aus
-- Migration 068 reicht. Routes prüfen sowohl owner_id == user_id als auch
-- role == 'admin' (admin sieht alles).

BEGIN;

-- =============================================================================
-- 1. Bestimme Bootstrap-Admin (kleinste id) für Backfill
-- =============================================================================

DO $$
DECLARE
    bootstrap_admin_id INTEGER;
BEGIN
    SELECT id INTO bootstrap_admin_id FROM admin_users ORDER BY id ASC LIMIT 1;

    IF bootstrap_admin_id IS NULL THEN
        -- Frische Box ohne Admin (Phase 1.2 Setup-on-First-Login). Spalten
        -- werden nullable angelegt, NOT NULL erst nach Setup-Wizard erzwungen.
        RAISE NOTICE 'Migration 089: Kein Admin vorhanden, Backfill wird übersprungen. NOT-NULL-Constraints werden nicht gesetzt.';
    ELSE
        RAISE NOTICE 'Migration 089: Backfill auf admin_id=%', bootstrap_admin_id;
    END IF;
END $$;

-- =============================================================================
-- 2. projects.owner_id
-- =============================================================================

ALTER TABLE projects
    ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE;

UPDATE projects
SET owner_id = (SELECT id FROM admin_users ORDER BY id ASC LIMIT 1)
WHERE owner_id IS NULL
  AND EXISTS (SELECT 1 FROM admin_users LIMIT 1);

CREATE INDEX IF NOT EXISTS idx_projects_owner
    ON projects(owner_id);

COMMENT ON COLUMN projects.owner_id IS 'Phase 1.1: Per-User-Owned. Admin sieht alles.';

-- =============================================================================
-- 3. documents.owner_id (BIGINT FK, parallel zu legacy uploaded_by VARCHAR)
-- =============================================================================

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;

-- Backfill: alle bisherigen Dokumente landen beim Bootstrap-Admin.
UPDATE documents
SET owner_id = (SELECT id FROM admin_users ORDER BY id ASC LIMIT 1)
WHERE owner_id IS NULL
  AND EXISTS (SELECT 1 FROM admin_users LIMIT 1);

CREATE INDEX IF NOT EXISTS idx_documents_owner
    ON documents(owner_id);

COMMENT ON COLUMN documents.owner_id IS
  'Phase 1.1: Per-User-Owned. Admin sieht alles. Legacy-Spalte uploaded_by '
  'bleibt aus Kompatibilitätsgründen, sollte aber nicht mehr für Authorization '
  'verwendet werden.';

-- =============================================================================
-- 4. knowledge_spaces.owner_id (Per-Team-Shared mit Owner)
-- =============================================================================

ALTER TABLE knowledge_spaces
    ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES admin_users(id) ON DELETE SET NULL;

UPDATE knowledge_spaces
SET owner_id = (SELECT id FROM admin_users ORDER BY id ASC LIMIT 1)
WHERE owner_id IS NULL
  AND EXISTS (SELECT 1 FROM admin_users LIMIT 1);

CREATE INDEX IF NOT EXISTS idx_knowledge_spaces_owner
    ON knowledge_spaces(owner_id);

COMMENT ON COLUMN knowledge_spaces.owner_id IS
  'Phase 1.1: Owner des Spaces. Zugriff zusätzlich über space_members ACL.';

-- =============================================================================
-- 5. space_members ACL (Per-Space Berechtigungen)
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'space_permission') THEN
        CREATE TYPE space_permission AS ENUM ('owner', 'editor', 'viewer');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS space_members (
    space_id    UUID NOT NULL REFERENCES knowledge_spaces(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    permission  space_permission NOT NULL DEFAULT 'viewer',
    added_by    INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
    added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (space_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_space_members_user
    ON space_members(user_id);

COMMENT ON TABLE space_members IS
  'Phase 1.1: Per-Space-ACL. Owner ist immer implicit member with permission=''owner''. '
  'Admins (admin_users.role = ''admin'') haben Zugriff auf alle Spaces.';

-- Backfill: jeden Owner als implicit owner-member eintragen, sodass die
-- Membership-Query gleichförmig ist (kein Sonderfall für Owner).
INSERT INTO space_members (space_id, user_id, permission, added_at)
SELECT id, owner_id, 'owner'::space_permission, NOW()
FROM knowledge_spaces
WHERE owner_id IS NOT NULL
ON CONFLICT (space_id, user_id) DO NOTHING;

-- =============================================================================
-- 6. Helper-Funktion: hat User Zugriff auf Space?
-- =============================================================================

CREATE OR REPLACE FUNCTION user_has_space_access(p_space_id UUID, p_user_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    -- Admin sieht alles
    IF EXISTS (SELECT 1 FROM admin_users WHERE id = p_user_id AND role = 'admin') THEN
        RETURN TRUE;
    END IF;
    -- Owner oder Member?
    RETURN EXISTS (
        SELECT 1 FROM space_members
        WHERE space_id = p_space_id AND user_id = p_user_id
    );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION user_has_space_access IS
  'Phase 1.1: Single-Source-of-Truth für Space-Zugriff. RAG-Filter und '
  'Backend-Routen sollten diese Funktion verwenden.';

COMMIT;
