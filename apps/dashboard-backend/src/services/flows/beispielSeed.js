/**
 * Beispiel-Flows bei der Einrichtung anlegen (Plan 011, Schritt 18).
 *
 * Drei mitgelieferte Flows führen je eine Fähigkeit vor und sind zugleich der
 * Live-Nachweis auf dem Jetson: `dokument-zusammenfassen` (Datei-Argument),
 * `wissen` (RAG mit Quellen) und `recherche` (Subagenten mit Websuche).
 *
 * Die Vorlagen liegen tracked im Image unter `beispiele/`. Der Flow-Ordner
 * (`FLOWS_DIR`, per Bind-Mount) ist dagegen NUTZER-Land: dort legt der
 * Anlege-Dialog Dateien an, dorthin greift das Backup. Deshalb werden die
 * Vorlagen beim Start nur KOPIERT, wenn noch keine gleichnamige Datei existiert
 * — so überschreibt ein Update nie eine vom Nutzer bearbeitete oder bewusst
 * gelöschte Beispiel-Datei. (Eine gelöschte Beispiel-Datei kommt bei einem
 * späteren Start also nicht zurück, sobald sie einmal existiert hat und der
 * Nutzer sie entfernt — gewollt.)
 *
 * Best-effort: Ein Fehler beim Seed darf den Start nie verhindern.
 */

const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger');

const BEISPIELE_DIR = path.join(__dirname, 'beispiele');
const FLOWS_DIR = process.env.FLOWS_DIR || '/arasul/flows';

/**
 * Legt fehlende Beispiel-Flows im Flow-Ordner an.
 * @param {{ quelle?: string, ziel?: string }} [opts] - Für Tests austauschbar.
 * @returns {Promise<string[]>} Die Namen der neu angelegten Flows.
 */
async function seedBeispielFlows(opts = {}) {
  const quelle = opts.quelle || BEISPIELE_DIR;
  const ziel = opts.ziel || FLOWS_DIR;
  const angelegt = [];

  try {
    await fs.mkdir(ziel, { recursive: true });
    const dateien = (await fs.readdir(quelle)).filter(f => f.endsWith('.md'));

    for (const datei of dateien) {
      const zielPfad = path.join(ziel, datei);
      try {
        // `wx` schlägt fehl, wenn die Datei schon existiert — kein Race, kein
        // vorheriges Existenz-Check nötig, keine Gefahr, eine Nutzer-Datei zu
        // überschreiben.
        const inhalt = await fs.readFile(path.join(quelle, datei), 'utf8');
        await fs.writeFile(zielPfad, inhalt, { encoding: 'utf8', flag: 'wx' });
        angelegt.push(datei.replace(/\.md$/, ''));
      } catch (err) {
        if (err.code !== 'EEXIST') {
          logger.warn(`Beispiel-Flow "${datei}" nicht anlegbar: ${err.message}`);
        }
        // EEXIST ist der Normalfall (Datei schon da) — still übergehen.
      }
    }

    if (angelegt.length > 0) {
      logger.info(`Beispiel-Flows angelegt: ${angelegt.join(', ')}`);
    }
  } catch (err) {
    logger.warn(`Beispiel-Flows konnten nicht angelegt werden: ${err.message}`);
  }

  return angelegt;
}

module.exports = { seedBeispielFlows, BEISPIELE_DIR };
