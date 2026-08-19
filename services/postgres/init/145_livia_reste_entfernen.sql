-- Migration 145: Reste des Projekts livia entfernen
--
-- Sechs Tabellen mit dem Praefix avatar_ liegen im Schema arasul. Sie stammen
-- aus dem Projekt livia, das nie Teil von Arasul war und im August 2026 vom
-- Geraet genommen wurde. Kein Erzeuger, kein Leser: eine Suche ueber apps/,
-- services/ und scripts/ findet am 2026-08-19 null Treffer auf avatar_, und
-- keine Migration hat sie je angelegt. Sie sind von Hand in die Datenbank
-- geschrieben worden.
--
-- Anlass, sie jetzt zu entfernen: der Werksreset aus Plan 023 B5 verweigert den
-- Dienst, solange eine Tabelle in der Datenbank steht, die er nicht einordnen
-- kann. Diese sechs sind die einzigen. Sie einzuordnen hiesse, ein fremdes
-- Projekt dauerhaft in der Klassifikation zu fuehren.

DROP TABLE IF EXISTS arasul.avatar_best_slot CASCADE;
DROP TABLE IF EXISTS arasul.avatar_render_queue CASCADE;
DROP TABLE IF EXISTS arasul.avatar_script_history CASCADE;
DROP TABLE IF EXISTS arasul.avatar_topic_weight CASCADE;
DROP TABLE IF EXISTS arasul.avatar_video_performance CASCADE;
DROP TABLE IF EXISTS arasul.avatar_weekly_report CASCADE;
