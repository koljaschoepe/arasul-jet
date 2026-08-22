-- 156_erweiterungs_tabellen.sql — Plan 023 H1: eigene Tabellen je Erweiterung
--
-- Eine Erweiterung darf Zustand ablegen, aber nicht neben den Kundendaten.
-- Deshalb je Erweiterung ein eigenes Schema `ext_<slug>`; die Tabellen darin
-- entstehen zur Laufzeit über die Brücke (`bruecke/tabellen`), nicht hier.
--
-- Diese Migration legt nur das Register an: welche Tabelle gehört welcher
-- Erweiterung, mit welchen Spalten. Ohne das Register wäre nach einer
-- Deinstallation nicht mehr feststellbar, was aufzuräumen ist, und ein
-- `DROP SCHEMA` müsste raten.
--
-- Ausdrücklich schema-qualifiziert: ab Migration 090 landet jedes
-- unqualifizierte CREATE TABLE in `arasul`, nicht in `public`.

CREATE TABLE IF NOT EXISTS public.extension_tabellen (
  id            BIGSERIAL PRIMARY KEY,
  extension_id  TEXT NOT NULL,
  -- Der Name, den die Erweiterung kennt (ohne Schema-Präfix).
  name          TEXT NOT NULL,
  -- Spalten als JSON: [{"name":"beleg_nr","typ":"text"}, …]. Die erlaubten
  -- Typen stehen im Backend (`tabellenService`), nicht hier: eine Prüfung in
  -- der Datenbank wäre eine zweite Wahrheit neben der im Code.
  spalten       JSONB NOT NULL DEFAULT '[]'::jsonb,
  angelegt_am   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (extension_id, name)
);

CREATE INDEX IF NOT EXISTS idx_extension_tabellen_ext
  ON public.extension_tabellen(extension_id);
