-- 112_skill_runs.sql — Plan 011 · Schritt 9: Läufe persistent machen
--
-- Zweck: Ein Skill-Lauf soll das Schließen des Browser-Tabs überleben. Bisher
-- lebt ein Lauf nur im Speicher des Requests — bricht die Verbindung ab, ist er
-- weg. Diese Migration legt zwei rein additive Tabellen an, in die der Runner
-- (Schritt 10) und die Subagenten (Schritt 11) fortlaufend schreiben:
--
--   * skill_runs        — ein Lauf: welcher Skill, welche Argumente, Status,
--                         Ergebnis, Zeiten. Eine Zeile je Aufruf von /name.
--   * skill_run_steps   — die einzelnen Schritte EINES Laufs, in Reihenfolge:
--                         jeder Werkzeug-Aufruf, jeder Subagent-Aufruf, jede
--                         Modell-Antwort. Das ist der Verlauf, den die Lauf-Karte
--                         (Schritt 15) und die Live-Übertragung (Schritt 12)
--                         zeigen — und der beim Wiederverbinden nachgeladen wird.
--
-- Warum ZWEI Tabellen statt eines JSONB-Feldes am Lauf: Die Schritte entstehen
-- EINZELN, während der Lauf läuft, und werden EINZELN live übertragen. Ein
-- wachsendes JSONB-Array müsste bei jedem Schritt komplett neu geschrieben
-- werden (read-modify-write, Sperre auf der Lauf-Zeile) — bei einem langen
-- Recherche-Lauf mit Dutzenden Schritten ist das teuer und anfällig für
-- verlorene Schreibvorgänge. Eine Zeile je Schritt wird nur angehängt.
--
-- WICHTIG (§3 Kontext-Sparsamkeit): In skill_run_steps landen bewusst auch die
-- ROHDATEN eines Schritts (Seiteninhalt, Dateitext) — aber NUR hier, im
-- Protokoll. Sie sind für die Nachschau da. In den Orchestrator-Kontext gelangt
-- ausschließlich das verdichtete Ergebnis (Schritt 11). Das Protokoll ist der
-- Ort, an dem man sehen kann, was ein Subagent wirklich gelesen hat, ohne dass
-- es je das Modell geflutet hätte.
--
-- Forward-only und idempotent (CREATE TABLE/INDEX/TYPE IF NOT EXISTS), damit ein
-- erneutes Ausführen folgenlos bleibt.
--
-- Rollback (down):
--   DROP TABLE IF EXISTS skill_run_steps;
--   DROP TABLE IF EXISTS skill_runs;
--   DROP TYPE  IF EXISTS skill_run_status;
--   DROP TYPE  IF EXISTS skill_step_kind;

