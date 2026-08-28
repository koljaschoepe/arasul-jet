-- 179_flow_extern_und_kein_assistent_d4.sql — die Flow-Ansicht bekommt ihr
-- Datenmodell, der Einrichtungsassistent verliert seines
-- (Phase D4 des Ueberordner-Plans vom 26.08.2026)
--
-- ZWEI SACHEN IN EINER MIGRATION, und beide gehoeren zu derselben Phase:
-- D4 baut die Ansicht, in der ein Administrator einen Flow auf ein externes
-- Modell umstellt, und streicht den Assistenten, der bis heute vor der Shell
-- stand. Das eine ergaenzt eine Spalte, das andere nimmt vier weg.
--
-- Rollback (down):
--   ALTER TABLE public.flow_settings DROP COLUMN extern_basis_url;
--   ALTER TABLE public.system_settings
--     ADD COLUMN setup_completed BOOLEAN NOT NULL DEFAULT FALSE,
--     ADD COLUMN setup_completed_at TIMESTAMPTZ,
--     ADD COLUMN setup_completed_by INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
--     ADD COLUMN setup_step INTEGER DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 1. flow_settings.extern_basis_url — wohin der Aufruf geht
-- ---------------------------------------------------------------------------
-- Migration 173 hat vier `extern_`-Spalten angelegt und dabei ausdruecklich
-- gesagt, sie seien "das Datenmodell fuer die D-Phasen". Beim Bauen der Ansicht
-- fehlt genau eine: die ADRESSE. Anbieter, Modell und Schluessel sagen, WER
-- rechnet und WOMIT — aber nicht, WOHIN das Geraet die Anfrage schickt.
--
-- Eine Liste von Anbietern im Code (wie `services/llm/extern/providerRegistry.js`
-- sie fuer den geraeteweiten Zugang fuehrt) waere hier die falsche Antwort. Ein
-- Flow, der extern rechnet, laeuft bei einem Kunden gegen sein eigenes Gateway,
-- gegen Azure, gegen einen gemieteten vLLM — alles OpenAI-kompatibel, alles
-- unter einer anderen Adresse. Der Anbietername bleibt dabei das, was ein
-- Mensch liest; die Adresse ist das, was das Geraet anwaehlt.
--
-- KEIN `NOT NULL`: die Spalte gilt nur zusammen mit `extern_anbieter`. Ohne
-- externes Modell steht in allen fuenf `extern_`-Spalten NULL, und das ist der
-- Regelfall.
ALTER TABLE public.flow_settings
  ADD COLUMN IF NOT EXISTS extern_basis_url TEXT;

COMMENT ON COLUMN public.flow_settings.extern_basis_url IS
  'Die OpenAI-kompatible Basis-Adresse des externen Anbieters (ohne /chat/completions), z. B. https://api.openai.com/v1. Seit 179. NULL, solange der Flow lokal rechnet.';

-- Die fuenf `extern_`-Spalten stehen zusammen oder gar nicht. Bis 179 war das
-- eine Absicht ohne Wirkung; jetzt schreibt jemand hinein, und ab da ist eine
-- halb gefuellte Zeile ein Flow, der nicht laufen kann: ein Anbieter ohne
-- Modell, ein Modell ohne Adresse. Der Fehler soll beim SCHREIBEN auffallen und
-- nicht beim naechsten Lauf.
--
-- `extern_schluessel` steht bewusst NICHT in der Bedingung. Ein Gateway im
-- eigenen Netz verlangt keinen Schluessel, und ein erzwungener waere dann eine
-- erfundene Angabe.
DO $$ BEGIN
  ALTER TABLE public.flow_settings
    ADD CONSTRAINT flow_settings_extern_check CHECK (
      (extern_anbieter IS NULL AND extern_modell IS NULL AND extern_basis_url IS NULL)
      OR
      (extern_anbieter IS NOT NULL AND extern_modell IS NOT NULL AND extern_basis_url IS NOT NULL)
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
  -- Auf einem Geraet, auf dem jemand von Hand eine halbe Zeile hinterlassen
  -- hat, waere ein harter Abbruch eine Sackgasse (services/postgres/CLAUDE.md).
  -- Die Bedingung fehlt dann; geschrieben wird ohnehin nur ueber
  -- `services/flows/flowSettings.js`, das dieselbe Regel durchsetzt.
  WHEN check_violation THEN
    RAISE WARNING 'flow_settings enthaelt halb gefuellte extern_-Zeilen; die Bedingung wurde nicht gesetzt.';
END $$;

-- ---------------------------------------------------------------------------
-- 2. system_settings — der Einrichtungsassistent ist gestrichen
-- ---------------------------------------------------------------------------
-- Der `SetupWizard` (Migration 038, spaeter auf zwei Schritte gekuerzt) fragte
-- nach Firma, Branche, Teamgroesse, Antwortstil und einem Modell, und stand
-- nach JEDER frischen Installation vor der Shell. Jede seiner Fragen gehoert
-- inzwischen woandershin:
--
--   Firma/Branche/Teamgroesse/Antwortstil   war das Profil des CHATS. Den gibt
--                                           es seit Phase B2 nicht mehr.
--   Modellwahl                              die Kurzliste steht seit C8 fest
--                                           (config/modelle/kurzliste.json);
--                                           geladen wird in der Ansicht Modelle.
--   Netzname, Startpasswort, Kit-Schluessel  sagt seit C10 der Bootstrap, einmal,
--                                           auf der Konsole des Geraets.
--
-- Was bleibt, waere ein Bildschirm gewesen, der wiederholt, was der Bootstrap
-- gerade gezeigt hat — und genau das war am 20.08.2026 die Entscheidung gegen
-- den sechsten Schritt des alten Assistenten ("kein Schritt, der nur
-- bestaetigt, was der vorige getan hat").
--
-- MIT DEN SPALTEN FAELLT DIE FRAGE. Bliebe `setup_completed` stehen, stuende in
-- der Datenbank eines jeden Geraets ein Merker fuer einen Ablauf, den es nicht
-- mehr gibt, und der naechste, der ihn liest, baut ihn wieder ein.
--
-- `company_name`, `hostname`, `selected_model` und `ai_profile_yaml` bleiben:
-- sie gehoeren den Einstellungen und nicht dem Assistenten.
ALTER TABLE public.system_settings
  DROP COLUMN IF EXISTS setup_completed,
  DROP COLUMN IF EXISTS setup_completed_at,
  DROP COLUMN IF EXISTS setup_completed_by,
  DROP COLUMN IF EXISTS setup_step;

-- Die Hilfsfunktion aus 038 las genau diese Spalten. Ohne sie ist sie eine
-- Funktion, die beim ersten Aufruf mit "column does not exist" abbricht.
DROP FUNCTION IF EXISTS is_setup_completed();
