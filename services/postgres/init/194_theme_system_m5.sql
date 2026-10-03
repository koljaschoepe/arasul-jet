-- 194_theme_system_m5.sql -- das Erscheinungsbild darf „System" sein
-- (03.10.2026, M5, Auftrag einstellungen-persoenlich)
--
-- Die Einstellungen kennen drei Wahlen: System, hell, dunkel. `system` heisst,
-- der Browser entscheidet nach der Einstellung des Betriebssystems; die
-- Oberflaeche loest es zu `light` oder `dark` auf, bevor sie `data-theme`
-- schreibt. Die Vorgabe bleibt `light`: bestehende Zeilen aendern sich nicht.
--
-- Rollback (down):
--   UPDATE public.admin_users SET theme = 'light' WHERE theme = 'system';
--   ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_theme_check;
--   ALTER TABLE public.admin_users
--     ADD CONSTRAINT admin_users_theme_check CHECK (theme IN ('light', 'dark'));

ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_theme_check;
ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_theme_check CHECK (theme IN ('light', 'dark', 'system'));

COMMENT ON COLUMN public.admin_users.theme IS
  'Darstellung der Oberflaeche fuer diesen Menschen: light (Vorgabe), dark oder system (nach dem Betriebssystem).';
