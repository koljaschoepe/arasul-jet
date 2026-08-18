-- 143_modellnamen_vereinheitlichen.sql — UI-Sweep-Fix F1: einheitliche Anzeigenamen
--
-- Drei Katalogeinträge tragen ihre rohe Ollama-Id als `name` (Direkt-Pull; der
-- Sync setzt bei unbekannten Modellen keinen sauberen Namen — siehe auch
-- Migration 142/importUnknownModels). Composer UND StatusBar zeigen darum
-- "qwen3-coder:30b" / "llava-phi3" / "qwen3:14b-nothink" ZWISCHEN den bereits
-- normalisierten Namen ("Qwen 3 8B", "Gemma 4 Kompakt"). Das widerspricht der
-- Vorgabe „ein Modell heißt überall gleich".
--
-- Fix: saubere Anzeigenamen setzen — aber NUR solange der Name noch die rohe Id
-- ist, damit eine spätere manuelle Umbenennung nicht überschrieben wird. Damit
-- ist die Migration idempotent (Zweitlauf trifft die Zeile nicht mehr) und tut
-- auf frischen Boxen ohne diese Direkt-Pulls schlicht nichts.

UPDATE llm_model_catalog SET name = 'Qwen 3 Coder 30B', updated_at = NOW()
 WHERE id = 'qwen3-coder:30b' AND name = 'qwen3-coder:30b';

UPDATE llm_model_catalog SET name = 'Qwen 3 14B (schnell)', updated_at = NOW()
 WHERE id = 'qwen3:14b-nothink' AND name = 'qwen3:14b-nothink';

UPDATE llm_model_catalog SET name = 'LLaVA Phi-3', updated_at = NOW()
 WHERE id = 'llava-phi3' AND name = 'llava-phi3';
