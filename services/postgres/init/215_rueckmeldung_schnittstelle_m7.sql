-- 215_rueckmeldung_schnittstelle_m7.sql -- Meldungen fuer das Kit, Bilder je App
--
-- Karte rueckmeldung-schnittstelle (J43, M7, 20.11.2026). Das Kit liest die
-- Rueckmeldungen einer App ueber die Schnittstelle des Geraets (Bereich
-- `feedback:agent` des Schluessels) und setzt ihren Stand. Vertrag:
-- docs/features/RUECKMELDUNG.md, Quelle company/schleife.md im Ueberordner
-- (Regel 3: Bilder verlassen das Haus nur mit Erlaubnis je App).
--
--   - `apps.bilder_an_agenten`: der Schalter „Bildschirmfotos an den Agenten“
--     je App, Vorgabe AUS. Ist er aus, enthaelt die Antwort an das Kit weder
--     Bild noch Markierung noch einen Verweis darauf. Im Geraet selbst sieht
--     ein Entwickler das Bild weiter.
--   - `rueckmeldungen.grund`: warum abgelehnt (Pflicht bei `abgelehnt`) oder
--     ein Satz zum Stand. `stand_geaendert_am` und `stand_geaendert_durch`
--     sagen, wann und mit welchem Schluessel (Praefix) oder von welcher
--     Person der Stand zuletzt gesetzt wurde.
--
-- Idempotent. Rueckweg:
--   ALTER TABLE public.apps DROP COLUMN IF EXISTS bilder_an_agenten;
--   ALTER TABLE public.rueckmeldungen DROP CONSTRAINT IF EXISTS rueckmeldungen_grund_bei_ablehnung;
--   ALTER TABLE public.rueckmeldungen DROP CONSTRAINT IF EXISTS rueckmeldungen_grund_laenge;
--   ALTER TABLE public.rueckmeldungen DROP COLUMN IF EXISTS grund,
--     DROP COLUMN IF EXISTS stand_geaendert_am, DROP COLUMN IF EXISTS stand_geaendert_durch;
--   DELETE FROM schema_migrations WHERE version = 215;

ALTER TABLE public.apps
  ADD COLUMN IF NOT EXISTS bilder_an_agenten BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.apps.bilder_an_agenten IS
  'Bildschirmfotos der Rückmeldungen gehen an den Agenten (Kit, J43). Vorgabe aus.';

ALTER TABLE public.rueckmeldungen
  ADD COLUMN IF NOT EXISTS grund TEXT,
  ADD COLUMN IF NOT EXISTS stand_geaendert_am TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stand_geaendert_durch TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rueckmeldungen_grund_laenge'
  ) THEN
    ALTER TABLE public.rueckmeldungen
      ADD CONSTRAINT rueckmeldungen_grund_laenge
      CHECK (grund IS NULL OR char_length(grund) BETWEEN 1 AND 2000);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rueckmeldungen_grund_bei_ablehnung'
  ) THEN
    ALTER TABLE public.rueckmeldungen
      ADD CONSTRAINT rueckmeldungen_grund_bei_ablehnung
      CHECK (stand_meldung <> 'abgelehnt' OR grund IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rueckmeldungen_app_stand
  ON public.rueckmeldungen (app_id, stand_meldung);

COMMENT ON COLUMN public.rueckmeldungen.grund IS
  'Grund zum Stand, Pflicht bei abgelehnt (J43)';
COMMENT ON COLUMN public.rueckmeldungen.stand_geaendert_durch IS
  'Wer den Stand zuletzt setzte: "schluessel:<praefix>" oder "person:<id>"';
