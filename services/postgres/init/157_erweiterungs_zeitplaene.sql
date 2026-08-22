-- 157_erweiterungs_zeitplaene.sql — Plan 023 H1: zeitgesteuerte Ausführung
--
-- Eine Erweiterung darf einen Flow zu einer festen Uhrzeit laufen lassen
-- (nächtliche Abgleiche). Was läuft, ist ein Flow — Arasuls eigene, prüfbare
-- Ausführungsebene, nicht beliebiger Code der Erweiterung.
--
-- Ein Zeitplan gehört IMMER einer Erweiterung, deshalb die Fremdschlüssel mit
-- ON DELETE CASCADE: eine verwaiste Zeile liefe sonst nachts weiter, ohne dass
-- jemand sie zuordnen kann.
--
-- `extensions` liegt in `arasul`, nicht in `public` (siehe Migration 090 und
-- den Abschnitt „Zwei Schemata, ein search_path" in services/postgres/CLAUDE.md).
-- Ein unqualifiziertes REFERENCES extensions(id) hätte hier nur zufällig
-- funktioniert.
--
-- Ausdrücklich schema-qualifiziert: ab Migration 090 landet jedes
-- unqualifizierte CREATE TABLE in `arasul`, nicht in `public`.

CREATE TABLE IF NOT EXISTS public.extension_zeitplaene (
  id            BIGSERIAL PRIMARY KEY,
  extension_id  TEXT NOT NULL REFERENCES arasul.extensions(id) ON DELETE CASCADE,
  -- Der Flow, der laufen soll (Name wie im Chat-Slash-Befehl).
  flow          TEXT NOT NULL,
  -- Uhrzeit in Gerätezeit, "HH:MM". Kein voller Cron-Ausdruck: „einmal
  -- nachts" ist der Fall aus dem Plan, und ein Cron-Parser wäre eine
  -- Fehlerquelle für einen Nutzen, den niemand belegt hat.
  uhrzeit       TEXT NOT NULL,
  -- Feste Argumente für jeden Lauf.
  args          JSONB NOT NULL DEFAULT '{}'::jsonb,
  aktiv         BOOLEAN NOT NULL DEFAULT TRUE,
  -- Wann zuletzt gestartet, und mit welchem Ergebnis. Ohne diese beiden
  -- Spalten wäre nach einer Nacht nicht feststellbar, ob etwas passiert ist.
  zuletzt_am    TIMESTAMPTZ,
  zuletzt_lauf  BIGINT,
  letzter_fehler TEXT,
  angelegt_am   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (extension_id, flow, uhrzeit)
);

CREATE INDEX IF NOT EXISTS idx_extension_zeitplaene_aktiv
  ON public.extension_zeitplaene(aktiv, uhrzeit);
