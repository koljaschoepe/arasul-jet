-- Plan 012 Phase E · Schritt 16: Erweiterungs-Register.
--
-- Eine "Erweiterung" ist ein forkbares, herunterladbares, installierbares
-- Ordner-Paket (Definition + Assets + manifest.json). Dieses Register hält den
-- Zustand der im System installierten Erweiterungen — getrennt vom kuratierten
-- statischen APP_MANIFEST (n8n) und vom Container-AppStore (app_installations).
--
-- Das Paket selbst liegt als Ordner unter EXTENSIONS_DIR (Container-lokal,
-- Host-gemountet); package_path zeigt darauf. Die Tabelle ist die Wahrheit über
-- "welche Erweiterung ist installiert und aktiv".

CREATE TABLE IF NOT EXISTS extensions (
  id           TEXT PRIMARY KEY,                       -- Slug, eindeutig, = Ordnername des Pakets
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  ext_type     TEXT NOT NULL DEFAULT 'app'
                 CHECK (ext_type IN ('app', 'flow', 'tool')),
  access_tier  TEXT NOT NULL DEFAULT 'internet'
                 CHECK (access_tier IN ('internet', 'internal', 'full')),
  version      TEXT NOT NULL DEFAULT '0.1.0',
  source       TEXT NOT NULL DEFAULT 'built'
                 CHECK (source IN ('built', 'imported')),
  manifest     JSONB NOT NULL DEFAULT '{}'::jsonb,     -- vollständiges manifest.json
  enabled      BOOLEAN NOT NULL DEFAULT FALSE,          -- lizenz-/sicherheitssauber: erst nach Aktivierung sichtbar
  package_path TEXT,                                    -- Container-lokaler Pfad des Paket-Ordners
  created_by   INTEGER REFERENCES admin_users(id) ON DELETE SET NULL,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_extensions_enabled ON extensions (enabled);
CREATE INDEX IF NOT EXISTS idx_extensions_type ON extensions (ext_type);

COMMENT ON TABLE extensions IS
  'Installierte Erweiterungs-Pakete (Plan 012 Phase E · Schritt 16): forkbar, herunterladbar, installierbar.';
