-- Phase 5.4 — Wildcard scope removal for API keys
--
-- Defense-in-depth: as of 2026-04-29 the create-time validation rejects
-- `allowed_endpoints` arrays that contain '*', AND the auth middleware no
-- longer honors '*' at request time. Any key still carrying a '*' scope
-- is now functionally inert (auth returns 403 for every endpoint).
--
-- This migration:
-- 1. Adds `requires_review BOOLEAN` so the admin UI can surface affected keys.
-- 2. Marks each existing wildcard key with requires_review=true and disables it.
-- 3. Logs the action via a metadata JSON entry so we keep an audit trail.
--
-- Idempotent: running twice is a no-op.

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN DEFAULT false;

UPDATE api_keys
SET
  is_active = false,
  requires_review = true,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'phase_5_4_revoked_at', NOW()::text,
    'phase_5_4_reason', 'wildcard scope no longer honored — reissue with explicit endpoints'
  )
WHERE allowed_endpoints @> ARRAY['*']
  AND requires_review IS DISTINCT FROM true;

CREATE INDEX IF NOT EXISTS idx_api_keys_requires_review
  ON api_keys(requires_review)
  WHERE requires_review = true;

COMMENT ON COLUMN api_keys.requires_review IS
  'Phase 5.4: keys flagged for re-issuance, e.g. legacy wildcard scopes that are no longer honored.';
