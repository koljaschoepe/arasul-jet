-- 113_skill_run_changes.sql — Plan 011 · Schritt 16: Änderungs-Übersicht
--
-- Zweck: Ein Skill darf Dateien OHNE Rückfrage schreiben und löschen (Schreib-
-- Werkzeug und Terminal). Die Gegenleistung ist Nachvollziehbarkeit — am Ende
-- eines Laufs soll lückenlos sichtbar sein, was sich geändert hat (neu,
-- geändert, gelöscht) mit Vorher/Nachher.
--
-- Der Runner (Schritt 10) macht dafür vor und nach dem Lauf je einen Abzug der
-- erlaubten Ordner und legt die Differenz hier ab (services/skills/changeTracker.js).
-- Eine einzelne, gedeckelte JSONB-Spalte am Lauf genügt: Die Übersicht entsteht
-- EINMAL beim Abschluss, nicht fortlaufend — der Grund gegen JSONB in Schritt 9
-- (viele Einzel-Schreibvorgänge) gilt hier also NICHT. Die Vorschauen sind pro
-- Datei und in der Zahl gedeckelt, damit die Zeile klein bleibt.
--
-- Der Plan nannte diese Spalte an Migration 112. Da 112 bereits ausgerollt ist
-- und Migrationen forward-only sind, kommt sie als eigene, additive Migration —
-- inhaltlich dieselbe Zusage, sauber nachgezogen.
--
-- Forward-only und idempotent (ADD COLUMN IF NOT EXISTS).
--
-- Rollback (down):
--   ALTER TABLE skill_runs DROP COLUMN IF EXISTS changes;

ALTER TABLE skill_runs
  ADD COLUMN IF NOT EXISTS changes JSONB;

COMMENT ON COLUMN skill_runs.changes IS
  'Datei-Änderungen des Laufs (Plan 011, Schritt 16): [{pfad, art (neu|geaendert|geloescht), vorher, nachher, gekuerzt, hinweis}]. Aus dem Ordner-Abzug vor/nach dem Lauf; gedeckelt in Zahl und Vorschau-Länge. NULL = nicht ermittelt (Lauf ohne Schreib-Werkzeug).';
