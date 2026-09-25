-- 187_ki_aufrufe.sql — Jeder Modellaufruf ueber die Schnittstelle steht im
-- Protokoll des Geraets (26.09.2026, J35, Auftrag ki-aufrufe-einer-app-im-protokoll)
--
-- WARUM. Ein Flow hinterlaesst einen Lauf mit Schritten (C6, D4), und darin
-- steht, welches Modell was gesagt hat. Ein Aufruf von
-- `document/extract-structured` ist KEIN Flow: bis hierher standen Modell und
-- Zeit nur im Protokoll der App selbst (App-Probe probe-faktum-belege, Faktum-
-- Anforderung 10). Eine Kanzlei muss nachweisen, welches Modell welchen
-- Vorschlag gemacht hat, und will das nicht jeder App ueberlassen.
--
-- WAS DRINSTEHT: wer (App, Stand, Mensch), wann, womit (Modell, Weg), wie lange,
-- wie es ausging -- und NICHTS vom Inhalt. Kein Dateiname, kein Text, kein
-- Prompt, keine Antwort. Von der Antwort steht nur ihr sha256 da: damit laesst
-- sich ein Vorschlag, den die App aufbewahrt hat, diesem Aufruf zuordnen, ohne
-- dass das Geraet ihn ein zweites Mal speichert.
--
-- KEIN FREMDSCHLUESSEL auf `admin_users`, `api_keys` oder `apps`: ein Nachweis
-- ueberlebt den Menschen, den Schluessel (der einer App wuerfelt jedes
-- Einspielen neu) und die App. Deshalb steht der Name als Abschrift daneben.
--
-- NICHT `api_audit_logs`: das ist ein Zugriffslog mit Nutzlast, es wird nach
-- Frist aufgeraeumt, und ein Modell kennt es nicht.
--
-- Rollback (down):
--   DROP TABLE IF EXISTS public.ki_aufrufe;

CREATE TABLE IF NOT EXISTS public.ki_aufrufe (
  id              BIGSERIAL PRIMARY KEY,
  begonnen_am     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  beendet_am      TIMESTAMPTZ DEFAULT NULL,
  dauer_ms        INTEGER DEFAULT NULL,
  -- NULL beide: der Schluessel eines Menschen. Zusammen gesetzt oder
  -- zusammen leer, wie am Schluessel (Migration 171).
  app_id          TEXT DEFAULT NULL,
  stand           TEXT DEFAULT NULL,
  schluessel_name TEXT DEFAULT NULL,
  -- Der Mensch, fuer den die App fragt (aus `X-Arasul-User`), oder bei einem
  -- Schluessel eines Menschen dessen Besitzer.
  benutzer_id     BIGINT DEFAULT NULL,
  benutzer_name   TEXT DEFAULT NULL,
  -- Der Weg relativ zur Schnittstelle, z. B. `document/extract-structured`.
  endpunkt        TEXT NOT NULL,
  modell          TEXT DEFAULT NULL,
  job_id          UUID DEFAULT NULL,
  status          TEXT NOT NULL DEFAULT 'laeuft',
  fehler          TEXT DEFAULT NULL,
  antwort_sha256  TEXT DEFAULT NULL,
  -- Art und Groesse der Datei, nicht ihr Name: der Name ist oft schon Inhalt
  -- („Kuendigung_Mueller.pdf").
  datei_typ       TEXT DEFAULT NULL,
  datei_bytes     INTEGER DEFAULT NULL,
  CONSTRAINT ki_aufrufe_status_chk CHECK (status IN ('laeuft', 'fertig', 'fehler')),
  CONSTRAINT ki_aufrufe_stand_chk CHECK (
    -- `stand IS NOT NULL` ausdruecklich: ein CHECK, der NULL ergibt, gilt als
    -- erfuellt, und `NULL IN (...)` ist NULL.
    (app_id IS NULL AND stand IS NULL)
    OR (app_id IS NOT NULL AND stand IS NOT NULL AND stand IN ('test', 'live'))
  )
);

CREATE INDEX IF NOT EXISTS idx_ki_aufrufe_app
  ON public.ki_aufrufe (app_id, begonnen_am DESC);
CREATE INDEX IF NOT EXISTS idx_ki_aufrufe_begonnen
  ON public.ki_aufrufe (begonnen_am DESC);

COMMENT ON TABLE public.ki_aufrufe IS
  'Jeder Modellaufruf ueber die externe Schnittstelle: wer, wann, welches Modell, wie lange. Ohne Inhalt.';
