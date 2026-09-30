-- 190_modelle_frei_geladen.sql — Jedes offene Modell laesst sich laden
-- (30.09.2026, Auftrag modelle-frei-herunterladbar, J4)
--
-- WARUM. Migration 175 (Phase C8, 27.08.2026) hat den Katalog zur Kurzliste
-- gemacht: vier Modelle, an diesem Geraet gemessen, und kein Weg daran vorbei.
-- Das war richtig, solange der Katalog eine Zusage ueber gemessene Modelle
-- sein sollte. Kunden und Partner wollen aber waehlen: Faktum fragte am
-- 25.09.2026 nach der KI, am 26.09.2026 ist zugesagt, dass weitere offene
-- Modelle ladbar sind (Kolja: "das soll wirklich komplett offen sein"). Die
-- Umkehr gilt fuer den KATALOG, nicht fuer die Vorgabe: der Standard bleibt
-- ein gemessenes Modell, und jedes andere traegt die Kennzeichnung
-- "ungemessen" (`jetson_tested = false`, die Spalte gibt es seit 011).
--
-- WAS DAZUKOMMT: `frei_geladen`. Die vier der Kurzliste stehen durch eine
-- Migration im Katalog und bleiben dort, auch wenn ihr Gewicht vom Geraet
-- geht. Ein frei geladenes Modell steht nur im Katalog, solange es geladen
-- ist: wer es entfernt, nimmt auch die Zeile mit, sonst fuellte sich der
-- Katalog mit Eintraegen fuer Gewichte, die niemand mehr hat -- dieselbe
-- Sorge, aus der der Abgleich seit C8 nichts mehr nachtraegt. Die Spalte sagt
-- dem Dienst, welche Zeilen ihm gehoeren.
--
-- Rollback (down):
--   ALTER TABLE public.llm_model_catalog DROP COLUMN IF EXISTS frei_geladen;

ALTER TABLE public.llm_model_catalog
  ADD COLUMN IF NOT EXISTS frei_geladen BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.llm_model_catalog.frei_geladen IS
  'true: die Zeile entstand beim Laden einer beliebigen Kennung (nicht aus der Kurzliste) und geht mit dem Entfernen des Modells wieder weg.';
