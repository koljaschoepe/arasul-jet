-- 104_drop_chat_projects.sql
-- Plan 008 · Schritt 6 — Workspace-Entity-Konsolidierung.
--
-- Entfernt die Chat-Gruppierungs-Tabelle `projects` (nicht zu verwechseln mit
-- `sandbox_projects`, dem Container-"Workspace"). Chats bleiben funktionsfähig,
-- verlieren aber ihre Projekt-Zuordnung. Die einzige eingehende FK auf `projects`
-- war `chat_conversations.project_id`; sie wird zuerst entfernt, damit das
-- anschließende `DROP TABLE projects` kein CASCADE erzwingt.
--
-- Forward-only und idempotent (IF EXISTS überall), damit ein erneutes Ausführen
-- auf bereits migrierten Boxen folgenlos bleibt.

ALTER TABLE chat_conversations DROP CONSTRAINT IF EXISTS fk_conversations_project;
DROP INDEX IF EXISTS idx_conversations_project;
ALTER TABLE chat_conversations DROP COLUMN IF EXISTS project_id;
DROP TABLE IF EXISTS projects;
