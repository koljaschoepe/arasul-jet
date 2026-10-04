-- 198_flow_abschluss_m5.sql -- Der Abschluss eines Flows: Uebergabe an die App
-- (04.10.2026, M5, Auftrag flow-abschluss-ueber-app)
--
-- WARUM. Das Zielbild (frontend.md, Flows und Freigaben, Punkt Abschluss): nach
-- der letzten Stufe uebergibt der Flow das Ergebnis an eine Route der App. Der
-- Lauf ist erst abgeschlossen, wenn die App den Empfang bestaetigt; sonst steht
-- er auf `nicht_uebergeben`, und ein Admin loest die Uebergabe mit „erneut" noch
-- einmal aus, ohne dass die Schritte neu laufen.
--
-- WAS DRINSTEHT.
--   flow_run_status 'nicht_uebergeben'
--                        das Ergebnis steht, die App hat den Empfang nicht
--                        bestaetigt. Kein Fehler des Flows und noch nicht
--                        abgeschlossen: der Zustand haelt, bis die App antwortet.
--   flow_runs.abschluss  {route, versuche, letzter_versuch, status_code, fehler,
--                        uebergeben_am}. NULL = der Flow hat keine Abschluss-
--                        Route (Verhalten wie bisher). Die Zeile entsteht VOR
--                        dem ersten Aufruf: ein Lauf, der mitten in der
--                        Uebergabe stirbt, ist nach einem Neustart
--                        `nicht_uebergeben` und nicht `fehler`, denn sein
--                        Ergebnis (flow_runs.result) steht schon.
--
-- Rollback (down):
--   ALTER TABLE flow_runs DROP COLUMN IF EXISTS abschluss;
--   -- Der Enum-Wert bleibt (siehe 174), er stoert nicht.

ALTER TYPE flow_run_status ADD VALUE IF NOT EXISTS 'nicht_uebergeben';

ALTER TABLE flow_runs ADD COLUMN IF NOT EXISTS abschluss JSONB;

COMMENT ON COLUMN flow_runs.abschluss IS
  'Uebergabe an die Abschluss-Route der App: {route, versuche, letzter_versuch, status_code, fehler, uebergeben_am}. NULL = Flow ohne Abschluss-Route. Migration 198.';
