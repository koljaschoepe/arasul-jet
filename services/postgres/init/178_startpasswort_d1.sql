-- 178_startpasswort_d1.sql — Ein fremd gesetztes Passwort ist ein Startpasswort
-- (Phase D1 des Ueberordner-Plans vom 26.08.2026)
--
-- Phase C2 hat den Weg gebaut, auf dem ein Administrator einem Mitarbeiter ein
-- Passwort setzt (`PUT /api/benutzer/:id/passwort`), ohne das alte zu kennen.
-- Was danach fehlte: der Mitarbeiter meldet sich damit an und arbeitet weiter
-- mit einem Passwort, das ein anderer Mensch kennt. Auf einem Geraet, das fuenf
-- Jahre unbeaufsichtigt laufen soll, bleibt das dann fuenf Jahre so.
--
-- Diese Spalte haelt genau eine Tatsache fest: das aktuelle Passwort hat jemand
-- ANDERES gesetzt. Solange sie `true` ist, verlangt die Oberflaeche nach der
-- Anmeldung einen Wechsel, und `POST /api/auth/change-password` setzt sie
-- zurueck -- die eine Stelle, an der ein Mensch sein eigenes Passwort schreibt.
--
-- WARUM KEINE ZEITSTEMPEL-REGEL ("Passwort aelter als 90 Tage"). Das waere ein
-- anderer Gegenstand: eine Ablauffrist erzwingt Wechsel, ohne dass etwas
-- passiert ist, und produziert Passwoerter mit angehaengter Zahl. Hier geht es
-- um den Fall, in dem ein Zweiter das Passwort kennt. Der endet, sobald der
-- Betroffene es einmal selbst gewaehlt hat.
--
-- BESTEHENDE ZEILEN BEKOMMEN `false`, nicht `true`. Auf einem gewachsenen
-- Geraet weiss niemand mehr, wer welches Passwort gesetzt hat; jeden beim
-- naechsten Anmelden zum Wechsel zu zwingen waere eine Behauptung ueber die
-- Vergangenheit, die diese Spalte nicht belegen kann. Sie gilt ab hier.
-- Der beim Bootstrap angelegte Administrator eines FRISCHEN Geraets kommt
-- dagegen mit `true` herein (`bootstrap.js`): sein Passwort steht einmal auf
-- dem Bildschirm der Installation und ist damit ein Startpasswort im Wortsinn.
--
-- Rollback (down):
--   ALTER TABLE public.admin_users DROP COLUMN IF EXISTS passwort_vom_admin;

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS passwort_vom_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.admin_users.passwort_vom_admin IS
  'true = das aktuelle Passwort hat ein anderer gesetzt; die Oberflaeche verlangt einen Wechsel (Phase D1).';
