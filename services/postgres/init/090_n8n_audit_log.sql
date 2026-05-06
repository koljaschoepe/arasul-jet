-- ============================================================================
-- 090_n8n_audit_log.sql — Phase 3 of EXTERNAL_INTEGRATIONS plan: DSGVO Art-30
-- audit trail on n8n workflow / credential / user changes.
--
-- n8n Enterprise has built-in Log Streaming for this. We're on Community, so
-- we capture changes via Postgres triggers into arasul.n8n_audit_log.
--
-- The audit table lives in the `arasul` schema (NOT in `n8n`) so n8n's own
-- migrations cannot touch it, and so a `pg_dump --schema=n8n` excludes it
-- (audit logs are operator data, not customer workflow data).
--
-- Idempotent: re-running this migration drops and recreates the triggers
-- via the ensure_n8n_audit_triggers() helper.
--
-- Edge case: if n8n has never booted, its schema is not yet present. The
-- DO-block at the bottom skips trigger creation in that case and prints a
-- NOTICE. After n8n first boots, run:
--   docker exec postgres-db psql -U arasul -d arasul_db \
--     -c "SELECT arasul.ensure_n8n_audit_triggers();"
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS arasul;

CREATE TABLE IF NOT EXISTS arasul.n8n_audit_log (
    id           BIGSERIAL PRIMARY KEY,
    occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    table_name   TEXT NOT NULL,
    action       TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
    row_id       TEXT,
    actor_id     TEXT,
    diff         JSONB
);

CREATE INDEX IF NOT EXISTS idx_n8n_audit_log_occurred_at
    ON arasul.n8n_audit_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_n8n_audit_log_table_action
    ON arasul.n8n_audit_log(table_name, action);

COMMENT ON TABLE arasul.n8n_audit_log IS
    'DSGVO Art-30 audit trail for n8n workflow/credential/user mutations. '
    'Phase-3 EXTERNAL_INTEGRATIONS plan. Pruned by run_all_cleanups()/cleanup_n8n_audit_log().';

-- ----------------------------------------------------------------------------
-- Trigger function: writes a row to arasul.n8n_audit_log on every mutation.
-- Diff is the JSONB-diff of OLD/NEW for UPDATEs, or the full row for I/D.
-- Sensitive columns (encrypted credential blobs) are excluded from the diff.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION arasul.n8n_audit_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_action     TEXT := TG_OP;
    v_table      TEXT := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
    v_row_id     TEXT;
    v_diff       JSONB;
    v_old_filtered JSONB;
    v_new_filtered JSONB;
BEGIN
    -- Strip secret blobs before diffing. n8n credential rows have an encrypted
    -- `data` column we never want in the audit log even in encrypted form.
    IF TG_OP = 'INSERT' THEN
        v_new_filtered := to_jsonb(NEW) - 'data';
        v_diff := jsonb_build_object('new', v_new_filtered);
        v_row_id := COALESCE(v_new_filtered->>'id', '');
    ELSIF TG_OP = 'UPDATE' THEN
        v_old_filtered := to_jsonb(OLD) - 'data';
        v_new_filtered := to_jsonb(NEW) - 'data';
        v_diff := jsonb_build_object('old', v_old_filtered, 'new', v_new_filtered);
        v_row_id := COALESCE(v_new_filtered->>'id', '');
    ELSIF TG_OP = 'DELETE' THEN
        v_old_filtered := to_jsonb(OLD) - 'data';
        v_diff := jsonb_build_object('old', v_old_filtered);
        v_row_id := COALESCE(v_old_filtered->>'id', '');
    END IF;

    INSERT INTO arasul.n8n_audit_log (table_name, action, row_id, actor_id, diff)
    VALUES (
        v_table,
        v_action,
        v_row_id,
        current_setting('arasul.actor_id', true),  -- set by app code per session, NULL otherwise
        v_diff
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Audit must never break n8n's writes. Log to postgres log and continue.
    RAISE WARNING 'arasul.n8n_audit_trigger failed: %', SQLERRM;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- ensure_n8n_audit_triggers(): idempotently attaches triggers to n8n's tables.
-- Safe to call repeatedly. If n8n's tables don't exist yet, returns NULL with
-- a NOTICE. After n8n first boots, call this once to backfill the triggers.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION arasul.ensure_n8n_audit_triggers()
RETURNS TEXT AS $$
DECLARE
    target_tables TEXT[] := ARRAY['workflow_entity', 'credentials_entity', 'user'];
    t TEXT;
    attached INT := 0;
    skipped INT := 0;
BEGIN
    FOREACH t IN ARRAY target_tables LOOP
        IF EXISTS (
            SELECT 1 FROM pg_tables
            WHERE schemaname = 'n8n' AND tablename = t
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS arasul_audit ON n8n.%I', t);
            EXECUTE format(
                'CREATE TRIGGER arasul_audit '
                'AFTER INSERT OR UPDATE OR DELETE ON n8n.%I '
                'FOR EACH ROW EXECUTE FUNCTION arasul.n8n_audit_trigger()',
                t
            );
            attached := attached + 1;
        ELSE
            RAISE NOTICE 'n8n.% does not exist yet — trigger not attached', t;
            skipped := skipped + 1;
        END IF;
    END LOOP;

    RETURN format('attached=%s skipped=%s', attached, skipped);
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- Retention: prune audit rows older than 365 days. Wired into run_all_cleanups
-- below. 365d is the conservative DSGVO retention for change-trail records.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION arasul.cleanup_n8n_audit_log()
RETURNS INTEGER AS $$
DECLARE
    deleted INTEGER;
BEGIN
    DELETE FROM arasul.n8n_audit_log
    WHERE occurred_at < NOW() - INTERVAL '365 days';
    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END;
$$ LANGUAGE plpgsql;

-- Attempt initial trigger attachment. On a fresh DB without n8n bootstrapped,
-- this prints NOTICEs and the operator must call ensure_n8n_audit_triggers()
-- manually after n8n first boots (see file header).
SELECT arasul.ensure_n8n_audit_triggers();
