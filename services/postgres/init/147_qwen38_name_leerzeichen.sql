-- 147_qwen38_name_leerzeichen.sql — Plan 023 D1: ein Muster fuer alle Namen
--
-- Der Katalog schreibt Familie und Version getrennt: "Gemma 3 1B", "Qwen 3 32B",
-- "Qwen 3 Coder 30B", "Llama 3.1 8B". Ein einziger Eintrag bricht das Muster:
-- "Qwen3.8 27B", gesetzt in Migration 141.
--
-- Das ist nicht nur Kosmetik. Das Namensregister im Frontend
-- (utils/modelDisplay.ts) leitet einen Namen ab, wenn der Katalog keinen
-- liefert, und es leitet nach demselben Muster ab. Solange der Katalog anders
-- schreibt als die Ableitung, heisst dasselbe Modell je nach Weg
-- "Qwen3.8 27B" oder "Qwen 3.8 27B". Genau die Sorte Abweichung soll D1
-- beenden.
--
-- Nur solange der Name noch der aus 141 ist, damit eine spaetere Umbenennung
-- von Hand nicht ueberschrieben wird. Zweitlauf trifft die Zeile nicht mehr.

UPDATE llm_model_catalog SET name = 'Qwen 3.8 27B', updated_at = NOW()
 WHERE id = 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS' AND name = 'Qwen3.8 27B';
