-- 212_theme_bestand_system_m5.sql -- auch bestehende Konten folgen dem System
--
-- Migration 210 hat die Vorgabe fuer NEUE Konten auf `system` gesetzt und die
-- bestehenden bei ihrem Wert gelassen, weil ein gespeichertes `light` von
-- einer Wahl nicht zu unterscheiden ist. Am 07.10.2026 hat Kolja entschieden,
-- dass auch sie dem System folgen (company/frontend.md, Einstellungen: „Vorgabe
-- System, auch fuer bestehende Konten"): fast jedes `light` ist die alte
-- Vorgabe aus Migration 180 und keine Wahl. Wer hell oder dunkel will, waehlt
-- es danach in den Einstellungen unter Erscheinungsbild neu.
--
-- Laeuft genau einmal (schema_migrations), danach gilt wieder, was jemand
-- waehlt. Idempotent: ein zweiter Lauf findet nichts mehr zu aendern.
--
-- Rueckweg: keiner automatisch; die frueheren Werte sind nicht aufbewahrt, es
-- waren nur `light` und `dark`.

UPDATE public.admin_users SET theme = 'system' WHERE theme IS DISTINCT FROM 'system';
