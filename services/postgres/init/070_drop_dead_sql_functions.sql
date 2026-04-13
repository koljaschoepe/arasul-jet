-- Migration 070: Drop unused SQL functions (dead code cleanup)

DROP FUNCTION IF EXISTS generate_space_slug(VARCHAR);
DROP FUNCTION IF EXISTS log_app_event(VARCHAR, VARCHAR, TEXT, JSONB);
