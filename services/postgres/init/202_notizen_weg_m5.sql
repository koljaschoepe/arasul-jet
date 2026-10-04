-- 202_notizen_weg_m5.sql -- Der Zettel faellt weg
-- (04.10.2026, M5, Auftrag handy-und-notizen-weg)
--
-- WARUM. Die rechte Spalte der Shell gibt es seit dem Umbau nicht mehr, und
-- mit dem Auftrag fallen auch Weg (/api/notizen), Dienst und Tests. Die
-- Tabelle aus Migration 177 hat danach keinen Leser und keinen Schreiber.
-- Was darin liegt, ist ein freier Text je Mensch, kein Betriebsstand.
--
-- Rollback (down): Migration 177 noch einmal laufen lassen (legt die leere
-- Tabelle wieder an; die Texte kommen nur aus einer Sicherung zurueck).

DROP TABLE IF EXISTS public.notizen;
