-- ============================================================================
-- 083_model_download_progress.sql
-- Phase 0 — Download-Persistenz & Crash-Recovery
--
-- Adds byte-level progress tracking and a 'paused' status so model downloads
-- can be resumed after container restarts, network drops, or Jetson reboots.
--
-- Plan reference: docs/plans/LLM_RAG_N8N_HARDENING.md  (Phase 0.1)
--
-- Background:
--   The original schema (migration 011) only stored `download_progress` as
--   percent (0-100). When a Jetson rebooted mid-pull, the next sync marked
--   the download as 'error' and the WHERE-guard in modelService.downloadModel
--   refused to restart it. With 80GB models taking up to 15h, that meant
--   total data loss on a single power blip.
--
--   This migration adds:
--     - Byte-level fields (bytes_total, bytes_completed) so progress survives
--       restarts and a real ETA can be computed.
--     - 'paused' status, distinct from 'error', so the boot-time recovery
--       knows which downloads to resume vs. give up on.
--     - Bookkeeping fields (started_at, last_activity_at, attempt_count,
--       last_error_code, download_speed_bps).
--     - An index for fast Stale/Paused detection at boot.
--
--   The legacy `download_progress` (percent) column is kept for backward
--   compatibility — it is updated alongside the byte fields by the backend.
-- ============================================================================

-- 1. New columns (idempotent)
ALTER TABLE llm_installed_models ADD COLUMN IF NOT EXISTS bytes_total BIGINT;
ALTER TABLE llm_installed_models ADD COLUMN IF NOT EXISTS bytes_completed BIGINT DEFAULT 0;
ALTER TABLE llm_installed_models ADD COLUMN IF NOT EXISTS download_started_at TIMESTAMPTZ;
ALTER TABLE llm_installed_models ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE llm_installed_models ADD COLUMN IF NOT EXISTS attempt_count INTEGER DEFAULT 0;
ALTER TABLE llm_installed_models ADD COLUMN IF NOT EXISTS last_error_code VARCHAR(50);
ALTER TABLE llm_installed_models ADD COLUMN IF NOT EXISTS download_speed_bps BIGINT;

-- 2. Extend status enum to include 'paused'
--    'paused' = download was interrupted (crash, restart, inactivity timeout)
--               but bytes_completed > 0; ready to be resumed.
--    'error'  = download failed unrecoverably (model not found, disk full,
--               retry budget exhausted) and should not be auto-resumed.
ALTER TABLE llm_installed_models DROP CONSTRAINT IF EXISTS llm_installed_models_status_check;
ALTER TABLE llm_installed_models ADD CONSTRAINT llm_installed_models_status_check
    CHECK (status IN ('downloading', 'paused', 'available', 'error'));

-- 3. Index for boot-time recovery: find all interrupted downloads quickly.
--    Partial index keeps it tiny (only matches active/paused rows).
CREATE INDEX IF NOT EXISTS idx_llm_installed_models_recovery
    ON llm_installed_models(status, last_activity_at)
    WHERE status IN ('downloading', 'paused');

-- 4. Backfill: any row currently in 'downloading' with no last_activity_at
--    is almost certainly a stale row from before this migration. Mark it
--    'paused' so the new recovery loop will pick it up (or — if Ollama
--    actually has the model — promote it to 'available' on next sync).
UPDATE llm_installed_models
   SET status = 'paused',
       last_activity_at = COALESCE(last_activity_at, NOW())
 WHERE status = 'downloading'
   AND last_activity_at IS NULL;

COMMENT ON COLUMN llm_installed_models.bytes_total IS
    'Total bytes for the download as reported by Ollama (data.total). NULL until first progress event.';
COMMENT ON COLUMN llm_installed_models.bytes_completed IS
    'Bytes downloaded so far. Persisted across crashes so resumes do not start from 0.';
COMMENT ON COLUMN llm_installed_models.download_started_at IS
    'Wall-clock time the *current* download attempt began (set once per claim, not per retry).';
COMMENT ON COLUMN llm_installed_models.last_activity_at IS
    'Updated on every progress event. Used by stall detection and boot recovery.';
COMMENT ON COLUMN llm_installed_models.attempt_count IS
    'How many times this download has been attempted (resumes + retries). Hard fail at >5.';
COMMENT ON COLUMN llm_installed_models.last_error_code IS
    'Machine-readable code for the most recent failure (e.g. ECONNRESET, ENOSPC). NULL on success.';
COMMENT ON COLUMN llm_installed_models.download_speed_bps IS
    'Recent download speed in bytes/sec (rolling, written by the streamer for ETA computation).';
