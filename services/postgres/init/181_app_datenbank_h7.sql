-- 181_app_datenbank_h7.sql — Die Datenbank je App als Plattformdienst
-- (Phase H7 des Ueberordner-Plans vom 29.08.2026)
--
-- WAS FEHLTE. Eine App bekam vom Geraet ein Netz, eine Speichergrenze und zwei
-- Umgebungswerte -- und keinen Ort, an dem etwas liegen bleibt. Kein
-- Bind-Mount, kein Volume (`services/app/appContainer.js`). Die Werkstatt hat
-- das am 29.08.2026 am Orin gemessen: `docker inspect` einer frisch
-- eingespielten App sagt `Mounts: []`. Wer mehr baute als einen Zaehler, hielt
-- seine Vorgaenge in einer Liste im Arbeitsspeicher.
--
-- Der Ausweg, den sie genommen hat, war ein Handgriff des Administrators:
-- Rolle und Datenbank per SSH im Postgres der Plattform anlegen, das Passwort
-- in eine `.env`. Beides ist kein Weg, den das GERAET anbietet -- ein Partner
-- ohne SSH-Zugang zum Kundengeraet kommt nicht daran --, und die `.env` lag in
-- einem Arbeitsbaum, der mit dem naechsten Merge verschwand.
--
-- WARUM EINE TABELLE UND NICHT NUR EIN NAMENSMUSTER. Der Name liesse sich
-- jederzeit ausrechnen; das Passwort nicht. Es muss ueber einen Neustart des
-- Containers hinweg dasselbe bleiben -- Docker startet mit `unless-stopped`
-- neu und behaelt dabei die alte Umgebung --, also gehoert es abgelegt. Es
-- liegt verschluesselt (AES-256-GCM aus `utils/tokenCrypto.js`, derselbe Weg
-- wie der Schluessel eines externen Modells aus Migration 179).
--
-- JE APP UND STAND EINE. Der Teststand ist eine andere Version, die jemand
-- gerade ausprobiert; ein Probelauf darf die Daten des Livestandes nicht
-- anfassen. Dieselbe Trennung wie beim API-Schluessel einer App (C4).
--
-- ON DELETE CASCADE loescht die ZEILE, nicht die Datenbank. Das Wegwerfen der
-- Datenbank selbst steht in `services/app/appDatenbank.js` und geschieht
-- VORHER -- `appStore.entferneApp` liest erst, was weg soll, und loescht dann.
-- Aus demselben Grund sucht der Werksreset ueber den Namenspraefix und nicht
-- ueber diese Tabelle: er leert `apps`, und danach faende eine Aufraeumung
-- ueber die Tabelle nichts mehr.
--
-- UND NIEMAND SONST DARF SICH MIT arasul_db VERBINDEN. Ohne das darf jede
-- Rolle, die es auf diesem Cluster gibt, sich mit jeder Datenbank verbinden
-- (PUBLIC hat CONNECT von Haus aus). Eine App-Rolle kaeme damit zwar an keine
-- Tabelle -- sie besitzt keine und hat auf keine ein Recht --, aber sehr wohl
-- an den Katalog: jeden Tabellennamen, jede Spalte, jeden Rollennamen dieses
-- Geraets. Alle Dienste der Plattform verbinden sich als `arasul`, und der
-- besitzt die Datenbank; fuer ihn aendert sich nichts.
--
-- Rollback (down):
--   GRANT CONNECT ON DATABASE <db> TO PUBLIC;
--   DROP TABLE IF EXISTS public.app_datenbanken;
--   (die Datenbanken selbst: DROP DATABASE fuer jede mit Praefix arasul_app_)

CREATE TABLE IF NOT EXISTS public.app_datenbanken (
  app_id      TEXT        NOT NULL REFERENCES public.apps(id) ON DELETE CASCADE,
  stand       TEXT        NOT NULL CHECK (stand IN ('test', 'live')),
  datenbank   TEXT        NOT NULL UNIQUE,
  rolle       TEXT        NOT NULL UNIQUE,
  passwort    BYTEA       NOT NULL,
  angelegt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (app_id, stand)
);

COMMENT ON TABLE public.app_datenbanken IS
  'Je App und Stand eine Datenbank im Postgres der Plattform: Name, Rolle und das verschluesselte Passwort. Die Datenbank selbst legt services/app/appDatenbank.js an (Phase H7)';
COMMENT ON COLUMN public.app_datenbanken.datenbank IS
  'Name der Datenbank UND der Rolle, Praefix arasul_app_; ausrechenbar aus Kennung und Stand';
COMMENT ON COLUMN public.app_datenbanken.passwort IS
  'AES-256-GCM, Schluessel aus JWT_SECRET (utils/tokenCrypto.js). Kommt nur in die Umgebung des App-Containers, nirgends sonst';

DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', current_database());
END
$$;
