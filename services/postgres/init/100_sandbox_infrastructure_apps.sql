-- 100_sandbox_infrastructure_apps.sql — Plan 001 (Workspace-Feinschliff), Schritt 6+7:
--
-- (1) Sandbox-Netzwerkmodus 'infrastructure': dritter Modus neben 'isolated'
--     und 'internal' (Migration 074). Ein Infrastruktur-Projekt mountet das
--     Plattform-Repo beschreibbar sowie den Docker-Socket in den Container —
--     nur Admins dürfen solche Projekte anlegen (Durchsetzung im Backend,
--     sandboxService). Da 074 keinen CHECK-Constraint angelegt hat, wird er
--     hier erstmalig gesetzt; unbekannte Alt-Werte werden vorher auf
--     'isolated' normalisiert, damit ADD CONSTRAINT nie fehlschlägt.
-- (2) Tabelle platform_apps: An-/Abschaltbarkeit kuratierter Apps (n8n,
--     Telegram, Datenbank) für den Extensions-Tab. Hier nur Schema + Seed;
--     die GET/PUT /apps-Routen liefert Schritt 7.
--
-- Rollback (down):
--   ALTER TABLE sandbox_projects DROP CONSTRAINT IF EXISTS sandbox_projects_network_mode_check;
--   UPDATE sandbox_projects SET network_mode = 'internal' WHERE network_mode = 'infrastructure';
--   DROP TABLE IF EXISTS platform_apps;

-- --------------------------------------------------------------------------
-- (1) network_mode: CHECK-Constraint inkl. 'infrastructure'
-- --------------------------------------------------------------------------

-- Alt-/Fremdwerte normalisieren, damit der neue CHECK garantiert validiert
-- (NULL bleibt erlaubt — CHECK ist für NULL per SQL-Standard erfüllt).
UPDATE sandbox_projects
SET network_mode = 'isolated'
WHERE network_mode IS NOT NULL
  AND network_mode NOT IN ('isolated', 'internal', 'infrastructure');

ALTER TABLE sandbox_projects
  DROP CONSTRAINT IF EXISTS sandbox_projects_network_mode_check;

ALTER TABLE sandbox_projects
  ADD CONSTRAINT sandbox_projects_network_mode_check
  CHECK (network_mode IN ('isolated', 'internal', 'infrastructure'));

COMMENT ON COLUMN sandbox_projects.network_mode IS
  'Netzwerkmodus: isolated (Bridge, nur Internet), internal (Backend-Netz mit LLM/DB), infrastructure (wie internal + Plattform-Repo rw + Docker-Socket; nur Admin)';

-- --------------------------------------------------------------------------
-- (2) platform_apps: kuratierte Apps an-/abschaltbar (Extensions-Tab)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS platform_apps (
  id         TEXT PRIMARY KEY,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform_apps IS
  'Kuratierte Plattform-Apps (Extensions-Tab): pro App an/aus. v1-Seed: n8n, telegram, database.';

INSERT INTO platform_apps (id) VALUES
  ('n8n'),
  ('telegram'),
  ('database')
ON CONFLICT (id) DO NOTHING;
