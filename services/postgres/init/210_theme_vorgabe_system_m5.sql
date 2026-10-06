-- 210_theme_vorgabe_system_m5.sql -- neue Konten folgen dem System
--
-- Die Vorgabe war `light` (Migration 180). Die Verkaufs-Vorgabe lautet „hell
-- mit dunklem Thema nach System": wer nichts gewaehlt hat, bekommt den
-- Dunkelmodus seines Rechners. Bestehende Konten behalten ihren Wert, denn
-- ein gespeichertes `light` ist von einer Wahl nicht zu unterscheiden.
--
-- Rueckweg (manuell):
--   ALTER TABLE public.admin_users ALTER COLUMN theme SET DEFAULT 'light';

ALTER TABLE public.admin_users ALTER COLUMN theme SET DEFAULT 'system';
