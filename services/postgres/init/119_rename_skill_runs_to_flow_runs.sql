-- 119_rename_skill_runs_to_flow_runs.sql — Plan 013 · B6: Skills → Flow
--
-- Zweck: Das Produkt-Feature „Skills" heißt ab jetzt durchgängig „Flow"
-- (Frontend-Review 2026-07). Diese Migration zieht die 2011er-Lauf-Tabellen
-- (112/113) auf die neue Benennung nach — Code (runStore.js) referenziert nun
-- `flow_runs`, `flow_run_steps` und die Spalte `flow_name`.
--
-- WICHTIG: 112/113 sind bereits ausgerollt und bleiben unverändert (Migrationen
-- sind forward-only). Diese Migration benennt die vorhandenen Objekte um. Auf
-- einer frischen DB laufen 112 (legt skill_* an) → 119 (benennt in flow_* um);
-- auf dem Jetson (skill_* existiert) benennt 119 direkt um. Beide Wege enden
-- identisch.
--
-- Forward-only und idempotent: jeder Schritt ist in einen DO-Block gehüllt, der
-- nur umbenennt, wenn die Quelle existiert UND das Ziel noch nicht — ein
-- erneutes Ausführen bleibt folgenlos.
--
-- Rollback (down): die drei RENAME-Richtungen umkehren (flow_* → skill_*).

-- ---------------------------------------------------------------------------
-- 1. Aufzählungstypen
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_run_status')
     AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flow_run_status') THEN
    ALTER TYPE skill_run_status RENAME TO flow_run_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_step_kind')
     AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'flow_step_kind') THEN
    ALTER TYPE skill_step_kind RENAME TO flow_step_kind;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 2. Tabellen + Spalte
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- skill_runs → flow_runs
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'skill_runs' AND relkind = 'r')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'flow_runs' AND relkind = 'r') THEN
    ALTER TABLE skill_runs RENAME TO flow_runs;
  END IF;

  -- Spalte skill_name → flow_name (auf der jetzt evtl. schon umbenannten Tabelle)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flow_runs' AND column_name = 'skill_name'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flow_runs' AND column_name = 'flow_name'
  ) THEN
    ALTER TABLE flow_runs RENAME COLUMN skill_name TO flow_name;
  END IF;

  -- skill_run_steps → flow_run_steps
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'skill_run_steps' AND relkind = 'r')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'flow_run_steps' AND relkind = 'r') THEN
    ALTER TABLE skill_run_steps RENAME TO flow_run_steps;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 3. Indizes + Constraint (rein kosmetisch — Code referenziert sie nicht über
--    den Namen, aber das Schema soll selbst-konsistent bleiben).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_skill_runs_user_id')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_flow_runs_user_id') THEN
    ALTER INDEX idx_skill_runs_user_id RENAME TO idx_flow_runs_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_skill_runs_conversation')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_flow_runs_conversation') THEN
    ALTER INDEX idx_skill_runs_conversation RENAME TO idx_flow_runs_conversation;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_skill_runs_status')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_flow_runs_status') THEN
    ALTER INDEX idx_skill_runs_status RENAME TO idx_flow_runs_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_skill_run_steps_run_id')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_flow_run_steps_run_id') THEN
    ALTER INDEX idx_skill_run_steps_run_id RENAME TO idx_flow_run_steps_run_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'skill_run_steps_run_pos_uniq')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_run_steps_run_pos_uniq') THEN
    ALTER TABLE flow_run_steps RENAME CONSTRAINT skill_run_steps_run_pos_uniq TO flow_run_steps_run_pos_uniq;
  END IF;

  -- Primärschlüssel-Constraints (benennt zugleich den zugrundeliegenden Index um)
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'skill_runs_pkey')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_runs_pkey') THEN
    ALTER TABLE flow_runs RENAME CONSTRAINT skill_runs_pkey TO flow_runs_pkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'skill_run_steps_pkey')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flow_run_steps_pkey') THEN
    ALTER TABLE flow_run_steps RENAME CONSTRAINT skill_run_steps_pkey TO flow_run_steps_pkey;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 3b. Sequenzen (BIGSERIAL). Der Spalten-Default nextval(...) folgt der
--     Umbenennung automatisch (per OID gespeichert).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'skill_runs_id_seq' AND relkind = 'S')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'flow_runs_id_seq' AND relkind = 'S') THEN
    ALTER SEQUENCE skill_runs_id_seq RENAME TO flow_runs_id_seq;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'skill_run_steps_id_seq' AND relkind = 'S')
     AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'flow_run_steps_id_seq' AND relkind = 'S') THEN
    ALTER SEQUENCE skill_run_steps_id_seq RENAME TO flow_run_steps_id_seq;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 4. Kommentare auf die neue Benennung nachziehen
-- ---------------------------------------------------------------------------
COMMENT ON TABLE flow_runs IS
  'Flow-Läufe (Plan 011/013): ein Lauf je Aufruf von /name. Überlebt das Schließen des Tabs, damit die Live-Übertragung wiederverbinden kann.';
COMMENT ON COLUMN flow_runs.flow_name IS
  'Name des Flows (Dateiname ohne .md). Kein Fremdschlüssel — Flows sind Dateien; der Name bleibt lesbar, auch wenn der Flow später verschwindet.';
COMMENT ON TABLE flow_run_steps IS
  'Einzelne Schritte eines Flow-Laufs (Plan 011/013): je Werkzeug-/Subagent-/Modell-Schritt eine Zeile, angehängt statt ein wachsendes JSONB neu zu schreiben.';
