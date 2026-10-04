-- 200_flow_aktiv_m5.sql -- Der Schalter "aktiv" je Flow einer App
-- (04.10.2026, M5, Auftrag verwaltung-app-seite)
--
-- WARUM. Das Zielbild (frontend.md, Verwaltung > Apps): je Flow Schritte, Art,
-- Ausloeser und ein Schalter "aktiv". Ein ausgeschalteter Flow startet nicht,
-- das Backend weist den Start mit 409 `FLOW_INAKTIV` ab; ein Lauf, der schon
-- laeuft oder auf eine Freigabe wartet, geht zu Ende.
--
-- WIE. Wie Modell und Art in `flow_settings` und nicht in der Datei: die
-- Entscheidung des Admins ueberlebt ein App-Update. Ohne Stand, sie gilt dem
-- Flow. NULL = aktiv (so lief jeder Flow bisher), `false` = aus. Ein `true`
-- wird nie gespeichert: zwei Schreibweisen fuer "aktiv" waeren eine Stelle,
-- an der ein Vergleich eines Tages danebengreift, und eine Zeile, die nur noch
-- "aktiv" traegt, faellt weg wie eine ohne Modell und Art.
--
-- Rollback (down):
--   ALTER TABLE public.flow_settings DROP COLUMN IF EXISTS aktiv;

ALTER TABLE public.flow_settings
  ADD COLUMN IF NOT EXISTS aktiv BOOLEAN
    CHECK (aktiv IS NULL OR aktiv = false);

COMMENT ON COLUMN public.flow_settings.aktiv IS
  'Vom Admin ausgeschaltet (false) oder aktiv (NULL). Ein inaktiver Flow startet nicht (409 FLOW_INAKTIV). Migration 200.';
