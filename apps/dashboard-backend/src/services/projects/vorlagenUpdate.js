/**
 * Vorlagen-Updates (Plan 014, Phase 6).
 *
 * Jedes aus einer Vorlage angelegte Projekt merkt sich Herkunft + Version
 * (projects.vorlage_id / vorlage_version). Liegt im Image eine NEUERE Version,
 * zeigt das Projekt ein Banner „Vorlage aktualisiert". Die Neuerungen werden
 * NIE automatisch eingespielt: Der Nutzer sieht sie einzeln und übernimmt sie
 * per Klick — und zwar ausschließlich ADDITIV (wx-Flag). Bestehende
 * Nutzer-Dateien werden nie verändert (Platte = Wahrheit).
 *
 * „Neuerung" = eine Datei aus dem inhalt/-Baum der Vorlage, die im Projekt
 * (noch) nicht existiert. Umbenannte/entfernte Vorlagen-Dateien werden bewusst
 * NICHT rückgängig gemacht — der Nutzer darf alles umbauen.
 */

const path = require('path');
const fs = require('fs').promises;
const db = require('../../database');
const logger = require('../../utils/logger');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const ablageService = require('./ablageService');
const vorlagenService = require('./vorlagenService');

/** Relative Pfade hart einsperren (wie im vorlagenService). */
function sichererRelPfad(rel) {
  const teile = String(rel).split('/');
  if (rel.startsWith('/') || teile.includes('..') || teile.includes('')) {
    throw new ValidationError(`Vorlagen-Pfad "${rel}" ist ungültig`);
  }
  return rel;
}

/** Alle Dateien (relativ) unter einem inhalt/-Baum. */
async function baumDateien(wurzel, rel = '') {
  const abs = path.join(wurzel, rel);
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  const dateien = [];
  for (const e of entries) {
    if (e.isSymbolicLink()) {
      continue;
    }
    const kindRel = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      dateien.push(...(await baumDateien(wurzel, kindRel)));
    } else if (e.isFile()) {
      dateien.push(kindRel);
    }
  }
  return dateien;
}

/**
 * Prüft, ob das Projekt ein Vorlagen-Update hat, und listet die übernehmbaren
 * Neuerungen (Vorlagen-Dateien, die im Projekt noch fehlen).
 *
 * @returns {Promise<{update: boolean, vorlage_id: string|null,
 *   projekt_version: number|null, neue_version: number|null,
 *   neuerungen: {pfad: string}[]}>}
 */
async function pruefeUpdate(projectId, deps = {}) {
  const {
    database = db,
    projektOrdner = ablageService.projektOrdner,
    getVorlage = vorlagenService.getVorlage,
    vorlagenDir = vorlagenService.VORLAGEN_DIR,
  } = deps;

  const { rows } = await database.query(
    'SELECT vorlage_id, vorlage_version FROM projects WHERE id = $1',
    [projectId]
  );
  if (rows.length === 0) {
    throw new NotFoundError('Projekt nicht gefunden');
  }
  const { vorlage_id: vorlageId, vorlage_version: projektVersion } = rows[0];
  const leer = {
    update: false,
    vorlage_id: vorlageId,
    projekt_version: projektVersion,
    neue_version: null,
    neuerungen: [],
  };
  if (!vorlageId) {
    return leer; // leer angelegtes Projekt — kein Update-Weg
  }

  let vorlage;
  try {
    vorlage = await getVorlage(vorlageId);
  } catch (err) {
    // Vorlage aus dem Image entfernt/umbenannt — kein Update anbieten.
    logger.warn(`Vorlagen-Update: Vorlage "${vorlageId}" nicht mehr im Image: ${err.message}`);
    return leer;
  }
  if (!(vorlage.version > (projektVersion ?? 0))) {
    return { ...leer, neue_version: vorlage.version };
  }

  // Neuere Version: die im Projekt fehlenden Vorlagen-Dateien sammeln.
  const wurzel = await projektOrdner(projectId);
  const inhalt = path.join(vorlagenDir, vorlageId, 'inhalt');
  const kandidaten = await baumDateien(inhalt);
  const neuerungen = [];
  for (const rel of kandidaten) {
    const vorhanden = await fs
      .access(path.join(wurzel, rel))
      .then(() => true)
      .catch(() => false);
    if (!vorhanden) {
      neuerungen.push({ pfad: rel });
    }
  }

  return {
    update: true,
    vorlage_id: vorlageId,
    projekt_version: projektVersion,
    neue_version: vorlage.version,
    neuerungen,
  };
}

