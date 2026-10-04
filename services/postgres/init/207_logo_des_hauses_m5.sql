-- 207_logo_des_hauses_m5.sql -- Das Logo des Hauses (04.10.2026, M5, Auftrag
-- verwaltung-geraet-und-system)
--
-- WARUM. Die Aktivitaetsleiste zeigt oben das Logo des Unternehmens, falls eines
-- hinterlegt ist (`company/frontend.md`, Rahmen). Bis hierher gab es am Geraet
-- keinen Ort dafuer. Es steht neben dem Namen (`company_name`, Migration 038) in
-- derselben Zeile: der Administrator hinterlegt beides unter Verwaltung, Geraet,
-- Unternehmen.
--
--   company_logo        die Datei selbst (PNG, JPEG oder WebP, hoechstens
--                       256 KB; das Backend prueft Art und Groesse)
--   company_logo_typ    ihr Medientyp, mit dem sie ausgeliefert wird
--   company_logo_stand  wann sie zuletzt gesetzt wurde; steht in der Adresse
--                       des Bildes, damit ein Browser nach einem Wechsel nicht
--                       die alte Datei aus seinem Zwischenspeicher zeigt
--
-- Kein SVG: ein SVG kann Skript tragen, und das Bild wird von derselben
-- Herkunft ausgeliefert wie die Oberflaeche.
--
-- Rollback (down): die drei Spalten fallen lassen; ohne sie zeigt die Leiste
-- kein Logo, sonst aendert sich nichts.

ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS company_logo BYTEA;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS company_logo_typ TEXT;
ALTER TABLE public.system_settings ADD COLUMN IF NOT EXISTS company_logo_stand TIMESTAMPTZ;
