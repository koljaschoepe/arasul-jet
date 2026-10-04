-- 199_live_schalten_m5.sql -- Live schalten mit Sicherung und Rueckfall
-- (04.10.2026, M5, Auftrag live-schalten-mit-sicherung)
--
-- WARUM. Das Zielbild (frontend.md, Flows und Freigaben, Punkt Test und Live):
-- der Admin schaltet live, vorher sichert Arasul die Datenbank der App, und
-- scheitert die Strukturaenderung der neuen Fassung, schaltet es selbst
-- zurueck. Dazu sieht der Admin beim Schalten, was der Entwickler beim
-- Ausrollen ueber diese Fassung geschrieben hat (Kontrakt 8).
--
-- WAS DRINSTEHT.
--   app_staende.aenderungstext
--                        der Text, den das Kit beim Ausrollen neben das Paket
--                        legt. Gehoert zum Stand, nicht zur Version: der
--                        Teststand traegt ihn ab dem Ausrollen, der Livestand
--                        bekommt ihn beim Schalten mit. NULL = kein Text.
--   app_schaltungen      je Versuch, live zu schalten, eine Zeile: von welcher
--                        Fassung auf welche, welcher Stand der Sicherung davor
--                        entstand, und wie es ausging. `ergebnis`:
--                          laeuft            der Versuch ist im Gang
--                          live              die neue Fassung laeuft
--                          zurueckgeschaltet die neue Fassung kam nicht hoch;
--                                            Fassung UND Daten von vorher
--                          nicht_gesichert   die Sicherung davor misslang;
--                                            nichts geschaltet
--                          fehlgeschlagen    auch der Rueckfall misslang
--                        `technik` haelt fest, was ein Mensch nur aufgeklappt
--                        liest: Grund, Exit-Code, letzte Zeilen des Containers.
--
-- Rollback (down):
--   DROP TABLE IF EXISTS app_schaltungen;
--   ALTER TABLE app_staende DROP COLUMN IF EXISTS aenderungstext;

ALTER TABLE public.app_staende
  ADD COLUMN IF NOT EXISTS aenderungstext TEXT;

COMMENT ON COLUMN public.app_staende.aenderungstext IS
  'Was der Entwickler beim Ausrollen ueber diese Fassung schrieb (Kontrakt 8); NULL = kein Text. Seit 199';

CREATE TABLE IF NOT EXISTS public.app_schaltungen (
  id             BIGSERIAL PRIMARY KEY,
  app_id         TEXT NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  von_version    TEXT,
  nach_version   TEXT NOT NULL,
  ergebnis       TEXT NOT NULL DEFAULT 'laeuft'
                 CHECK (ergebnis IN ('laeuft', 'live', 'zurueckgeschaltet', 'nicht_gesichert', 'fehlgeschlagen')),
  sicherung_id   TEXT,
  satz           TEXT,
  hilfe          TEXT,
  technik        JSONB,
  durch          BIGINT REFERENCES public.admin_users(id) ON DELETE SET NULL,
  begonnen_am    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  beendet_am     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_app_schaltungen_app
  ON public.app_schaltungen (app_id, begonnen_am DESC);

COMMENT ON TABLE public.app_schaltungen IS
  'Je Versuch, eine Fassung live zu schalten, eine Zeile: Sicherung davor, Ergebnis, Satz fuer den Admin, Technik. Seit 199';
