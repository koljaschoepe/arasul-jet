-- 218_werkstatt_m7.sql -- das Entwickler-Cockpit heisst Werkstatt
--
-- Karte werkstatt-und-rechte (J52, M7, 22.11.2026). Die mitgelieferte App
-- heisst seit dieser Karte Werkstatt, Kennung `werkstatt`, Adresse
-- `/apps/werkstatt/`. Die alte Adresse `/apps/entwickler-cockpit/` leitet um
-- (routes/appAusliefern.js). Jeder mit Zugang sieht dort seine eigenen
-- Meldungen mit Stand, wer das Recht hat (`admin_users.entwickler`), alle.
--
--   - Meldungen ZU der App selbst (Rueckmeldung ueber dem Cockpit) tragen
--     die neue Kennung, damit sie im Filter unter „Werkstatt" stehen und
--     nicht unter einer App, die es nicht mehr gibt. Die Seite zieht mit.
--   - Ein Index je Person: die Werkstatt fragt ohne das Recht nur
--     `WHERE person_id = $1`.
--
-- Idempotent: ein zweiter Lauf findet keine Zeile mit der alten Kennung.
-- Rueckweg:
--   UPDATE public.rueckmeldungen
--      SET app_id = 'entwickler-cockpit',
--          seite = regexp_replace(seite, '^/apps/werkstatt/', '/apps/entwickler-cockpit/')
--    WHERE app_id = 'werkstatt';
--   DROP INDEX IF EXISTS public.idx_rueckmeldungen_person_zeit;
--   DELETE FROM schema_migrations WHERE version = 218;
-- (Eine echte App mit der Kennung `werkstatt` kann es nicht geben: das
-- Manifest weist sie ab, schemas/apps.js `MITGELIEFERTE_APPS`.)

UPDATE public.rueckmeldungen
   SET app_id = 'werkstatt',
       seite = regexp_replace(seite, '^/apps/entwickler-cockpit/', '/apps/werkstatt/')
 WHERE app_id = 'entwickler-cockpit';

CREATE INDEX IF NOT EXISTS idx_rueckmeldungen_person_zeit
  ON public.rueckmeldungen (person_id, erstellt_am DESC);

COMMENT ON TABLE public.rueckmeldungen IS
  'Rückmeldungen aus dem Rahmen über jeder App (J42, M7). Jeder liest seine eigenen, alle nur mit admin_users.entwickler (Recht in der Werkstatt, J52).';
