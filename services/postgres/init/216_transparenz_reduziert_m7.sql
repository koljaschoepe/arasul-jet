-- 216_transparenz_reduziert_m7.sql -- „Transparenz reduzieren“ je Person
--
-- Karte glas-grundton-bibliothek (J48, M7, 20.11.2026). Schwebende
-- Bedienflaechen (Menues, Aufklappfelder, kurze Meldungen) sind seit der
-- Bibliothek 5.7.0 aus Glas. Wer das nicht moechte, stellt in den
-- Einstellungen unter Erscheinungsbild „Transparenz reduzieren“ ein; die
-- Oberflaeche setzt dann `data-transparenz="reduziert"` am `<html>` der Shell
-- und jeder App im Rahmen, und Glas wird deckend. Die Systemwuensche (weniger
-- Transparenz, mehr Kontrast) gelten ohnehin, ohne diese Spalte.
--
-- Geschrieben ueber `PUT /api/darstellung`, gelesen mit der Sitzung
-- (`/auth/session`, `/auth/me`, Anmeldung) wie `theme`.
--
-- Idempotent. Rueckweg:
--   ALTER TABLE public.admin_users DROP COLUMN IF EXISTS transparenz_reduziert;
--   DELETE FROM schema_migrations WHERE version = 216;

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS transparenz_reduziert BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.admin_users.transparenz_reduziert IS
  'Glas deckend zeichnen (Einstellungen, Erscheinungsbild). Vorgabe aus.';
