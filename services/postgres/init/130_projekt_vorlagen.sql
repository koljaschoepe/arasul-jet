-- 130: Projekt-Vorlagen & projektgebundene Flow-Läufe (Plan 014, Phase 1)
--
-- Standardprojekte: Ein Projekt kann aus einer mitgelieferten Vorlage
-- (Vorlagen-Galerie beim Anlegen) entstehen. Es merkt sich NUR Herkunft und
-- Version — die kopierten Dateien gehören ab da dem Nutzer (Platte = Wahrheit,
-- nichts wird je überschrieben). Auf der Version baut später der
-- Update-Hinweis auf (Plan 014, Phase 6).
--
--   projects.vorlage_id      — ID der Vorlage im Backend-Image
--                              (z. B. 'kunden-auftraege'); NULL = leer angelegt.
--   projects.vorlage_version — Version der Vorlage zum Zeitpunkt des Anlegens
--                              bzw. der letzten Übernahme.
--
-- Projektgebundene Flows: Flows können im Projektordner (<projekt>/flows/)
-- leben. Ein Lauf eines solchen Flows merkt sich sein Projekt, damit
-- „Ab Fehler wiederholen" und die Lauf-Anzeige den Flow wiederfinden.
--
--   flow_runs.projekt_id — Projekt des gestarteten Flows; NULL = globaler Flow.
--
-- Down-Pfad (dokumentiert, nicht ausgeführt):
--   ALTER TABLE projects DROP COLUMN vorlage_id, DROP COLUMN vorlage_version;
--   ALTER TABLE flow_runs DROP COLUMN projekt_id;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS vorlage_id TEXT DEFAULT NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS vorlage_version INTEGER DEFAULT NULL;

COMMENT ON COLUMN projects.vorlage_id IS
  'ID der mitgelieferten Vorlage, aus der das Projekt entstand; NULL = leer angelegt';
COMMENT ON COLUMN projects.vorlage_version IS
  'Vorlagen-Version beim Anlegen bzw. der letzten Übernahme (Update-Hinweis, Plan 014 Phase 6)';

ALTER TABLE flow_runs ADD COLUMN IF NOT EXISTS projekt_id UUID DEFAULT NULL
  REFERENCES projects(id) ON DELETE SET NULL;

COMMENT ON COLUMN flow_runs.projekt_id IS
  'Projekt eines projektgebundenen Flows (<projekt>/flows/); NULL = globaler Flow';
