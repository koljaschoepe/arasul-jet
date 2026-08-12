-- 137_sandbox_session_titles.sql — Plan 017 Schritt 6: benannte Sitzungen.
--
-- Sitzungs-Titel sind serverseitig und gelten geräteweit (in jedem Browser
-- gleich). Schlüssel: Projekt + tmux-Name (nicht die pro-Verbindung wechselnde
-- sandbox_terminal_sessions.id) — so überlebt der Name Reconnects und
-- Neustarts. Auto-Name beim ersten Start nach gestartetem Werkzeug; Umbenennen
-- per Doppelklick.

CREATE TABLE IF NOT EXISTS sandbox_session_titles (
  project_id  UUID NOT NULL REFERENCES sandbox_projects(id) ON DELETE CASCADE,
  tmux_name   TEXT NOT NULL,
  title       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, tmux_name)
);

COMMENT ON TABLE sandbox_session_titles IS
  'Serverseitige Terminal-Sitzungs-Titel (Plan 017 Schritt 6), Schlüssel Projekt + tmux-Name — geräteweit gleich, überleben Reconnects/Neustarts.';