/**
 * Übernimmt ausgewählte Neuerungen ins Projekt (ADDITIV, wx — nie
 * überschreiben) und hebt die gemerkte Vorlagen-Version des Projekts.
 *
 * WICHTIG: Die Version wird NUR angehoben, wenn ALLE angebotenen Neuerungen
 * übernommen wurden — sonst würde ein späterer Update-Check die übrigen nicht
 * mehr anzeigen. Bei Teil-Übernahme bleibt die alte Version, das Banner bleibt.
 *
 * @param {string} projectId
 * @param {string[]} pfade - Auswahl aus pruefeUpdate().neuerungen
 * @returns {Promise<{uebernommen: string[], version: number}>}
 */
async function uebernehmeNeuerungen(projectId, pfade, deps = {}) {
  const {
    database = db,
    projektOrdner = ablageService.projektOrdner,
    getVorlage = vorlagenService.getVorlage,
    vorlagenDir = vorlagenService.VORLAGEN_DIR,
    sync = require('./ordnerSyncService'),
  } = deps;

  const stand = await pruefeUpdate(projectId, deps);
  if (!stand.update) {
    throw new ValidationError('Für dieses Projekt liegt kein Vorlagen-Update vor');
  }
  const vorlage = await getVorlage(stand.vorlage_id);
  const wurzel = await projektOrdner(projectId);
  const inhalt = path.join(vorlagenDir, stand.vorlage_id, 'inhalt');

  // SICHERHEIT: Ein gültiger Pfad muss eine ECHTE Vorlagen-Datei sein (aus dem
  // inhalt/-Baum). Das trennt Angriff (beliebiger Pfad) von benignem Race (eine
  // angebotene Datei wurde inzwischen selbst angelegt) — Letzteres wird unten
  // per wx sauber übersprungen, statt den ganzen Batch hart abzulehnen.
  const vorlagenDateien = new Set(await baumDateien(inhalt));
  const auswahl = [...new Set((Array.isArray(pfade) ? pfade : []).map(String))];
  for (const p of auswahl) {
    if (!vorlagenDateien.has(p)) {
      throw new ValidationError(`"${p}" ist keine Datei dieser Vorlage`);
    }
  }

  const uebernommen = [];
  for (const rel of auswahl) {
    const von = path.join(inhalt, sichererRelPfad(rel));
    const nach = path.join(wurzel, rel);
    await fs.mkdir(path.dirname(nach), { recursive: true });
    try {
      const data = await fs.readFile(von);
      await fs.writeFile(nach, data, { flag: 'wx' }); // additiv, nie überschreiben
      uebernommen.push(rel);
    } catch (err) {
      if (err.code === 'EEXIST') {
        // In der Zwischenzeit selbst angelegt — überspringen, nichts zerstören.
        continue;
      }
      throw err;
    }
  }

  // Version nur heben, wenn JEDE angebotene Neuerung in der Auswahl war.
  // (Eine per wx übersprungene Datei existiert bereits — der Update-Zweck
  // „diese Datei ist jetzt im Projekt" ist damit ebenfalls erfüllt; deshalb
  // zählt Auswahl, nicht die tatsächliche Kopie.)
  const auswahlSet = new Set(auswahl);
  const alleAngebotenenGewaehlt = stand.neuerungen.every(n => auswahlSet.has(n.pfad));
  let version = stand.projekt_version;
  if (alleAngebotenenGewaehlt) {
    await database.query(
      'UPDATE projects SET vorlage_version = $1, updated_at = NOW() WHERE id = $2',
      [vorlage.version, projectId]
    );
    version = vorlage.version;
  }

  if (uebernommen.length > 0) {
    sync.trigger(projectId);
  }
  logger.info(
    `Vorlagen-Update ${stand.vorlage_id}: ${uebernommen.length} Neuerung(en) in Projekt ${projectId} übernommen`
  );
  return { uebernommen, version };
}

module.exports = { pruefeUpdate, uebernehmeNeuerungen, baumDateien };
