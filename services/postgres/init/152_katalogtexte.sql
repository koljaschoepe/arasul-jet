-- 152_katalogtexte.sql — Plan 023 D5: was in den Beschreibungen nicht stimmt
--
-- Der Beschreibungstext einer Kachel ist das, was der Kunde im Katalog liest.
-- Am 21.08.2026 gegen die Gewichte und gegen die Messung geprueft:
--
-- 1. gemma3:4b behauptet "32K Kontext". Das Modell meldet 131072, also 128K.
--    Die Angabe ist um Faktor vier zu niedrig, und seit Plan 023 D2 steht der
--    gemessene Wert auf derselben Seite darunter. Zwei Zahlen, eine Kachel.
--
-- 2. Zwei Beschreibungen tragen einen Gedankenstrich als Trenner. Regel 1 des
--    Plans verbietet das "weder in der Oberflaeche noch im Code, noch in der
--    Dokumentation", und der Waechter `gedankenstriche.py` hat die SQL-Dateien
--    bis heute nicht durchsucht. Der Kunde liest sie auf jeder Kachel.
--
-- NICHT geaendert wird "~35 tok/s auf dem Orin" bei qwen3-coder:30b. Der erste
-- Verdacht war, die Zahl sei zu hoch: die Detailseite zeigte 6,6. Nachgemessen
-- war die ANZEIGE falsch, nicht die Beschreibung. Warm gemessen macht das
-- Modell 41,9 Token je Sekunde, aus der Historie 28,8; die Anzeige rechnete
-- die Wartezeit mit. Die Beschreibung bleibt, die Anzeige ist repariert.
--
-- Nur solange der Text der bekannte ist, damit eine Aenderung von Hand nicht
-- ueberschrieben wird. Zweitlauf trifft die Zeilen nicht mehr.

UPDATE llm_model_catalog
   SET description = 'Kompaktes Google-Modell ohne Vision. Sehr schnell, gute Qualität für Alltagsfragen. 128K Kontext.',
       updated_at = NOW()
 WHERE id = 'gemma3:4b'
   AND description = 'Kompaktes Google-Modell ohne Vision. Sehr schnell, gute Qualität für Alltagsfragen. 32K Kontext.';

UPDATE llm_model_catalog
   SET description = 'Qwen3-Coder 30B (MoE, 3B aktiv), ein Modell für agentisches Programmieren: Qualität der 32B-Klasse bei etwa 35 Token je Sekunde auf dem Orin. Standard-Modell des Coding-Agenten.',
       updated_at = NOW()
 WHERE id = 'qwen3-coder:30b'
   AND description LIKE '%—%';

UPDATE llm_model_catalog
   SET description = 'Neues dichtes 27B-Modell (Hybrid-Attention: lineare und volle Layer, 256K Kontext) mit Developer-Rolle für agentische Tools. Höhere Qualität bei langem Kontext, aber deutlich langsamer als der MoE-Coder, deshalb als Alternative wählbar.',
       updated_at = NOW()
 WHERE id = 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS'
   AND description LIKE '%—%';
