-- 201_app_reihenfolge_m5.sql -- Die Reihenfolge der Apps in der Aktivitaetsleiste
-- (04.10.2026, M5, Auftrag apps-im-hintergrund-und-sortieren)
--
-- WARUM. Jeder ordnet seine Apps durch Ziehen (frontend.md, Rahmen). Die
-- Reihenfolge gehoert dem Menschen und liegt am Geraet, nicht im Browser: sie
-- gilt an jedem Rechner und geht mit der Sicherung mit.
--
-- WIE. Eine Liste von `<kennung>:<stand>` in der Zeile der Person. Was nicht
-- darin steht (neu freigegeben), kommt dahinter; was darin steht und nicht mehr
-- freigegeben ist, wird von der Oberflaeche ueberlesen.
--
-- Rollback (down):
--   ALTER TABLE public.admin_users DROP COLUMN IF EXISTS app_reihenfolge;

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS app_reihenfolge JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(app_reihenfolge) = 'array');

COMMENT ON COLUMN public.admin_users.app_reihenfolge IS
  'Reihenfolge der Apps in der Aktivitaetsleiste dieser Person, Liste von "<kennung>:<stand>". Migration 201.';
