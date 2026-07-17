-- 105_agent_run_token.sql
-- Plan 008 · Schritt 12 — Agenten per HTTP (n8n / externe Aufrufer) starten.
--
-- Fügt jedem Workspace (`sandbox_projects`) ein optionales, pro-Workspace
-- geltendes Bearer-Token hinzu, mit dem ein externer Aufrufer (typisch n8n)
-- einen Agenten über die nicht-cookie-authentisierte Run-Route starten darf.
-- Gespeichert wird ausschließlich der bcrypt-Hash; das Klartext-Token wird
-- genau einmal bei der Erzeugung zurückgegeben und rotiert bei jeder Neu-
-- Erzeugung. Ein Workspace mit NULL-Hash kann extern nicht aufgerufen werden.
--
-- Forward-only und idempotent (ADD COLUMN IF NOT EXISTS), damit ein erneutes
-- Ausführen auf bereits migrierten Boxen folgenlos bleibt.

ALTER TABLE sandbox_projects
  ADD COLUMN IF NOT EXISTS agent_run_token_hash TEXT;

ALTER TABLE sandbox_projects
  ADD COLUMN IF NOT EXISTS agent_run_token_set_at TIMESTAMPTZ;
