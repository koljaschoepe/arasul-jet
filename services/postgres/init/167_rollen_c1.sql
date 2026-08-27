-- 167_rollen_c1.sql — zwei Rollen: admin und mitarbeiter
-- (Phase C1 des Ueberordner-Plans vom 26.08.2026)
--
-- Migration 068 hat `admin_users.role` als freien Text mit Vorgabe 'admin'
-- angelegt und 'viewer' als Zukunft genannt. Die Zukunft heisst
-- 'mitarbeiter': der Administrator verwaltet Mitarbeiter, Apps, Freigaben,
-- Modelle und den Betrieb; der Mitarbeiter sieht seine freigegebenen Apps,
-- Freigaben und eigenen Flow-Laeufe. `requireRole` im Backend prueft jede
-- Route gegen genau diese zwei Werte, also haelt die Datenbank sie auch.
--
-- Eine Zeile mit einem anderen Wert (auf keinem bekannten Geraet vorhanden;
-- der Wert war nie schreibbar) wird zum Mitarbeiter, nicht zum Admin: im
-- Zweifel die kleinere Berechtigung.

UPDATE public.admin_users SET role = 'mitarbeiter' WHERE role NOT IN ('admin', 'mitarbeiter');

ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_role_check CHECK (role IN ('admin', 'mitarbeiter'));

COMMENT ON COLUMN public.admin_users.role IS 'Rolle: admin (verwaltet) oder mitarbeiter (nutzt Freigegebenes); seit 167';
COMMENT ON TABLE public.admin_users IS 'Benutzer des Geraets: Administratoren und Mitarbeiter (seit 167)';
