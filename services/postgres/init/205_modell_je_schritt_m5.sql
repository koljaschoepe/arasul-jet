-- 205_modell_je_schritt_m5.sql -- Modell und Faehigkeiten je Schritt
-- (04.10.2026, M5, Auftrag modell-je-schritt)
--
-- WARUM. Kontrakt 8 kennt `faehigkeiten` je Schritt (Text, Bild, Werkzeuge,
-- Mindestkontext), und der Admin soll einen Schritt nur auf ein installiertes
-- Modell umstellen duerfen, das alle erfuellt. Dazu muss der Katalog zu jedem
-- Modell sagen koennen, was es kann.
--
-- WOHER DIE FAEHIGKEITEN DER MODELLE KOMMEN. Aus dem bestehenden Katalog, nichts
-- Neues ausgedacht:
--   text            model_type ist nicht `embedding`
--   bild            supports_vision_input (063, 175)
--   mindestkontext  context_window (101, vom Geraet aus /api/show gelesen, 133)
--   werkzeuge       NEU: supports_tools. Ollama meldet `tools` unter
--                   `capabilities` in /api/show; `modelProfile` liest es mit
--                   dem Steckbrief nach. Der Anfangswert hier ist an den
--                   installierten Modellen des Orin abgelesen (04.10.2026).
-- Unbekannt heisst `false` bzw. NULL, und beides schliesst aus: ein Modell, von
-- dem niemand weiss, ob es Werkzeuge ruft, bekommt keinen Schritt, der sie
-- braucht.
--
-- DIE WAHL JE SCHRITT liegt in `flow_schritt_modelle`, NICHT in der Flow-Datei
-- und nicht in `app_flows`: das Paket bringt beides mit jedem Update neu, die
-- Wahl des Admins soll es ueberleben (dieselbe Regel wie `flow_settings`, 173).
-- Ohne Stand, aus demselben Grund. Gespeichert wird nur eine Abweichung vom
-- Paket; "zurueck zum Paket" loescht die Zeile.
--
-- Rollback (down):
--   DROP TABLE IF EXISTS public.flow_schritt_modelle;
--   ALTER TABLE llm_model_catalog DROP COLUMN IF EXISTS supports_tools;

ALTER TABLE llm_model_catalog
  ADD COLUMN IF NOT EXISTS supports_tools BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN llm_model_catalog.supports_tools IS
  'Ruft das Modell Werkzeuge? Ollama meldet `tools` unter capabilities (/api/show); modelProfile liest es nach. Faehigkeit je Schritt (Kontrakt 8, Migration 205).';

UPDATE llm_model_catalog SET supports_tools = true
 WHERE id IN ('gemma4:e4b', 'qwen3.8:27b-q4_K_M', 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS');

CREATE TABLE IF NOT EXISTS public.flow_schritt_modelle (
  app_id        TEXT        NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  flow_name     TEXT        NOT NULL,
  schritt       TEXT        NOT NULL,
  modell        TEXT        NOT NULL,
  geaendert_am  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  geaendert_von BIGINT      REFERENCES public.admin_users(id) ON DELETE SET NULL,
  PRIMARY KEY (app_id, flow_name, schritt)
);

COMMENT ON TABLE public.flow_schritt_modelle IS
  'Das Modell, auf das der Admin einen Schritt eines Flows umgestellt hat. Nur Abweichungen vom Paket; ohne Stand, ueberlebt ein App-Update. Migration 205.';