-- ---------------------------------------------------------------------------
-- Aufzählungstypen. Bewusst als ENUM statt freier TEXT-Spalte: Der Status
-- eines Laufs kennt genau diese Zustände, und ein Tippfehler soll an der DB
-- scheitern, nicht still eine Zeile mit unbekanntem Status hinterlassen.
-- IF NOT EXISTS gibt es für CREATE TYPE nicht — deshalb der DO-Block.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_run_status') THEN
    CREATE TYPE skill_run_status AS ENUM ('laeuft', 'fertig', 'fehler', 'abgebrochen');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_step_kind') THEN
    CREATE TYPE skill_step_kind AS ENUM ('werkzeug', 'subagent', 'modell', 'hinweis');
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- skill_runs — ein Lauf
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skill_runs (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  -- Der Skill wird über seinen Namen (Dateiname ohne .md) referenziert, NICHT
  -- über einen Fremdschlüssel: Skills sind Dateien, keine Zeilen. Der Name wird
  -- mitgeschrieben, damit ein Lauf auch dann lesbar bleibt, wenn der Skill
  -- später umbenannt oder gelöscht wird.
  skill_name   VARCHAR(120) NOT NULL,
  -- Die Chat-Unterhaltung, aus der der Lauf gestartet wurde — für die Anzeige
  -- der Lauf-Karte im richtigen Verlauf. Nullable: ein Lauf kann auch ohne
  -- Chat-Kontext existieren (z. B. Test). ON DELETE SET NULL statt CASCADE:
  -- Wird die Unterhaltung gelöscht, bleibt der Lauf als Historie erhalten,
  -- nur die Verknüpfung entfällt.
  conversation_id BIGINT REFERENCES chat_conversations(id) ON DELETE SET NULL,
  arguments    JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       skill_run_status NOT NULL DEFAULT 'laeuft',
  -- Das an den Nutzer gerichtete Endergebnis (die Antwort des Skills). Erst
  -- gesetzt, wenn der Lauf 'fertig' ist.
  result       TEXT,
  -- Kurze Fehlerursache, wenn status = 'fehler'. Kein Stacktrace — das gehört
  -- ins Log, nicht in die Nutzer-sichtbare Zeile.
  error        TEXT,
  -- Gesamtzähler der Werkzeug-/Subagent-Runden über alle Ebenen (Schritt 11).
  -- Hier mitgeführt, damit ein wiederaufgenommener Lauf die Grenze kennt.
  steps_used   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Wann der Lauf endete (fertig/fehler/abgebrochen). NULL solange er läuft.
  finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_skill_runs_user_id ON skill_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_runs_conversation ON skill_runs(conversation_id);
-- Für den Abbruch-Pfad und Aufräumarbeiten: welche Läufe laufen noch?
CREATE INDEX IF NOT EXISTS idx_skill_runs_status ON skill_runs(status) WHERE status = 'laeuft';

COMMENT ON TABLE skill_runs IS
  'Skill-Läufe (Plan 011, Schritt 9): ein Lauf je Aufruf von /name. Überlebt das Schließen des Tabs, damit die Live-Übertragung wiederverbinden kann.';
COMMENT ON COLUMN skill_runs.skill_name IS
  'Name des Skills (Dateiname ohne .md). Kein Fremdschlüssel — Skills sind Dateien; der Name bleibt lesbar, auch wenn der Skill später verschwindet.';
COMMENT ON COLUMN skill_runs.status IS
  'laeuft | fertig | fehler | abgebrochen. Genau ein laufender Lauf pro Aufruf; der Abbruch-Pfad setzt abgebrochen.';

-- ---------------------------------------------------------------------------
-- skill_run_steps — die Schritte eines Laufs, in Reihenfolge
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skill_run_steps (
  id           BIGSERIAL PRIMARY KEY,
  run_id       BIGINT NOT NULL REFERENCES skill_runs(id) ON DELETE CASCADE,
  -- Fortlaufende Position innerhalb des Laufs (0,1,2,…). Zusammen mit run_id
  -- eindeutig — so ist die Reihenfolge stabil, auch wenn zwei Schritte in
  -- derselben Millisekunde entstehen.
  position     INTEGER NOT NULL,
  kind         skill_step_kind NOT NULL,
  -- Womit: Werkzeugname ('web_suche'), Rollenname eines Subagenten ('leser'),
  -- oder leer bei einer Modell-Antwort.
  name         VARCHAR(120) NOT NULL DEFAULT '',
  -- Der Auftrag/die Eingabe dieses Schritts (Werkzeug-Parameter, Subagent-Auftrag).
  input        JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Das VERDICHTETE Ergebnis des Schritts — das, was in den Orchestrator-Kontext
  -- fließt (bei Subagenten der Ergebnis-Vertrag, Schritt 11).
  output       TEXT,
  -- Die ROHDATEN (Seiteninhalt, Dateitext). NUR fürs Protokoll, erreichen den
  -- Orchestrator-Kontext nie. Nullable, weil nicht jeder Schritt Rohdaten hat.
  raw_output   TEXT,
  status       skill_run_status NOT NULL DEFAULT 'laeuft',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ,
  CONSTRAINT skill_run_steps_run_pos_uniq UNIQUE (run_id, position)
);

CREATE INDEX IF NOT EXISTS idx_skill_run_steps_run_id ON skill_run_steps(run_id);

COMMENT ON TABLE skill_run_steps IS
  'Einzelne Schritte eines Skill-Laufs (Plan 011, Schritt 9): je Werkzeug-/Subagent-/Modell-Schritt eine Zeile, angehängt statt ein wachsendes JSONB neu zu schreiben.';
COMMENT ON COLUMN skill_run_steps.output IS
  'Verdichtetes Ergebnis — fließt in den Orchestrator-Kontext (bei Subagenten der Ergebnis-Vertrag).';
COMMENT ON COLUMN skill_run_steps.raw_output IS
  'Rohdaten (Seiteninhalt/Dateitext). NUR fürs Protokoll (§3): erreichen den Modell-Kontext nie, sind aber für die Nachschau sichtbar.';
