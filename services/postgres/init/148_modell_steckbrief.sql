-- 148_modell_steckbrief.sql — Plan 023 D2: Felder fuer den Steckbrief
--
-- Die Detailseite eines Modells soll sagen, wie gross es ist, wie es
-- quantisiert ist, unter welcher Lizenz es steht und wie lang sein Kontext
-- wirklich ist. Nichts davon steht heute im Katalog.
--
-- Ausgedacht wird nichts. Die Werte kommen aus Ollamas /api/show auf diesem
-- Geraet, also aus den Gewichten selbst, und werden beim Modell-Abgleich
-- geschrieben. `profile_read_at` haelt fest, wann; ohne diesen Zeitstempel
-- waere nicht unterscheidbar, ob ein leeres Feld nie gelesen wurde oder ob das
-- Modell die Angabe nicht traegt.
--
-- Fuer die Kontextlaenge gibt es bewusst KEINE zweite Spalte. `context_window`
-- ist die Spalte dafuer, sie steht heute nur bei 15 von 24 Eintraegen und
-- widerspricht bei mindestens einem der Messung (qwen3:14b-q8 behauptet 32768,
-- das Modell meldet 40960). Eine zweite Spalte daneben waere genau der Fehler,
-- den D1 gerade beseitigt hat.

ALTER TABLE llm_model_catalog
  ADD COLUMN IF NOT EXISTS parameter_label  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS quantization     VARCHAR(30),
  ADD COLUMN IF NOT EXISTS license          VARCHAR(120),
  ADD COLUMN IF NOT EXISTS profile_read_at  TIMESTAMPTZ;

COMMENT ON COLUMN llm_model_catalog.parameter_label IS
  'Parametergroesse, wie Ollama sie meldet, z. B. "27.3B". Gemessen, nicht gepflegt.';
COMMENT ON COLUMN llm_model_catalog.quantization IS
  'Quantisierung der installierten Gewichte, z. B. "IQ4_XS".';
COMMENT ON COLUMN llm_model_catalog.license IS
  'Lizenzbezeichnung aus den Gewichten, z. B. "Apache License 2.0".';
COMMENT ON COLUMN llm_model_catalog.profile_read_at IS
  'Wann der Steckbrief zuletzt aus Ollama gelesen wurde. NULL = noch nie.';
