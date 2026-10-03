-- 193_profil_person_m5.sql -- Profilfelder und Bild je Person
-- (03.10.2026, M5, Auftrag verwaltung-personen)
--
-- WAS DRINSTEHT. Eine Person ist bis hierher ein Benutzername mit Rolle. Die
-- Verwaltung legt sie jetzt mit Vorname, Nachname und E-Mail an, und jede
-- Person pflegt in den Einstellungen selbst: Funktion, Kuerzel, Bild.
--   vorname, nachname   Anzeigename; leer bei Konten aus der Zeit davor
--   funktion            frei, z. B. „Bauleitung"
--   kuerzel             hoechstens 8 Zeichen, z. B. „KS"
--   bild_typ, bild_daten  das Bild selbst (hoechstens 512 KB, png/jpeg/webp).
--                       Es liegt in der Datenbank und nicht im Dateisystem: es
--                       geht mit der Sicherung mit und faellt mit dem Konto.
--
-- BESTEHENDE ZEILEN bleiben leer. Der Benutzername zeigt sich dort weiter, bis
-- jemand Vor- und Nachname eintraegt.
--
-- Rollback (down):
--   ALTER TABLE public.admin_users
--     DROP COLUMN IF EXISTS vorname, DROP COLUMN IF EXISTS nachname,
--     DROP COLUMN IF EXISTS funktion, DROP COLUMN IF EXISTS kuerzel,
--     DROP COLUMN IF EXISTS bild_typ, DROP COLUMN IF EXISTS bild_daten;

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS vorname   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS nachname  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS funktion  VARCHAR(100),
  ADD COLUMN IF NOT EXISTS kuerzel   VARCHAR(8),
  ADD COLUMN IF NOT EXISTS bild_typ  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bild_daten BYTEA;

ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_bild_check;
ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_bild_check CHECK (
    (bild_daten IS NULL AND bild_typ IS NULL)
    OR (bild_daten IS NOT NULL AND bild_typ IN ('image/png', 'image/jpeg', 'image/webp')
        AND octet_length(bild_daten) <= 524288)
  );
