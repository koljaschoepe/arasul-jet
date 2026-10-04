-- 197_freigabe_korrekturfelder_m5.sql -- Felder einer Freigabe, Vorschlag und Korrektur
-- (04.10.2026, M5, Auftrag freigabe-korrekturfelder)
--
-- WARUM. Wer eine Erkennung freigibt, korrigiert lieber ein Feld, als abzulehnen
-- und neu zu starten. Das Zielbild (frontend.md, Flows und Freigaben, Ansicht
-- der Freigabe): erkannte Felder rechts, aenderbar, wo die App es erlaubt;
-- gespeichert wird, was die KI vorschlug und was der Mensch aenderte.
--
-- WAS DRINSTEHT.
--   approvals.felder          die erkannten Felder, wie die KI sie vorschlug:
--                             [{name, vorschlag, unsicher, fehlend, aenderbar}].
--                             Aenderbar ist, was die Rolle im Flow-Kopf unter
--                             `ergebnis.aenderbar` nennt (Kontrakt 10). NULL =
--                             die Freigabe traegt keine Felder.
--   approvals.felder_schritt  der Schritt der Kette, aus dem die Felder kommen;
--                             mit ihm setzt der Lauf nach der Bestaetigung den
--                             geaenderten Wert ein, auch nach einem Neustart.
--   approvals.original        das Original (Bild oder PDF) als Pfad relativ zur
--                             Adresse der App, z. B. `api/belege/4711.png`.
--   approvals.korrekturen     was der Mensch beim Bestaetigen aenderte:
--                             [{feld, vorschlag, wert, von, von_id, am}], in
--                             DERSELBEN Anweisung geschrieben wie die
--                             Entscheidung. NULL = nichts geaendert.
--
-- JSON an der Anfrage und keine eigene Tabelle: eine Korrektur gibt es nur mit
-- ihrer Entscheidung, und eine Anweisung, die beides schreibt, laesst kein
-- Fenster, in dem die Entscheidung ohne ihre Korrektur dasteht.
--
-- Rollback (down):
--   ALTER TABLE public.approvals DROP COLUMN IF EXISTS korrekturen;
--   ALTER TABLE public.approvals DROP COLUMN IF EXISTS original;
--   ALTER TABLE public.approvals DROP COLUMN IF EXISTS felder_schritt;
--   ALTER TABLE public.approvals DROP COLUMN IF EXISTS felder;

ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS felder JSONB;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS felder_schritt TEXT;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS original TEXT;
ALTER TABLE public.approvals ADD COLUMN IF NOT EXISTS korrekturen JSONB;

COMMENT ON COLUMN public.approvals.felder IS
  'Erkannte Felder, wie die KI sie vorschlug: [{name, vorschlag, unsicher, fehlend, aenderbar}]. Migration 197.';
COMMENT ON COLUMN public.approvals.felder_schritt IS
  'Schritt der Kette, aus dem die Felder stammen; dort setzt der Lauf die Korrektur ein. Migration 197.';
COMMENT ON COLUMN public.approvals.original IS
  'Original (Bild/PDF) als Pfad relativ zur Adresse der App. Migration 197.';
COMMENT ON COLUMN public.approvals.korrekturen IS
  'Beim Bestaetigen geaenderte Felder: [{feld, vorschlag, wert, von, von_id, am}]. Migration 197.';
