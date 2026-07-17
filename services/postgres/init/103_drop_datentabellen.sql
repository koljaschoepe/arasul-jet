-- 103_drop_datentabellen.sql — Plan 008 Schritt 3: Datentabellen-Feature entfernen
--
-- Forward-only, idempotent teardown of everything the "Datentabellen" feature
-- registered in the MAIN application database (arasul_db). The feature, its
-- backend routes/services, the ExcelEditor UI and the "Datenbank-Ansicht" have
-- all been deleted from the codebase; this migration drops their residual
-- schema objects so a fresh box carries no dead references.
--
-- Every statement is guarded (IF EXISTS / CASCADE with explicit guard) so the
-- migration may safely re-run on a half-initialized or already-cleaned DB.

-- Configuration table created by migration 031 (points at the now-removed
-- secondary arasul_data_db). CASCADE also drops the dependent updated_at
-- trigger (trigger_datentabellen_config_updated_at) defined in 031.
DROP TABLE IF EXISTS datentabellen_config CASCADE;

-- Trigger function created by migration 031. CASCADE in case anything else
-- still references it.
DROP FUNCTION IF EXISTS update_datentabellen_config_updated_at() CASCADE;

-- Remove the "Datenbank" workspace app so it no longer shows up in the
-- workspace-apps manifest / Activity Bar. (Seeded into platform_apps.)
DELETE FROM platform_apps WHERE id = 'database';

-- NOTE ON THE SECONDARY DATABASE:
-- The separate `arasul_data_db` database and its `arasul_data` role were only
-- ever created by the deleted first-boot script `032a_create_data_database.sh`.
-- On a FRESH box that script no longer runs, so neither the database nor the
-- role is ever created. On an ALREADY-PROVISIONED box they persist until an
-- operator drops them manually, e.g.:
--     DROP DATABASE arasul_data_db;
--     DROP ROLE arasul_data;
-- This migration intentionally does NOT attempt that: a migration against the
-- main DB runs inside a single transaction, and DROP DATABASE cannot run
-- inside a transaction block (nor against a database other than the current
-- one). Leaving the orphaned DB in place is harmless — nothing connects to it.
