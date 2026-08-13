-- 139_sandbox_project_link.sql — Plan 018: Projekt-Vereinheitlichung.
--
-- Ein Workspace-Projekt (projects) ist künftig 1:1 an genau EINEN aktiven
-- Sandbox-Container (sandbox_projects.project_id) gekoppelt. Der Terminal-
-- Container wird aus dem aktiven Projekt abgeleitet, nicht mehr separat gewählt.
-- Dieser partielle Unique-Index erzwingt die 1:1-Beziehung und entschärft ein
-- Doppelklick-Race beim automatischen Anlegen (zwei parallele „ensure"-Aufrufe
-- können nicht zwei Container für dasselbe Projekt erzeugen — der Verlierer
-- bekommt 23505 und liest den Gewinner nach).

-- Vorsichtsmaßnahme: sollte es (durch früheres manuelles Setzen von project_id)
-- doch mehrere aktive Container je Projekt geben, den Unique-Index nicht am
-- Bestand scheitern lassen. Pro project_id nur den zuletzt angelegten aktiven
-- Container behalten, ältere entkoppeln (project_id → NULL). Container/Daten
-- bleiben erhalten; nur die (redundante) Kopplung fällt weg.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY project_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM sandbox_projects
   WHERE project_id IS NOT NULL
     AND status = 'active'
)
UPDATE sandbox_projects sp
   SET project_id = NULL
  FROM ranked r
 WHERE sp.id = r.id
   AND r.rn > 1;

-- Höchstens EIN aktiver Container je Workspace-Projekt.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sandbox_projects_project_id_unique
  ON sandbox_projects (project_id)
  WHERE project_id IS NOT NULL AND status = 'active';

COMMENT ON INDEX idx_sandbox_projects_project_id_unique IS
  '1:1-Kopplung Sandbox-Container ↔ Workspace-Projekt (Plan 018): höchstens ein aktiver Container je project_id.';
