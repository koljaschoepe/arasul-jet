-- 124_flow_run_steps_tree.sql — Agenten-Baum + Modell pro Schritt
--
-- Bisher waren die inneren Werkzeug-Aufrufe eines Subagenten nur als Text-Blob
-- im raw_output des Subagent-Schritts sichtbar. Ab jetzt werden sie als echte
-- Schritt-Zeilen mit parent_step_id angehängt — die Lauf-Ansicht kann jeden
-- Agenten als aufklappbaren Baum zeigen. `modell` hält fest, welches Modell
-- einen Subagent-/Modell-Schritt getrieben hat.

ALTER TABLE flow_run_steps
  ADD COLUMN IF NOT EXISTS parent_step_id BIGINT REFERENCES flow_run_steps(id) ON DELETE CASCADE;

ALTER TABLE flow_run_steps
  ADD COLUMN IF NOT EXISTS modell VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_flow_run_steps_parent ON flow_run_steps(parent_step_id);
