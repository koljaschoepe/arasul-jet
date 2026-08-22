-- 153_externe_modelle.sql — Plan 023 D9: externes Cloud-Modell dazuschalten
--
-- Zweck: Die Website verspricht, dass man ein starkes Cloud-Modell dazuschalten
-- kann, um damit die Anwendungen zu bauen, die danach lokal laufen. Einen
-- Schalter dafuer gab es nicht. Diese Tabelle haelt je Anbieter genau einen
-- Schluessel, verschluesselt, und ob der Anbieter eingeschaltet ist.
--
-- Warum ohne user_id, anders als user_external_credentials (107):
-- Entscheidung E1 vom 19.08.2026 sagt, es gibt keine Nutzerverwaltung und
-- keinen Scope, alle Nutzer teilen sich einen Zugang. Ein Cloud-Schluessel ist
-- damit eine Geraete-Einstellung, keine Nutzereigenschaft. Eine user_id waere
-- eine Trennung, die es nicht gibt, und wuerde beim ersten Nutzerwechsel eine
-- Karteileiche hinterlassen.
--
-- Gespeichert wird ausschliesslich der AES-256-GCM-Blob (IV || AuthTag ||
-- Ciphertext) als BYTEA, erzeugt von utils/tokenCrypto.js mit einem
-- Schluessel aus JWT_SECRET. Nie Klartext. Eine geleakte Zeile ohne
-- JWT_SECRET ist wertlos. Dieselbe Zusage steht schon an 107.
--
-- `schluessel_endet_auf` ist bewusst Klartext: die Oberflaeche muss zeigen
-- koennen, WELCHER Schluessel hinterlegt ist, ohne ihn zu entschluesseln. Vier
-- Zeichen genuegen zum Wiedererkennen und reichen nicht zum Missbrauch.
--
-- `aktiv` ist DEFAULT FALSE, weil der Plan es verlangt: standardmaessig aus.
-- Ein hinterlegter Schluessel allein schaltet noch nichts frei.
--
-- Modellnamen stehen hier ausdruecklich NICHT. Sie kommen zur Laufzeit vom
-- Anbieter selbst (GET /v1/models bei beiden), so wie Regel 1 aus CLAUDE.md
-- es verlangt: keine Fakten aus dem Gedaechtnis. Eine Liste in einer Migration
-- waere am Tag ihrer Anwendung schon veraltet.
--
-- Forward-only und idempotent, damit ein erneuter Lauf auf bereits
-- migrierten Geraeten folgenlos bleibt. Das Schema steht ausdruecklich davor,
-- wie services/postgres/CLAUDE.md es ab Migration 090 verlangt: der
-- search_path ist "$user", public, und ein unqualifiziertes CREATE TABLE
-- landet deshalb in arasul, was beim zweiten Lauf eine Schattentabelle
-- erzeugen kann. Kein BEGIN/COMMIT, der Runner umschliesst jede Migration
-- selbst mit einer Transaktion.
--
-- Rollback (down):
--   DROP TABLE IF EXISTS arasul.externe_modell_anbieter;

CREATE TABLE IF NOT EXISTS arasul.externe_modell_anbieter (
  anbieter             VARCHAR(50)  PRIMARY KEY,
  verschluesselter_schluessel BYTEA NOT NULL,
  schluessel_endet_auf VARCHAR(8)   NOT NULL,
  aktiv                BOOLEAN      NOT NULL DEFAULT FALSE,
  zuletzt_geprueft_am  TIMESTAMPTZ,
  letzter_fehler       TEXT,
  angelegt_am          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  geaendert_am         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN arasul.externe_modell_anbieter.anbieter IS
  'Anbieter-Kennung, heute ''anthropic'' oder ''openai''. Muss zu providerRegistry.js im Backend passen.';
COMMENT ON COLUMN arasul.externe_modell_anbieter.verschluesselter_schluessel IS
  'AES-256-GCM-Blob (IV || AuthTag || Ciphertext) des API-Schluessels, via utils/tokenCrypto.js. Niemals Klartext.';
COMMENT ON COLUMN arasul.externe_modell_anbieter.schluessel_endet_auf IS
  'Die letzten vier Zeichen des Schluessels im Klartext, damit die Oberflaeche zeigen kann, welcher Schluessel hinterlegt ist, ohne ihn zu entschluesseln.';
COMMENT ON COLUMN arasul.externe_modell_anbieter.aktiv IS
  'Ob dieser Anbieter im Chat und in Flows angeboten wird. DEFAULT FALSE: der Plan verlangt, dass externe Modelle standardmaessig aus sind.';
COMMENT ON COLUMN arasul.externe_modell_anbieter.zuletzt_geprueft_am IS
  'Wann der Schluessel zuletzt erfolgreich gegen den Anbieter geprueft wurde.';
COMMENT ON COLUMN arasul.externe_modell_anbieter.letzter_fehler IS
  'Der letzte Fehler beim Ansprechen des Anbieters, in Klartext fuer die Oberflaeche. NULL, wenn der letzte Versuch geklappt hat.';

-- Das Pruefprotokoll muss eine externe Anfrage als solche erkennbar machen
-- (Abnahme D9). Geschrieben wird in api_audit_logs, weil genau diese Tabelle
-- die Oberflaeche unter Pruefprotokoll zeigt (routes/admin/audit.js). Die
-- Nachbartabelle audit_logs ist der Sicherheits-Trail und waere die falsche
-- Stelle. Hier steht nur der Hinweis, wonach man sucht.
COMMENT ON TABLE arasul.externe_modell_anbieter IS
  'Plan 023 D9: je Anbieter ein verschluesselter Cloud-Schluessel. Geraeteweit, nicht je Nutzer (Entscheidung E1: ein Zugang je Geraet). Modellnamen stehen NICHT hier, sie kommen zur Laufzeit vom Anbieter. Jede Anfrage an ein externes Modell steht in api_audit_logs mit action_type=''externes_modell'' und dem Anbieter im request_payload.';

CREATE OR REPLACE FUNCTION arasul.externe_modell_anbieter_geaendert()
RETURNS TRIGGER AS $$
BEGIN
  NEW.geaendert_am = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_externe_modell_anbieter_geaendert ON arasul.externe_modell_anbieter;
CREATE TRIGGER trg_externe_modell_anbieter_geaendert
  BEFORE UPDATE ON arasul.externe_modell_anbieter
  FOR EACH ROW EXECUTE FUNCTION arasul.externe_modell_anbieter_geaendert();
