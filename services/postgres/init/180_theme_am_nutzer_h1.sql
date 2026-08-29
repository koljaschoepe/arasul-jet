-- 180_theme_am_nutzer_h1.sql — Das Theme gehoert dem Menschen, nicht dem Browser
-- (Phase H1 des Ueberordner-Plans vom 29.08.2026)
--
-- Bis hierher lag das Theme im `localStorage` des Browsers (`arasul_theme`).
-- Das heisst: derselbe Mensch an zwei Rechnern sieht zwei verschiedene Geraete,
-- ein geleerter Browserspeicher wirft seine Wahl weg, und die Wahl ist an das
-- Geraet gebunden, vor dem er zufaellig sitzt. Auf einer Standardsoftware, an
-- der sich Menschen mit E-Mail und Passwort anmelden, ist das die falsche
-- Zuordnung: was jemand eingestellt hat, gehoert zu ihm.
--
-- ZWEI WERTE, NICHT DREI. »Schwarz« faellt. Drei Themes hiessen drei Varianten
-- jeder Farbentscheidung und drei Spalten in jeder Abnahmetabelle, und zwei
-- davon (Schwarz, Dunkel) unterschieden sich um zwei Hintergrundstufen -- ein
-- Unterschied, den auf einem Bild niemand benennen kann. Es bleiben `light`
-- und `dark`.
--
-- WARUM `light` UND `dark` UND NICHT `hell`/`dunkel`. Derselbe Wert steht im
-- DOM als `data-theme` und in `index.css` als `[data-theme='dark']`. Ein
-- deutsches Wort in der Spalte hiesse eine Uebersetzung an jeder Grenze
-- zwischen Datenbank, Schnittstelle und Stylesheet -- also drei Stellen, an
-- denen zwei Vokabulare fuer denselben Zustand auseinanderlaufen koennen. Die
-- Oberflaeche beschriftet die zwei Optionen deutsch; das ist Text, kein Wert.
--
-- VORGABE IST `light`. Bisher war Schwarz die Vorgabe. Ein Geraet, das im Buero
-- bei Tageslicht steht und dessen Apps ein Partner mit dem Ara-Kit baut, faengt
-- hell an; wer es dunkel will, sagt es einmal.
--
-- BESTEHENDE ZEILEN BEKOMMEN `light`, also die Vorgabe. Der alte Wert liegt je
-- Browser im `localStorage` und laesst sich in SQL keinem Menschen zuordnen.
-- Uebernommen wird er trotzdem, aber dort, wo er liegt: die Oberflaeche liest
-- den Schluessel beim ersten angemeldeten Laden genau einmal, schreibt ihn
-- ueber `PUT /api/darstellung` und loescht ihn (`hooks/useTheme.ts`). Er steht
-- nur dann im Speicher, wenn jemand das Theme aktiv umgestellt hat -- die alte
-- Vorgabe wurde nie geschrieben --, also ist seine Anwesenheit eine
-- Entscheidung und keine Vermutung ueber die Vergangenheit. `black` und `dark`
-- werden dabei beide zu `dark`.
--
-- CHECK statt ENUM: dieselbe Linie wie `admin_users.role` (Migration 167). Ein
-- dritter Wert waere ein neues Theme, und das ist eine Aenderung an
-- `index.css`, also ohnehin eine Migration.
--
-- Rollback (down):
--   ALTER TABLE public.admin_users DROP COLUMN IF EXISTS theme;

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS theme VARCHAR(10) NOT NULL DEFAULT 'light';

ALTER TABLE public.admin_users DROP CONSTRAINT IF EXISTS admin_users_theme_check;
ALTER TABLE public.admin_users
  ADD CONSTRAINT admin_users_theme_check CHECK (theme IN ('light', 'dark'));

COMMENT ON COLUMN public.admin_users.theme IS
  'Darstellung der Oberflaeche fuer diesen Menschen: light (Vorgabe) oder dark (Phase H1).';
