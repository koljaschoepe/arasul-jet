/**
 * Beispiel-Flows als Katalog, nicht als Lieferumfang (Plan 023 B4).
 *
 * Bis zum 19.08.2026 hat der Start fünf Beispiel-Flows in den Flow-Ordner
 * kopiert. Nach Entscheidung E6 ist ab Werk nichts enthalten: kein Flow, keine
 * Erweiterung, kein n8n-Workflow. Ein Gerät, das ausgeliefert wird, zeigt leere
 * Listen mit einem Einstieg, keine fremden Einträge.
 *
 * Weg wären die Beispiele damit trotzdem falsch: ein leerer Flow-Ordner ohne
 * jeden Startpunkt hätte die Entscheidung wörtlich genommen und den Zweck
 * verfehlt. (`erweiterung` und `execute`, die Bau-Flows des
 * Erweiterungs-Baukastens, sind mit ihm in Phase B4 gefallen.)
 *
 * Deshalb: nichts wird angelegt, alles wird angeboten. Die Vorlagen liegen
 * weiter tracked im Abbild und stehen im Anlege-Dialog als Startpunkt bereit.
 * Wer eine wählt, bekommt ein ausgefülltes Formular und legt sie selbst an.
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger');
const { parseFlowFile } = require('./flowFile');

const BEISPIELE_DIR = path.join(__dirname, 'beispiele');

/**
 * Alle mitgelieferten Beispiele, geparst.
 * Eine kaputte Vorlage lässt die Liste nicht scheitern, sie fehlt dann nur.
 * @returns {Promise<Array<{name: string, beschreibung: string, definition: object}>>}
 */
async function listeBeispiele() {
  let dateien;
  try {
    dateien = (await fs.readdir(BEISPIELE_DIR)).filter(f => f.endsWith('.md')).sort();
  } catch (err) {
    logger.warn(`[beispiele] Ordner nicht lesbar: ${err.message}`);
    return [];
  }

  const beispiele = [];
  for (const datei of dateien) {
    try {
      const inhalt = await fs.readFile(path.join(BEISPIELE_DIR, datei), 'utf8');
      const definition = parseFlowFile(inhalt);
      beispiele.push({
        name: definition.name,
        beschreibung: definition.beschreibung || '',
        definition,
      });
    } catch (err) {
      logger.warn(`[beispiele] "${datei}" nicht lesbar: ${err.message}`);
    }
  }
  return beispiele;
}

/**
 * Ein einzelnes Beispiel. Liest genau die eine Datei, nicht alle fuenf.
 *
 * Der Name wird nicht in den Pfad eingesetzt, sondern gegen die vorhandenen
 * Dateien geprueft. Ein Name wie `../../.env` waere sonst ein Weg aus dem
 * Ordner heraus.
 * @returns {Promise<object|null>} Die Flow-Definition oder null.
 */
async function ladeBeispiel(name) {
  let dateien;
  try {
    dateien = (await fs.readdir(BEISPIELE_DIR)).filter(f => f.endsWith('.md'));
  } catch (err) {
    logger.warn(`[beispiele] Ordner nicht lesbar: ${err.message}`);
    return null;
  }

  const datei = dateien.find(f => f === `${name}.md`);
  if (!datei) {return null;}

  try {
    const inhalt = await fs.readFile(path.join(BEISPIELE_DIR, datei), 'utf8');
    const definition = parseFlowFile(inhalt);
    return definition.name === name ? definition : null;
  } catch (err) {
    logger.warn(`[beispiele] "${datei}" nicht lesbar: ${err.message}`);
    return null;
  }
}

module.exports = { listeBeispiele, ladeBeispiel, BEISPIELE_DIR };
