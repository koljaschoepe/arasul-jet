-- 217_app_symbol_ersatz_m7.sql -- ein Symbol, das der Admin einer App gibt
--
-- Karte palette-symbol-und-demo (J51, M7, 21.11.2026). Seit dieser Karte
-- verlangt der App-Standard beim Ausrollen `symbol` in app.json. Apps, die
-- schon laufen, bleiben unberuehrt; viele davon nennen keines, und die Leiste
-- zeichnete sie alle mit demselben Fenster.
--
--   - `apps.symbol_ersatz`: das Symbol, das der Administrator in der
--     Verwaltung (Apps, Seite der App) waehlt. Es gilt, bis die App selbst
--     eines mitbringt: `GET /api/apps/meine` nimmt zuerst das Symbol des
--     Livestands, dann das des Teststands, dann diesen Wert. Dieselbe Form
--     wie im Manifest (Lucide-Name oder Kuerzel), geprueft vom Backend.
--
-- Idempotent. Rueckweg:
--   ALTER TABLE public.apps DROP COLUMN IF EXISTS symbol_ersatz;
--   DELETE FROM schema_migrations WHERE version = 217;

ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS symbol_ersatz TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'apps_symbol_ersatz_laenge'
  ) THEN
    ALTER TABLE public.apps
      ADD CONSTRAINT apps_symbol_ersatz_laenge CHECK (symbol_ersatz IS NULL OR length(symbol_ersatz) <= 50);
  END IF;
END $$;

COMMENT ON COLUMN public.apps.symbol_ersatz IS
  'Symbol der Leiste, vom Admin gewählt (J51). Gilt, bis die App in app.json eines mitbringt.';
