-- 213_entwickler_terminal_m5.sql -- die Rolle Entwickler, Schalter fuer das Terminal
--
-- Karte terminal-im-frontend (M5, 21.10.2026). Ein Entwickler oeffnet in der
-- Oberflaeche ein Terminal in seinem eigenen Ordner am Geraet und startet dort
-- Claude Code. Rahmen aus dem Beschluss vom 20.10.2026: nur fuer die Rolle
-- Entwickler, Standard aus, der Administrator schaltet je Person frei.
--
-- Ein Schalter NEBEN der Rolle und keine dritte Rolle: `role` entscheidet
-- weiter, ob jemand die Verwaltung sieht (admin/mitarbeiter, Migration 167).
-- Ein Administrator ist nicht von selbst Entwickler und ein Entwickler nicht
-- von selbst Administrator; beides sind getrennte Freigaben.
--
-- Die Trennung am Geraet macht nicht diese Spalte, sondern Linux: je Person
-- ein eigener Nutzer `ara-<id>` ohne sudo und ohne Docker
-- (scripts/terminal/, docs/features/TERMINAL.md). Die Spalte sagt nur, ob die
-- Tuer zum Terminal fuer diese Person offen ist.
--
-- Idempotent. Rueckweg: `ALTER TABLE admin_users DROP COLUMN entwickler`.

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS entwickler BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.admin_users.entwickler IS
  'Rolle Entwickler: darf das Terminal oeffnen (Karte terminal-im-frontend, M5). Standard aus.';
