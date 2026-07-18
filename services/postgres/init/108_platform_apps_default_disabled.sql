-- 108_platform_apps_default_disabled.sql — Lizenz-Gating der Workspace-Apps
--
-- Kontext: n8n ist fair-code-lizenziert und darf nur laufen, wenn der Nutzer
-- die Extension ausdrücklich aktiviert (siehe services/app/appLifecycleService).
-- Der lizenzsaubere Default ist daher "aus".
--
-- Diese Migration ändert NUR den Spalten-Default für KÜNFTIGE INSERTs auf
-- FALSE. Bestehende Zeilen bleiben unangetastet — der gespeicherte Flag-Wert
-- auf bereits laufenden Boxen wird bewusst respektiert (keine Zwangs-
-- Deaktivierung). Das Umschalten frischer Installationen auf "aus" erledigt
-- das reine Erst-Init-Skript 108a_n8n_default_disabled_fresh.sh, das nur beim
-- allerersten Postgres-Init läuft und vom Runtime-Migration-Runner ignoriert
-- wird (der verarbeitet ausschließlich .sql).
--
-- Idempotent + forward-only.
--
-- Rollback (down):
--   ALTER TABLE platform_apps ALTER COLUMN enabled SET DEFAULT TRUE;

ALTER TABLE platform_apps ALTER COLUMN enabled SET DEFAULT FALSE;

COMMENT ON COLUMN platform_apps.enabled IS
  'Ob die kuratierte App aktiv ist. Default FALSE (lizenzsauber: Container laufen nur bei aktiver Extension). Bestehende Zeilen behalten ihren Wert.';
