-- 204_ereignis_ausloeser_m5.sql -- Ein Ereignis der App startet Flows
-- (04.10.2026, M5, Auftrag ereignis-und-app-routen)
--
-- WARUM. Ein Flow mit `ausloeser: [{typ: ereignis, ereignis: <name>}]`
-- (Kontrakt 8) lief bisher nie; das Geraet nahm den Eintrag an und tat nichts.
-- Jetzt meldet die App ein Ereignis ueber ihren Schluessel
-- (`POST /api/v1/external/ereignisse/:name`), und das Geraet startet jeden
-- Flow ihres Standes, der darauf hoert.
--
-- ZWEI DINGE an `flow_runs`:
--
--   ausloeser   darf jetzt auch `ereignis` sein (vorher `hand`, `zeitplan`).
--   ereignis    der Name des Ereignisses, das den Lauf gestartet hat; NULL bei
--               jedem anderen Ausloeser. Die Daten des Ereignisses stehen als
--               Argumente des Laufs in `arguments`, nicht hier.
--
-- Rollback (down):
--   ALTER TABLE flow_runs DROP CONSTRAINT IF EXISTS flow_runs_ausloeser_check;
--   ALTER TABLE flow_runs ADD CONSTRAINT flow_runs_ausloeser_check
--     CHECK (ausloeser IN ('hand', 'zeitplan'));
--   ALTER TABLE flow_runs DROP COLUMN IF EXISTS ereignis;

-- flow_runs liegt je nach Vorgeschichte in `arasul` oder `public` (siehe 173);
-- unqualifiziert, wie 203, findet es der search_path in beiden Faellen.
ALTER TABLE flow_runs DROP CONSTRAINT IF EXISTS flow_runs_ausloeser_check;
ALTER TABLE flow_runs
  ADD CONSTRAINT flow_runs_ausloeser_check CHECK (ausloeser IN ('hand', 'zeitplan', 'ereignis'));

ALTER TABLE flow_runs
  ADD COLUMN IF NOT EXISTS ereignis TEXT;

COMMENT ON COLUMN flow_runs.ausloeser IS
  'Wodurch der Lauf entstand: hand (ein Mensch oder die App stiess ihn an), zeitplan (der Zeitplaner des Geraets, ohne Einreicher) oder ereignis (die App meldete ein Ereignis, Name in flow_runs.ereignis). Migrationen 203, 204.';

COMMENT ON COLUMN flow_runs.ereignis IS
  'Der Name des Ereignisses, das den Lauf gestartet hat (ausloeser = ereignis), sonst NULL. Migration 204.';
