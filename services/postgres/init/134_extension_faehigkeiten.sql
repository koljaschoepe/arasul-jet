-- 134_extension_faehigkeiten.sql — Plan 017 Schritt 2: KI-Brücke.
--
-- Eine Erweiterung deklariert im Manifest, welche Fähigkeiten der lokalen
-- Basis sie nutzen will (llm | rag | dateien | flows). Der Admin gibt diese
-- Liste beim Live-Schalten einmal frei. Der Brücken-Zugriff erlaubt zur
-- Laufzeit NUR den Schnitt aus deklariert ∩ freigegeben — neue Fähigkeiten
-- eines Updates sind damit automatisch inert, bis erneut freigegeben wird.

ALTER TABLE extensions
  ADD COLUMN IF NOT EXISTS declared_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE extensions
  ADD COLUMN IF NOT EXISTS approved_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE extensions
  ADD COLUMN IF NOT EXISTS capabilities_approved_at TIMESTAMPTZ;

ALTER TABLE extensions
  ADD COLUMN IF NOT EXISTS capabilities_approved_by INTEGER
    REFERENCES admin_users(id) ON DELETE SET NULL;

COMMENT ON COLUMN extensions.declared_capabilities IS
  'Vom Manifest deklarierte Brücken-Fähigkeiten (Plan 017 Schritt 2): Teilmenge von ["llm","rag","dateien","flows"].';
COMMENT ON COLUMN extensions.approved_capabilities IS
  'Vom Admin beim Live-Schalten freigegebene Fähigkeiten; wirksam ist nur der Schnitt mit declared_capabilities.';
