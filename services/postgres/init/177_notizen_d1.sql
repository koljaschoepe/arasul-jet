-- 177_notizen_d1.sql — Die rechte Spalte bekommt einen Ort
-- (Phase D1 des Ueberordner-Plans vom 26.08.2026)
--
-- Das Zielbild der Shell steht seit Beschluss 10 vom 26.08.2026 fest: links
-- Apps, Mitte Dashboard oder App, rechts Notizen. Die rechte Spalte steht seit
-- Phase B2 leer da ("Noch nichts hier"), weil Agent-Chat und Terminal, die
-- vorher darin lagen, aus der Oberflaeche gefallen sind. Hier bekommt sie das,
-- was sie tragen soll.
--
-- EINE ZEILE JE MENSCH, kein Notizbuch mit vielen Blaettern. Die rechte Spalte
-- ist ein Zettel neben der Arbeit, kein zweites Dokumentensystem; das Repo hat
-- eines gehabt (`documents`, Migration 009) und es in Phase B2 wieder
-- ausgebaut. Wer mehrere Blaetter braucht, braucht eine App dafuer.
--
-- Der Primaerschluessel IST die Benutzernummer. Damit gibt es die Frage "welche
-- der Notizen dieses Menschen ist die richtige" gar nicht erst, und das
-- Speichern ist ein INSERT ... ON CONFLICT statt eines Lesens mit
-- anschliessendem Schreiben.
--
-- ON DELETE CASCADE: die Notiz eines geloeschten Menschen ist sein Text und
-- geht mit ihm. `benutzerService.loescheBenutzer` raeumt heute jede Tabelle
-- einzeln ab; der Fremdschluessel nimmt ihm diese hier ab, so wie bei
-- `app_members` (Migration 168).
--
-- Rollback (down):
--   DROP TABLE IF EXISTS public.notizen;

CREATE TABLE IF NOT EXISTS public.notizen (
  user_id       BIGINT PRIMARY KEY
                REFERENCES public.admin_users(id) ON DELETE CASCADE,
  -- Nie NULL: "keine Notiz" und "leere Notiz" sind derselbe Zustand, und zwei
  -- Schreibweisen fuer einen Zustand sind eine Fehlerquelle ohne Gegenwert.
  inhalt        TEXT NOT NULL DEFAULT '',
  geaendert_am  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.notizen IS
  'Der Zettel in der rechten Spalte der Shell, einer je Mensch (Phase D1).';
COMMENT ON COLUMN public.notizen.inhalt IS
  'Freier Text. Laengengrenze setzt die Schnittstelle (schemas/notizen.js), nicht die Spalte.';
