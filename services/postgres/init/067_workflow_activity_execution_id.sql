-- ============================================================================
-- Migration 067: Add execution_id column to workflow_activity
-- ============================================================================
-- The n8nLogger service expects this column for tracking n8n execution IDs,
-- but it was missing from the original schema (001_init_schema.sql).
-- ============================================================================

ALTER TABLE workflow_activity
  ADD COLUMN IF NOT EXISTS execution_id TEXT;

CREATE INDEX IF NOT EXISTS idx_workflow_activity_execution_id
  ON workflow_activity(execution_id)
  WHERE execution_id IS NOT NULL;
