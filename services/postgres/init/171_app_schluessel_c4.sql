-- 171_app_schluessel_c4.sql — Je App und Stand ein API-Schluessel
-- (Phase C4 des Ueberordner-Plans vom 26.08.2026)
--
-- Eine App soll die externe Schnittstelle des Geraets benutzen koennen
-- (`/api/v1/external`, OpenAI-kompatibel unter `/v1`): ein Sprachmodell
-- fragen, Text aus einer Datei holen, einen Flow anstossen. Dafuer braucht sie
-- einen Schluessel, und den setzt das Geraet beim Einspielen als
-- Umgebungsvariable in ihren Container. So steht es seit C3 in
-- `docs/features/APPS.md`: "Keine Geheimnisse in `umgebung`. Das Manifest liegt
-- im Paket und im Kit-Repository des Partners. Den API-Schluessel je App setzt
-- das Geraet beim Deploy (C4)."
--
-- JE STAND EINER, nicht je App einer. Der Teststand ist eine andere Version,
-- die ein Partner gerade ausprobiert; wenn sein Schluessel in einem Protokoll
-- landet, soll das den Livestand nichts kosten. Zwei Zeilen sind der Preis
-- dafuer, dass man einen davon wegnehmen kann, ohne den anderen anzufassen.

-- ---------------------------------------------------------------------------
-- 1. Der Praefix passt nicht in seine Spalte
-- ---------------------------------------------------------------------------
-- Migration 023 legt `key_prefix VARCHAR(8)` an ("First 8 chars"), aber
-- `middleware/apiKeyAuth.js` bildet ihn seit jeher mit
-- `key.substring(0, 12)` -- `aras_` sind fuenf Zeichen, dazu sieben aus dem
-- Zufallsteil. Postgres kuerzt bei einem INSERT nicht, es weist ab:
--
--   ERROR: value too long for type character varying(8)
--
-- Damit scheitert `POST /api/v1/external/api-keys` am Geraet, und zwar seit
-- 023. Aufgefallen ist es erst hier, weil C4 der erste Weg ist, auf dem das
-- Geraet SELBST einen Schluessel anlegt.
--
-- Die Spalte wird breiter, nicht der Code kuerzer: der Praefix dient dem
-- Nachschlagen (`WHERE key_prefix = $1`), und je kuerzer er ist, desto mehr
-- bcrypt-Vergleiche fallen bei einem Treffer an. Sechzehn Zeichen lassen Luft,
-- ohne dass jemand die Zahl wieder anfassen muss.
--
-- Zeilen, die noch da sind, tragen einen auf acht Zeichen abgeschnittenen
-- Praefix und sind ohnehin unbrauchbar -- die Suche vergleicht gegen zwoelf.
-- Sie bleiben trotzdem stehen: sie zu loeschen waere eine Entscheidung ueber
-- fremde Schluessel, und eine unbrauchbare Zeile richtet keinen Schaden an.
ALTER TABLE public.api_keys
  ALTER COLUMN key_prefix TYPE VARCHAR(16);

-- Die Funktion `log_api_key_usage` bleibt, wie sie ist, obwohl ihr Parameter
-- `VARCHAR(8)` heisst. Postgres ignoriert Laengenangaben an Funktionsparametern
-- vollstaendig -- dort ist `varchar(8)` dasselbe wie `varchar`, es wird nichts
-- geprueft und nichts gekuerzt. Sie umzuschreiben waere eine Aenderung ohne
-- Wirkung, und ein DROP FUNCTION in einer Migration ist genau die Sorte
-- Anweisung, an der 169 gescheitert ist.
--
-- Unterwegs gefunden, nicht Teil dieser Migration: die Funktion wird von
-- niemandem aufgerufen (nachgesehen am 27.08.2026), und `api_key_usage` fuellt
-- sich daher nie.

-- ---------------------------------------------------------------------------
-- 2. Wem ein Schluessel gehoert
-- ---------------------------------------------------------------------------
-- Zwei Spalten statt einer eigenen Tabelle: ein Schluessel einer App ist
-- derselbe Gegenstand wie ein Schluessel eines Menschen -- dieselbe Pruefung,
-- dieselbe Drossel, dieselbe Liste erlaubter Endpunkte. Eine zweite Tabelle
-- haette `middleware/apiKeyAuth.js` in zwei Wege gespalten, und beide haetten
-- dasselbe getan.
--
-- `app_id IS NULL` heisst: der Schluessel gehoert einem Menschen, so wie
-- bisher jeder. Der Fremdschluessel raeumt mit der App auch ihre Schluessel
-- weg; `DELETE /api/apps/:id` muss dafuer nichts tun.
ALTER TABLE public.api_keys
  ADD COLUMN IF NOT EXISTS app_id TEXT REFERENCES public.apps(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS stand  TEXT;

DO $$ BEGIN
  ALTER TABLE public.api_keys
    ADD CONSTRAINT api_keys_stand_check
    CHECK (stand IS NULL OR stand IN ('test', 'live'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Beide zusammen oder keines von beiden. Ein `app_id` ohne `stand` waere ein
-- Schluessel, von dem niemand sagen kann, welcher Container ihn hat.
DO $$ BEGIN
  ALTER TABLE public.api_keys
    ADD CONSTRAINT api_keys_app_stand_check
    CHECK ((app_id IS NULL) = (stand IS NULL));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Genau einer je App und Stand. Beim Einspielen wird der alte weggeworfen und
-- ein neuer angelegt (`services/app/appSchluessel.js`); der eindeutige Index
-- ist der Riegel dagegen, dass sich dabei zwei ansammeln, von denen einer in
-- keinem Container mehr steht und trotzdem gilt.
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_app_stand
  ON public.api_keys (app_id, stand)
  WHERE app_id IS NOT NULL;

COMMENT ON COLUMN public.api_keys.app_id IS
  'Die App, der dieser Schluessel gehoert; NULL = Schluessel eines Menschen. Seit 171';
COMMENT ON COLUMN public.api_keys.stand IS
  'Der Stand der App (test oder live); NULL, wenn app_id NULL ist. Seit 171';
