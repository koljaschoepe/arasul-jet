-- 131: Annahmen-Protokoll für Flow-Läufe (Plan 014, Phase 2)
--
-- Flows fragen nie zurück (Nutzer-Entscheidung, Plan 014 §8): Lücken werden
-- als ANNAHMEN gefüllt und sichtbar protokolliert. Der Prüfschritt des Runners
-- sammelt sie (LLM-Prüfrunde + verbliebene [offene Stellen] im Dokument) und
-- legt sie strukturiert am Lauf ab — die Lauf-Karte, die Flow-Zentrale und die
-- externe API (n8n) zeigen sie im Ergebnis an.
--
--   flow_runs.annahmen — JSON-Array von Klartext-Sätzen; NULL = kein
--                        Prüfschritt gelaufen (z. B. Flow ohne Dokument-Ausgabe).
--
-- Down-Pfad (dokumentiert, nicht ausgeführt):
--   ALTER TABLE flow_runs DROP COLUMN annahmen;

ALTER TABLE flow_runs ADD COLUMN IF NOT EXISTS annahmen JSONB DEFAULT NULL;

COMMENT ON COLUMN flow_runs.annahmen IS
  'Annahmen-Protokoll des Prüfschritts (Plan 014 Phase 2): JSON-Array von Klartext-Annahmen; NULL = kein Prüfschritt';
