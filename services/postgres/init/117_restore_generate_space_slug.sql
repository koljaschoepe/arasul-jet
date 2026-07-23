-- Stellt generate_space_slug() wieder her.
--
-- Vorgeschichte: 016_knowledge_spaces_schema.sql legte die Funktion an,
-- 070_drop_dead_sql_functions.sql entfernte sie als vermeintlich tot. Danach
-- kam Plan 008 (106_workspace_space.sql) und machte sie wieder lebendig:
-- sandboxService.createProject() legt zu JEDEM Workspace genau einen
-- unsichtbaren Wissensraum an und ruft dafür generate_space_slug().
--
-- Folge auf jedem Gerät, das 070 bereits durchlaufen hat: das Anlegen eines
-- Workspaces bricht mit
--   "function generate_space_slug(unknown) does not exist"
-- und die Transaktion rollt zurück — es lässt sich also GAR KEIN Workspace
-- mehr anlegen. Aufgefallen beim Live-Verify von Plan 012 Phase E (die
-- Erweiterungs-Werkstatt ist ein Workspace).
--
-- Die Definition ist unverändert die aus 016; CREATE OR REPLACE ist idempotent
-- und damit auch auf frischen Installationen unschädlich.

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

COMMENT ON FUNCTION generate_space_slug(VARCHAR) IS
  'Eindeutiger Slug für knowledge_spaces. Wird von sandboxService.createProject genutzt (Plan 008) — nicht erneut als tot entfernen.';
