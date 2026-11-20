-- 214_rueckmeldungen_m7.sql -- die Rueckmeldung im Rahmen
--
-- Karte rueckmeldung-im-rahmen (J42, M7, 20.11.2026). Der Rahmen von Arasul
-- zeigt ueber jeder App ein Icon; ein Mitarbeiter schreibt dort freien Text
-- und markiert eine Stelle auf einem Bildschirmfoto der Seite. Vertrag:
-- docs/features/RUECKMELDUNG.md, Quelle company/schleife.md im Ueberordner.
--
-- Was hier steht und was nicht:
--   - Text, App, Stand, Adresse der Seite im iframe, Person, Zeit, Stand der
--     Meldung. Die Person haengt mit ON DELETE SET NULL: wird sie geloescht,
--     bleibt die Meldung ohne Namen stehen, wie die Protokolle
--     (benutzerService.loescheBenutzer).
--   - Das BILD steht NICHT in der Datenbank, sondern als Datei unter
--     `<APPS_DIR>/.rueckmeldungen/<bild>` am Geraet. Dort geht es mit dem Baum
--     der Apps in den naechtlichen Stand (services/backup-service/staende.sh),
--     ohne dass die Sicherung eine neue Art lernen muss. Die Spalte `bild`
--     nennt nur den Dateinamen; der Dienst baut den Pfad und prueft ihn.
--   - `app_id` ohne Fremdschluessel auf `apps`: eine Meldung zu einer App, die
--     spaeter entfernt wird, ist weiter eine Auskunft fuer den Entwickler.
--   - `stand_meldung` kennt schon die vier Staende aus schleife.md (neu,
--     angenommen, umgesetzt, abgelehnt). Gesetzt wird heute nur `neu`; die
--     anderen setzt die Schnittstelle der Karte rueckmeldung-schnittstelle (J43).
--
-- Idempotent. Rueckweg:
--   DROP TABLE IF EXISTS public.rueckmeldungen;
--   DELETE FROM schema_migrations WHERE version = 214;
--   und am Geraet den Ordner data/apps/.rueckmeldungen entfernen.

CREATE TABLE IF NOT EXISTS public.rueckmeldungen (
  id             BIGSERIAL PRIMARY KEY,
  app_id         TEXT NOT NULL,
  stand          TEXT NOT NULL,
  seite          TEXT NOT NULL,
  text           TEXT NOT NULL,
  bild           TEXT,
  markierung     JSONB,
  person_id      BIGINT REFERENCES public.admin_users(id) ON DELETE SET NULL,
  stand_meldung  TEXT NOT NULL DEFAULT 'neu',
  erstellt_am    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rueckmeldungen_stand CHECK (stand IN ('test', 'live')),
  CONSTRAINT rueckmeldungen_stand_meldung
    CHECK (stand_meldung IN ('neu', 'angenommen', 'umgesetzt', 'abgelehnt')),
  CONSTRAINT rueckmeldungen_text_laenge CHECK (char_length(text) BETWEEN 1 AND 5000),
  CONSTRAINT rueckmeldungen_seite_laenge CHECK (char_length(seite) BETWEEN 1 AND 2000),
  CONSTRAINT rueckmeldungen_bild_name CHECK (bild IS NULL OR bild ~ '^[a-f0-9-]{36}\.png$')
);

CREATE INDEX IF NOT EXISTS idx_rueckmeldungen_app_zeit
  ON public.rueckmeldungen (app_id, erstellt_am DESC);

COMMENT ON TABLE public.rueckmeldungen IS
  'Rückmeldungen aus dem Rahmen über jeder App (J42, M7). Lesen nur mit admin_users.entwickler.';
COMMENT ON COLUMN public.rueckmeldungen.bild IS
  'Dateiname unter <APPS_DIR>/.rueckmeldungen, NULL ohne Bildschirmfoto';
