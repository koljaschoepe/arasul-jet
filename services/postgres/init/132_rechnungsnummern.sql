-- 132: Lückenloser Rechnungsnummernkreis (Plan 014, Phase 5)
--
-- §14 UStG verlangt fortlaufende, lückenlose Rechnungsnummern. Der Kreis läuft
-- je Projekt und Jahr; das Format ist RE-<jahr>-<lfd. Nummer, 5-stellig>.
--
-- Lückenlosigkeit durch Reihenfolge, nicht durch Hoffnung: Der Zähler wird in
-- DERSELBEN Transaktion hochgezählt, in der die Rechnung registriert und die
-- Datei geschrieben wird (services/flows/rechnung/nummernkreis.js). Scheitert
-- die PDF-Erzeugung, rollt die Transaktion zurück — keine verbrannte Nummer.
-- Der Zähler serialisiert konkurrierende Läufe über das Zeilen-Lock des
-- UPDATE (Einzel-Admin macht Konkurrenz selten, der Lock macht sie harmlos).
--
--   rechnungsnummern_zaehler — eine Zeile je (projekt, jahr): der Stand.
--   rechnungsnummern         — eine Zeile je AUSGESTELLTER Rechnung: Nummer,
--                              Ablage-Pfad, die Code-berechneten Summen.
--                              Registrierte Pfade sind schreibgeschützt
--                              (ablageService-Wächter).
--
-- Bei einem Rollback des Codes bleiben beide Tabellen stehen, damit keine
-- Nummer doppelt vergeben wird (Plan 014 §7).
--
-- Down-Pfad (dokumentiert, nicht ausgeführt):
--   DROP TABLE rechnungsnummern; DROP TABLE rechnungsnummern_zaehler;

CREATE TABLE IF NOT EXISTS rechnungsnummern_zaehler (
  projekt_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  jahr       INTEGER NOT NULL,
  stand      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (projekt_id, jahr)
);

CREATE TABLE IF NOT EXISTS rechnungsnummern (
  id          BIGSERIAL PRIMARY KEY,
  projekt_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  jahr        INTEGER NOT NULL,
  laufnummer  INTEGER NOT NULL,
  nummer      TEXT NOT NULL,
  -- Ablage-relativer Pfad der ausgestellten PDF (Schreibschutz-Wächter).
  pfad        TEXT NOT NULL,
  -- Die CODE-berechneten Summen {netto, umsatzsteuer, brutto, ust_saetze:[…]}.
  summen      JSONB NOT NULL,
  erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (projekt_id, jahr, laufnummer),
  UNIQUE (projekt_id, nummer)
);

CREATE INDEX IF NOT EXISTS idx_rechnungsnummern_projekt_pfad
  ON rechnungsnummern (projekt_id, pfad);

COMMENT ON TABLE rechnungsnummern IS
  'Ausgestellte Rechnungen (Plan 014 Phase 5): lückenloser Nummernkreis je Projekt+Jahr; pfad ist schreibgeschützt';
COMMENT ON TABLE rechnungsnummern_zaehler IS
  'Zählerstand des Rechnungsnummernkreises je Projekt+Jahr (transaktional hochgezählt)';
