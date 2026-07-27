-- 120_flow_schedules.sql — Plan 013 · B8: Flow-Trigger (Zeitplan + Ereignis)
--
-- Zweck: Ein Flow soll nicht nur von Hand im Chat, sondern auch AUTOMATISCH
-- starten — zu festen Zeiten (Cron) oder auf ein benanntes Ereignis hin (z. B.
-- ein n8n-Webhook, der `POST /api/v1/external/events/:name` auslöst). Diese
-- Migration legt eine additive Tabelle an, aus der der Scheduler-Dienst
-- (`services/flows/scheduler.js`) fällige Läufe startet.
--
-- Eine Zeile = ein Auslöser für einen Flow. Ein Flow darf mehrere haben
-- (täglich UM 8 UND auf das Ereignis „neue-rechnung"). Der Flow wird über
-- seinen NAMEN referenziert, nicht über einen Fremdschlüssel: Flows sind
-- Dateien unter `data/flows/`, keine Zeilen (gleiche Linie wie flow_runs).
--
-- Forward-only und idempotent (IF NOT EXISTS / guarded DO-Block), damit ein
-- erneutes Ausführen folgenlos bleibt.
--
-- Rollback (down):
--   DROP TABLE IF EXISTS flow_schedules;

CREATE TABLE IF NOT EXISTS flow_schedules (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  -- Der Flow als Dateiname ohne .md. Wird der Flow gelöscht, bleibt der
  -- Auslöser bestehen und scheitert beim nächsten Feuern sichtbar (der
  -- Scheduler protokolliert das) — bewusst KEIN stiller Fremdschlüssel-Cascade.
  flow_name    VARCHAR(120) NOT NULL,
  -- 'zeitplan' → cron ist gesetzt; 'ereignis' → event_name ist gesetzt.
  trigger_type VARCHAR(16) NOT NULL CHECK (trigger_type IN ('zeitplan', 'ereignis')),
  -- 5-Feld-Cron (Minute Stunde Tag Monat Wochentag), ausgewertet in der lokalen
  -- Zeit des Geräts. Nur bei trigger_type='zeitplan' gesetzt.
  cron         VARCHAR(120),
  -- Name des Ereignisses, auf das dieser Auslöser hört. Nur bei
  -- trigger_type='ereignis' gesetzt. Frei wählbar, klein geschrieben.
  event_name   VARCHAR(120),
  -- Argumentwerte, die dem Flow bei jedem automatischen Start mitgegeben werden.
  args         JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  -- Nur bei Zeitplänen: der berechnete nächste Feuer-Zeitpunkt. Der Scheduler
  -- fragt „fällig?" allein über diese Spalte ab (WHERE next_run_at <= NOW()),
  -- statt jede Zeile jede Minute per Cron-Parser zu prüfen.
  next_run_at  TIMESTAMPTZ,
  last_run_at  TIMESTAMPTZ,
  -- Der zuletzt gestartete Lauf — für „zuletzt ausgelöst"-Anzeige. SET NULL,
  -- damit das Löschen alter Läufe den Auslöser nicht mitnimmt.
  last_run_id  BIGINT REFERENCES flow_runs(id) ON DELETE SET NULL,
  -- Kurze Ursache, falls der letzte automatische Start scheiterte (Flow weg,
  -- Pflicht-Argument fehlt). Kein Stacktrace.
  last_error   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Genau eines der beiden Felder passend zum Typ gesetzt: ein Zeitplan ohne
  -- cron oder ein Ereignis ohne Namen wäre ein toter Auslöser.
  CONSTRAINT flow_schedules_trigger_shape CHECK (
    (trigger_type = 'zeitplan' AND cron IS NOT NULL AND event_name IS NULL) OR
    (trigger_type = 'ereignis' AND event_name IS NOT NULL AND cron IS NULL)
  )
);

-- Die Fälligkeits-Abfrage des Ticks: aktive Zeitpläne, deren next_run_at
-- erreicht ist. Der Partial-Index hält ihn schlank (deaktivierte/Ereignis-
-- Auslöser stehen nicht drin).
CREATE INDEX IF NOT EXISTS idx_flow_schedules_faellig
  ON flow_schedules (next_run_at)
  WHERE enabled AND trigger_type = 'zeitplan';

-- Ereignis-Auslöser werden über ihren Namen nachgeschlagen.
CREATE INDEX IF NOT EXISTS idx_flow_schedules_ereignis
  ON flow_schedules (event_name)
  WHERE enabled AND trigger_type = 'ereignis';

-- Übersicht je Nutzer (neueste zuerst).
CREATE INDEX IF NOT EXISTS idx_flow_schedules_user
  ON flow_schedules (user_id, id DESC);
