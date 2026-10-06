-- 211_lauf_titel_m5.sql -- ein kurzer Titel je Lauf (06.10.2026, M5, Kontrakt 14)
--
-- WARUM. Zwei Freigabekarten „Erkennung unsicher: Felder konto, buchungstext"
-- waren im Handtest vom 06.10.2026 nicht zu unterscheiden: keine Karte nannte
-- Lieferant, Betrag oder Nummer. Der Lauf traegt jetzt einen kurzen Titel, den
-- die App beim Start mitgibt (`titel`) oder den das Geraet aus den erkannten
-- Feldern bildet; jede Freigabe des Laufs steht mit ihm vorn.
--
-- Rollback (down):
--   ALTER TABLE flow_runs DROP CONSTRAINT IF EXISTS flow_runs_titel_laenge;
--   ALTER TABLE flow_runs DROP COLUMN IF EXISTS titel;

-- flow_runs liegt je nach Vorgeschichte in `arasul` oder `public` (siehe 173);
-- unqualifiziert, wie 203 und 204, findet es der search_path in beiden Faellen.
ALTER TABLE flow_runs
  ADD COLUMN IF NOT EXISTS titel TEXT;

ALTER TABLE flow_runs DROP CONSTRAINT IF EXISTS flow_runs_titel_laenge;
ALTER TABLE flow_runs
  ADD CONSTRAINT flow_runs_titel_laenge CHECK (titel IS NULL OR char_length(titel) <= 120);

COMMENT ON COLUMN flow_runs.titel IS
  'Kurzer Titel des Laufs fuer die Freigabekarten: von der App beim Start (titel) oder aus den erkannten Feldern gebildet, sonst NULL. Migration 211.';
