/**
 * Der Steckbrief eines Modells (Plan 023 D2).
 *
 * Die Detailseite soll sagen, wie gross ein Modell ist, wie es quantisiert
 * ist, unter welcher Lizenz es steht und wie lang sein Kontext wirklich ist.
 * Nichts davon war im Katalog gepflegt, und nichts davon darf ausgedacht sein.
 *
 * Die Quelle sind die Gewichte selbst: Ollamas `/api/show` liefert auf diesem
 * Geraet alle vier Angaben. Am 20.08.2026 an elf installierten Modellen
 * gemessen; Parametergroesse, Quantisierung und Kontextlaenge kamen bei allen
 * elf, eine Lizenzbezeichnung bei zehn.
 *
 * Was dabei auffiel und der Grund ist, warum die Kontextlaenge mitgelesen
 * wird: der Katalog behauptet fuer `qwen3:14b-q8` 32768 Token, das Modell
 * meldet 40960. Neun weitere Eintraege haben gar keinen Wert.
 */

const logger = require('../../utils/logger');
const services = require('../../config/services');

const LLM_SERVICE_URL = services.llm.url;
const ZEITGRENZE_MS = 10000;

/**
 * Aus einem Lizenztext eine kurze Bezeichnung machen.
 *
 * Ollama liefert zweierlei: `model_info['general.license']` als Kuerzel
 * ("apache-2.0"), aber nur bei einem Teil der Modelle, und `license` als
 * vollen Text. Aus dem Text traegt die erste nicht-leere Zeile die
 * Bezeichnung ("Apache License", "Gemma Terms of Use"). Bei Apache steht die
 * Version in der zweiten Zeile, deshalb wird sie angehaengt.
 */
function lizenzBezeichnung(kuerzel, text) {
  if (kuerzel && typeof kuerzel === 'string') {
    return kuerzel.trim().slice(0, 120);
  }
  if (!text || typeof text !== 'string') {
    return null;
  }
  const zeilen = text
    .split('\n')
    .map(z => z.trim())
    .filter(Boolean);
  if (zeilen.length === 0) {
    return null;
  }
  const erste = zeilen[0];
  const version = /^Version\s+([\d.]+)/i.exec(zeilen[1] || '');
  const name = version ? `${erste} ${version[1]}` : erste;
  return name.slice(0, 120);
}

/** Die Kontextlaenge steht je nach Architektur unter einem anderen Schluessel. */
function kontextLaenge(modelInfo) {
  if (!modelInfo || typeof modelInfo !== 'object') {
    return null;
  }
  for (const [schluessel, wert] of Object.entries(modelInfo)) {
    if (schluessel.endsWith('.context_length') || schluessel === 'context_length') {
      const zahl = Number(wert);
      if (Number.isFinite(zahl) && zahl > 0) {
        return Math.round(zahl);
      }
    }
  }
  return null;
}

/**
 * Steckbrief eines Modells aus Ollama lesen.
 * @param {string} ollamaName Name, unter dem Ollama das Modell kennt
 * @returns {Promise<{parameterLabel: string|null, quantization: string|null,
 *   license: string|null, contextLength: number|null}|null>} null, wenn Ollama
 *   nicht antwortet oder das Modell nicht kennt
 */
async function leseSteckbrief(ollamaName) {
  if (!ollamaName) {
    return null;
  }
  try {
    const antwort = await fetch(`${LLM_SERVICE_URL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaName }),
      signal: AbortSignal.timeout(ZEITGRENZE_MS),
    });
    if (!antwort.ok) {
      logger.debug(`[STECKBRIEF] /api/show antwortet ${antwort.status} fuer ${ollamaName}`);
      return null;
    }
    const daten = await antwort.json();
    const details = daten.details || {};
    const info = daten.model_info || {};
    return {
      parameterLabel: details.parameter_size ? String(details.parameter_size).slice(0, 20) : null,
      quantization: details.quantization_level
        ? String(details.quantization_level).slice(0, 30)
        : null,
      license: lizenzBezeichnung(info['general.license'], daten.license),
      contextLength: kontextLaenge(info),
    };
  } catch (fehler) {
    logger.debug(`[STECKBRIEF] /api/show fehlgeschlagen fuer ${ollamaName}: ${fehler.message}`);
    return null;
  }
}

/**
 * Steckbriefe fuer alle Modelle nachtragen, die Ollama kennt und deren
 * Steckbrief fehlt oder aelter als `hoechstalterTage` ist.
 *
 * Bewusst nacheinander statt parallel: `/api/show` laedt bei einem entladenen
 * Modell die Metadaten von der Platte, und die Box hat eine Platte. Der Lauf
 * haengt am Modell-Abgleich, der ohnehin nicht zeitkritisch ist.
 *
 * @returns {Promise<number>} Zahl der aktualisierten Eintraege
 */
async function steckbriefeNachtragen(database, { hoechstalterTage = 30 } = {}) {
  let geschrieben = 0;
  const { rows } = await database.query(
    `SELECT c.id, COALESCE(c.ollama_name, c.id) AS ollama_name
       FROM llm_model_catalog c
       JOIN llm_installed_models i ON i.id = c.id
      WHERE i.status = 'available'
        AND (c.profile_read_at IS NULL OR c.profile_read_at < NOW() - ($1 || ' days')::interval)
      ORDER BY c.id`,
    [String(hoechstalterTage)]
  );

  for (const zeile of rows) {
    const steckbrief = await leseSteckbrief(zeile.ollama_name);
    if (!steckbrief) {
      continue;
    }
    // `profile_read_at` wird auch gesetzt, wenn ein Feld leer bleibt: gelesen
    // ist gelesen. Sonst liefe der Abgleich bei jedem Start erneut ueber
    // dieselben Modelle, die die Angabe schlicht nicht tragen.
    await database.query(
      `UPDATE llm_model_catalog
          SET parameter_label = COALESCE($2, parameter_label),
              quantization    = COALESCE($3, quantization),
              license         = COALESCE($4, license),
              context_window  = COALESCE($5, context_window),
              profile_read_at = NOW(),
              updated_at      = NOW()
        WHERE id = $1`,
      [
        zeile.id,
        steckbrief.parameterLabel,
        steckbrief.quantization,
        steckbrief.license,
        steckbrief.contextLength,
      ]
    );
    geschrieben += 1;
  }

  if (geschrieben > 0) {
    logger.info(`[STECKBRIEF] ${geschrieben} Modell(e) aus Ollama nachgetragen`);
  }
  return geschrieben;
}

module.exports = { leseSteckbrief, steckbriefeNachtragen, lizenzBezeichnung, kontextLaenge };
