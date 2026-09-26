/**
 * Die deutschen Namen der Dienste des Geraets (J35, 26.09.2026).
 *
 * Ein Administrator einer Kanzlei liest „Datenbank" und nicht
 * „postgres-db", „Oberflaeche" und nicht „Dashboard UI". Diese Tabelle ist
 * die EINE Stelle dafuer: `GET /api/services/all` gibt je Dienst `anzeige`
 * mit, die Selbstheilung je Ereignis `dienst_anzeige`, und die Warnungen der
 * Uebersicht (`/api/ops/overview`) nennen einen ausgefallenen Dienst mit
 * diesem Namen. Die Oberflaeche erfindet keinen eigenen.
 *
 * Schluessel sind die Containernamen (`container_name` in compose/), dazu die
 * Kurzformen, unter denen `services/core/docker.js` sie fuehrt.
 */
const DIENST_NAMEN = {
  'postgres-db': 'Datenbank',
  postgres: 'Datenbank',
  'llm-service': 'Sprachmodelle',
  llm: 'Sprachmodelle',
  'embedding-service': 'Textvergleich',
  embeddings: 'Textvergleich',
  'document-indexer': 'Dokumente lesen',
  'reverse-proxy': 'Zugang im Netz',
  proxy: 'Zugang im Netz',
  'dashboard-backend': 'Verwaltung (Server)',
  dashboard_backend: 'Verwaltung (Server)',
  'dashboard-frontend': 'Oberfläche',
  dashboard_frontend: 'Oberfläche',
  'metrics-collector': 'Messwerte',
  metrics: 'Messwerte',
  'self-healing-agent': 'Selbstheilung',
  self_healing: 'Selbstheilung',
  'backup-service': 'Sicherung',
  'docker-proxy': 'Gerätesteuerung',
  firmenordner: 'Firmenordner',
};

/** Der Name, den ein Mensch liest; ein unbekannter Dienst behaelt seinen. */
function dienstName(kennung) {
  if (!kennung) {return kennung;}
  return DIENST_NAMEN[kennung] || kennung;
}

module.exports = { DIENST_NAMEN, dienstName };
