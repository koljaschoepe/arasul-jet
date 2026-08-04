/**
 * Kunden-Steckbrief-Index (Plan 014, Phase 3).
 *
 * Die Kundenübersicht des CRM-Pakets kommt OHNE eigene Tabellen aus
 * (Nutzer-Entscheidung §8: Platte = Wahrheit, keine CRM-Datenbank): Dieser
 * Scanner liest `Kunden/<Ordner>/Steckbrief.md` direkt von der Platte und
 * zieht die Kernfelder aus der Markdown-Tabelle (`| Feld | Wert |`). Wer den
 * Steckbrief im Editor ändert, sieht die Änderung sofort in der Übersicht —
 * kein Sync, kein Drift.
 *
 * Bewusst tolerant: Ein Ordner ohne Steckbrief erscheint mit leeren Feldern
 * (der Nutzer sieht, DASS der Kunde existiert und der Steckbrief fehlt);
 * eine unlesbare Datei kippt nie die ganze Übersicht.
 */

const path = require('path');
const fs = require('fs').promises;
const logger = require('../../utils/logger');
const ablageService = require('./ablageService');

/** Ordnername mit den Kundenordnern (CRM-Vorlage). */
const KUNDEN_ORDNER = 'Kunden';
const STECKBRIEF_DATEI = 'Steckbrief.md';
const MAX_STECKBRIEF_BYTES = 256 * 1024;

/** Zuordnung Tabellen-Label → Feldname (kleingeschrieben, tolerant). */
const FELDER = new Map([
  ['firma', 'firma'],
  ['webseite', 'webseite'],
  ['branche', 'branche'],
  ['ansprechpartner', 'ansprechpartner'],
  ['e-mail', 'email'],
  ['email', 'email'],
  ['telefon', 'telefon'],
  ['status', 'status'],
  ['letzter kontakt', 'letzter_kontakt'],
  // Anschrift + Steuer (Firmenprofil der Finanzen-Vorlage, Plan 014 Phase 5).
  ['straße', 'strasse'],
  ['strasse', 'strasse'],
  ['adresse', 'strasse'],
  ['plz', 'plz'],
  ['ort', 'ort'],
  ['land', 'land'],
  ['ust-idnr.', 'ust_id'],
  ['ust-idnr', 'ust_id'],
  ['ust-id', 'ust_id'],
  ['iban', 'iban'],
]);

/**
 * Zieht die Kernfelder aus einem Steckbrief-Markdown (`| Feld | Wert |`).
 * @returns {object} feldname → Wert (nur gefundene, nicht-leere Felder).
 */
function parseSteckbrief(text) {
  const felder = {};
  for (const zeile of String(text || '').split('\n')) {
    const m = zeile.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
    if (!m) {
      continue;
    }
    const key = FELDER.get(m[1].toLowerCase());
    const wert = m[2].trim();
    if (key && wert && wert !== '—' && wert !== '-' && !/^\[.*\]$/.test(wert) && wert !== '…') {
      felder[key] = wert;
    }
  }
  return felder;
}

/**
 * Alle Kunden eines Projekts: je Unterordner von `Kunden/` ein Eintrag mit
 * den Steckbrief-Feldern (sofern vorhanden).
 *
 * @param {string} projectId
 * @returns {Promise<{kunden: object[]}>} Einträge sortiert nach Name.
 */
async function listeKunden(projectId, deps = {}) {
  const { projektOrdner = ablageService.projektOrdner } = deps;
  const wurzel = await projektOrdner(projectId);
  const kundenDir = path.join(wurzel, KUNDEN_ORDNER);

  let entries;
  try {
    entries = await fs.readdir(kundenDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { kunden: [] };
    }
    throw err;
  }

  const kunden = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) {
      continue;
    }
    const eintrag = {
      ordner: e.name,
      pfad: `${KUNDEN_ORDNER}/${e.name}`,
      steckbrief_pfad: null,
      firma: e.name,
      webseite: null,
      branche: null,
      ansprechpartner: null,
      email: null,
      telefon: null,
      status: null,
      letzter_kontakt: null,
    };
    const steckbrief = path.join(kundenDir, e.name, STECKBRIEF_DATEI);
    try {
      const stat = await fs.stat(steckbrief);
      if (stat.isFile() && stat.size <= MAX_STECKBRIEF_BYTES) {
        const text = await fs.readFile(steckbrief, 'utf8');
        Object.assign(eintrag, parseSteckbrief(text));
        eintrag.steckbrief_pfad = `${KUNDEN_ORDNER}/${e.name}/${STECKBRIEF_DATEI}`;
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        logger.warn(`Steckbrief-Index: "${steckbrief}" nicht lesbar: ${err.message}`);
      }
    }
    kunden.push(eintrag);
  }

  kunden.sort((a, b) => a.firma.localeCompare(b.firma, 'de'));
  return { kunden };
}

module.exports = { listeKunden, parseSteckbrief, KUNDEN_ORDNER };
