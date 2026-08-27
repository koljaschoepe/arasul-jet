/**
 * Der API-Schluessel einer App (Phase C4 des Umbaus vom 26.08.2026).
 *
 * Eine App soll die externe Schnittstelle des Geraets benutzen koennen: ein
 * Sprachmodell fragen, Text aus einer Datei holen, einen Flow anstossen. Dafuer
 * bekommt sie einen Schluessel, und zwar einen je Stand -- der Teststand ist
 * eine andere Version, die jemand gerade ausprobiert, und was dort in einem
 * Protokoll landet, soll den Livestand nichts kosten.
 *
 * ER STEHT NICHT IM MANIFEST. Das Manifest liegt im Paket und im
 * Kit-Repository des Partners; ein Geheimnis darin waere ein Geheimnis in
 * seiner Versionsverwaltung. Das Geraet setzt ihn beim Einspielen als
 * Umgebungsvariable in den Container (`docs/features/APPS.md`, C3).
 *
 * ER WIRD BEI JEDEM EINSPIELEN NEU GEWUERFELT, und das ist der Kern des
 * Entwurfs: in der Datenbank steht nur der bcrypt-Abdruck, den Klartext gibt
 * es genau einmal, im Augenblick des Anlegens. Ihn daneben verschluesselt
 * abzulegen, damit man ihn spaeter noch einmal in einen Container schreiben
 * kann, waere ein zweiter Ort, an dem ein gueltiger Schluessel liegt -- und
 * gebraucht wuerde er nie, weil `appContainer.starte` den Container ohnehin
 * ERSETZT statt neu zu starten. Ein Neustart durch Docker (`unless-stopped`,
 * Geraeteneustart) behaelt die Umgebung des Containers und damit den
 * Schluessel.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { generateApiKey } = require('../../middleware/apiKeyAuth');

/**
 * Wohin eine App ihre Aufrufe schickt.
 *
 * Der Dienstname im Docker-Netz, nicht der Weg ueber Traefik: die App haengt
 * im selben Netz wie das Backend (`appContainer.NETZ`), und ein Umweg nach
 * draussen und wieder herein waere ein Umweg ueber TLS, Drossel und Zertifikat
 * fuer eine Verbindung, die das Geraet nie verlaesst.
 */
const API_URL = 'http://dashboard-backend:3001/api/v1/external';

/**
 * Den Schluessel einer App und eines Standes erneuern.
 *
 * Erst weg, dann neu, in dieser Reihenfolge: der eindeutige Index aus
 * Migration 171 laesst je App und Stand nur eine Zeile zu, und ein INSERT vor
 * dem DELETE liefe in einen Konflikt.
 *
 * @param {{appId: string, stand: 'test'|'live', durch: number|string|null}} was
 * @returns {Promise<string>} der Klartext-Schluessel, genau dieses eine Mal
 */
async function erneuere({ appId, stand, durch }) {
  const alt = await db.query('DELETE FROM public.api_keys WHERE app_id = $1 AND stand = $2', [
    appId,
    stand,
  ]);
  const { key } = await generateApiKey(
    `App ${appId} (${stand})`,
    `Vom Geraet beim Einspielen von ${appId} in den ${stand}-Stand angelegt.`,
    durch ?? null,
    { appId, stand }
  );
  logger.info(
    `App-Schluessel erneuert: ${appId}/${stand}${alt.rowCount > 0 ? ' (alter zurueckgezogen)' : ''}`
  );
  return key;
}

/**
 * Die Umgebung, die das Geraet dem Container einer App mitgibt.
 *
 * Genau zwei Werte, und der eine ist ohne den anderen nutzlos: der Schluessel
 * und die Adresse, an die er gehoert. Der Kennung und dem Stand ihres eigenen
 * Containers begegnet die App hier nicht -- sie stehen in ihrem Manifest, das
 * sie selbst geschrieben hat, und ein Feld, das die Plattform setzt und
 * niemand liest, ist eine Zusage, die man spaeter nicht mehr los wird.
 */
function umgebungFuer(schluessel) {
  return {
    ARASUL_API_URL: API_URL,
    ARASUL_API_SCHLUESSEL: schluessel,
  };
}

module.exports = { erneuere, umgebungFuer, API_URL };
