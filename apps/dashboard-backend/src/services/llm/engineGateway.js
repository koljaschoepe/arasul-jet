/**
 * Engine Gateway (Plan 021, Schritt 2)
 *
 * Eine dünne, engine-bewusste Schicht vor der Modell-Auslieferung. Das Frontend
 * sieht weiterhin nur EINE `/models`-Sicht; hier drin fällt die Entscheidung,
 * welche Inferenz-Engine dahinter läuft.
 *
 * Auflösungs-Reihenfolge der aktiven Engine:
 *   1. `ARASUL_ENGINE` (manueller Override, gewinnt immer)
 *   2. HAL: `JETSON_PROFILE` → Katalog-Id → `engine`-Feld aus
 *      `config/platforms/<id>.json` (die EINE Quelle der Wahrheit, Schritt 1)
 *   3. Default `ollama` (Orin-Verhalten; sicher, wenn nichts aufgelöst werden kann)
 *
 * Implementiert ist aktuell nur der Ollama-Pfad. Der vLLM-Pfad wird in
 * Schritt 7 real angebunden; bis dahin liefert er einen ehrlichen 503.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const services = require('../../config/services');
const logger = require('../../utils/logger');
const { ServiceUnavailableError } = require('../../utils/errors');

const VALID_ENGINES = ['ollama', 'vllm'];
const DEFAULT_ENGINE = 'ollama';

// Container: `../config:/config:ro` (compose.app.yaml) → /config/platforms.
// Fallback: Repo-Layout für lokale Tests (src/services/llm → repo-root).
const CONTAINER_PLATFORMS_DIR = process.env.PLATFORMS_DIR || '/config/platforms';
const REPO_PLATFORMS_DIR = path.resolve(__dirname, '../../../../../config/platforms');

/**
 * Feingranularen Profilnamen (JETSON_PROFILE / hardware.js) auf eine
 * config/platforms-Katalog-Id abbilden. Spiegelt bewusst 1:1
 * `get_platform_profile_id` aus scripts/setup/detect-platform.sh — die Zuordnung
 * lebt an genau diesen zwei Stellen, damit sie nicht weiter zerstreut.
 * @param {string|null|undefined} profile
 * @returns {string|null} Katalog-Id oder null, wenn kein Profil bekannt ist
 */
function profileToCatalogId(profile) {
  if (!profile) {
    return null;
  }
  if (/^thor_/.test(profile)) {
    return 'thor-128';
  }
  if (/^(agx_orin_|orin_|xavier_|nano_)/.test(profile)) {
    return 'orin-64';
  }
  if (profile === 'rtx_pro_6000') {
    return 'rtx-pro-6000';
  }
  if (profile === 'dgx_spark') {
    return 'dgx-spark';
  }
  if (profile === 'dgx_station') {
    return 'dgx-station';
  }
  // generic / server_generic / *_memory / unbekannt
  return 'server-generic';
}

/**
 * Das `engine`-Feld eines Katalog-Profils lesen (Container-Mount zuerst,
 * dann Repo-Fallback). Gibt null zurück, wenn nichts Valides gefunden wird.
 * @param {string|null} catalogId
 * @param {(p: string, enc: string) => string} [readFile]
 * @returns {string|null}
 */
function readCatalogEngine(catalogId, readFile = fs.readFileSync) {
  if (!catalogId) {
    return null;
  }
  for (const dir of [CONTAINER_PLATFORMS_DIR, REPO_PLATFORMS_DIR]) {
    try {
      const raw = readFile(path.join(dir, `${catalogId}.json`), 'utf8');
      const engine = JSON.parse(raw).engine;
      if (VALID_ENGINES.includes(engine)) {
        return engine;
      }
    } catch {
      // nächste Quelle versuchen
    }
  }
  return null;
}

/**
 * Die aktive Engine samt Herkunft auflösen.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {(p: string, enc: string) => string} [readFile]
 * @returns {{engine: string, source: 'override'|'hal'|'default', profileId: string|null}}
 */
function getEngineInfo(env = process.env, readFile = fs.readFileSync) {
  // 1. Manueller Override — gewinnt immer.
  const override = String(env.ARASUL_ENGINE || '')
    .trim()
    .toLowerCase();
  if (override) {
    if (VALID_ENGINES.includes(override)) {
      return { engine: override, source: 'override', profileId: null };
    }
    logger.warn(
      `[engineGateway] ARASUL_ENGINE="${override}" ist unbekannt — ignoriert (gültig: ${VALID_ENGINES.join(', ')})`
    );
  }

  // 2. HAL: Profil → Katalog-Id → engine-Feld.
  const catalogId = profileToCatalogId(env.JETSON_PROFILE);
  const halEngine = readCatalogEngine(catalogId, readFile);
  if (halEngine) {
    return { engine: halEngine, source: 'hal', profileId: catalogId };
  }

  // 3. Sicherer Default (Orin-Verhalten).
  return { engine: DEFAULT_ENGINE, source: 'default', profileId: catalogId };
}

/**
 * Nur den Engine-String auflösen.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function getActiveEngine(env = process.env) {
  return getEngineInfo(env).engine;
}

/**
 * Modelle für die aktive Engine auflisten — die EINE `/models`-Sicht.
 * Ollama ist implementiert; vLLM folgt in Schritt 7.
 * @param {{engine?: string}} [opts]
 * @param {(url: string, cfg?: object) => Promise<{data: any}>} [httpGet]
 * @returns {Promise<Array>}
 */
async function listModels({ engine } = {}, httpGet = axios.get) {
  const resolved = engine || getActiveEngine();

  if (resolved === 'ollama') {
    let response;
    try {
      response = await httpGet(services.llm.tagsEndpoint, { timeout: 5000 });
    } catch (err) {
      throw new ServiceUnavailableError('Failed to get LLM models');
    }
    return response.data?.models || [];
  }

  if (resolved === 'vllm') {
    // Der vLLM-Container wird in Plan 021 Schritt 7 real angebunden (Start/Stop
    // on-idle über den einen GPU-Lock). Bis dahin ist er auf keinem Gerät live.
    throw new ServiceUnavailableError(
      'vLLM-Engine ist auf diesem Gerät noch nicht verfügbar (Plan 021 Schritt 7)'
    );
  }

  throw new ServiceUnavailableError(`Unbekannte Engine: ${resolved}`);
}

module.exports = {
  getEngineInfo,
  getActiveEngine,
  listModels,
  profileToCatalogId,
  readCatalogEngine,
  VALID_ENGINES,
  DEFAULT_ENGINE,
};
