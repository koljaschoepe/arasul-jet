-- 176_ram_hebel_c8.sql — Phase C8: die RAM-Ueberlast bekommt wieder einen Hebel
--
-- WARUM
--
-- `recovery_actions.action_type` ist eine geschlossene Liste (Migration 003).
-- Sie kennt `llm_cache_clear`, `gpu_session_reset`, `gpu_throttle`,
-- `service_restart`, `disk_cleanup`, `db_vacuum`, `gpu_reset` und
-- `system_reboot`. Der neue Hebel der RAM-Ueberlast -- das geladene Modell aus
-- dem Speicher nehmen (Entscheidung 26.08.2026, ersetzt das Anhalten von n8n)
-- -- passt in keine davon.
--
-- Er koennte unter `llm_cache_clear` mitfahren; genau das waere aber die
-- falsche Auskunft. Unter diesem Namen laeuft der Hebel der CPU-Ueberlast, und
-- die beiden treffen verschiedene Entscheidungen: der eine raeumt auf, weil die
-- CPU haengt, der andere gibt 16 GB frei, weil der Speicher vollaeuft. Wer
-- spaeter in `recovery_actions` nachsieht, warum ein Lauf sein Modell neu laden
-- musste, soll die beiden auseinanderhalten koennen.
--
-- Die CHECK-Bedingung wird ersetzt, nicht erweitert -- Postgres kennt kein
-- "ADD VALUE" fuer eine CHECK-Liste. Bestehende Zeilen erfuellen die neue
-- Bedingung, sie ist eine echte Obermenge.

-- Nicht ueber den vermuteten Namen, sondern ueber den gefundenen: Postgres
-- benennt eine Spalten-CHECK zwar `<tabelle>_<spalte>_check`, aber ein Geraet,
-- auf dem die Tabelle einmal von Hand angefasst wurde, traegt womoeglich einen
-- anderen Namen -- und dann liefe das ADD unten in einen Konflikt mit einer
-- Bedingung, die niemand mehr sieht.
DO $$
DECLARE
  bedingung text;
BEGIN
  FOR bedingung IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public'
       AND t.relname = 'recovery_actions'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) LIKE '%llm_cache_clear%'
  LOOP
    EXECUTE format('ALTER TABLE public.recovery_actions DROP CONSTRAINT %I', bedingung);
  END LOOP;
END $$;

ALTER TABLE public.recovery_actions
  ADD CONSTRAINT recovery_actions_action_type_check
  CHECK (action_type IN (
    'llm_cache_clear', 'gpu_session_reset', 'gpu_throttle', 'service_restart',
    'disk_cleanup', 'db_vacuum', 'gpu_reset', 'system_reboot',
    'model_unload'
  ));

COMMENT ON COLUMN public.recovery_actions.action_type IS
  'Welche Massnahme lief. model_unload: bei RAM-Ueberlast das geladene Modell '
  'aus dem Speicher genommen (Phase C8). Der Idle-Unload nach KEEP_ALIVE steht '
  'hier NICHT -- er ist der Normalbetrieb von Ollama, keine Selbstheilung.';
