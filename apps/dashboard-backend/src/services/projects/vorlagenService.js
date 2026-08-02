/**
 * Projekt-Vorlagen (Plan 014, Phase 1) — die Vorlagen-Galerie beim Anlegen.
 *
 * Vorlagen sind Teil des Backend-Images (dieses Verzeichnis, `vorlagen/`),
 * genau wie die Beispiel-Flows: versioniert im Repo, per PR änderbar. Jede
 * Vorlage ist ein Ordner mit
 *
 *   vorlage.json  — Steckbrief: id, name, beschreibung, icon, color, version,
 *                   optional `ordner` (leere Ordner, die angelegt werden)
 *   inhalt/       — der Dateibaum, der beim Anlegen in den Projektordner
 *                   kopiert wird (inkl. `flows/` für projektgebundene Flows)
 *
 * Kopiert wird IMMER mit dem `wx`-Flag (Muster der Beispiel-Flows): existiert
 * eine Datei schon, bleibt sie unangetastet. Ab der Kopie gilt Platte =
 * Wahrheit — die Dateien gehören dem Nutzer, nichts wird je überschrieben.
 * Das Projekt merkt sich nur Herkunft und Version (projects.vorlage_id /
 * vorlage_version); darauf baut der Update-Hinweis (Phase 6) auf.
 */

const path = require('path');
const fs = require('fs').promises;
const db = require('../../database');
const logger = require('../../utils/logger');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const ablageService = require('./ablageService');

const VORLAGEN_DIR = path.join(__dirname, 'vorlagen');

/** Vorlagen-IDs sind Ordnernamen — dieselbe Sperre wie bei Flow-Namen. */
const VORLAGE_ID_RE = /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$|^[a-z0-9]$/;

function assertSafeId(id) {
  const v = String(id || '').trim();
  if (!VORLAGE_ID_RE.test(v)) {
    throw new ValidationError(`Ungültige Vorlagen-ID "${id}"`);
  }
  return v;
}

/** Liest und prüft die vorlage.json einer Vorlage. */
async function leseSteckbrief(id, dir = VORLAGEN_DIR) {
  const datei = path.join(dir, id, 'vorlage.json');
  let text;
  try {
    text = await fs.readFile(datei, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new NotFoundError(`Vorlage "${id}" nicht gefunden`);
    }
    throw err;
  }
  const meta = JSON.parse(text);
  if (meta.id !== id) {
    throw new ValidationError(`Vorlage "${id}": id in vorlage.json passt nicht zum Ordnernamen`);
  }
  if (!meta.name || !Number.isInteger(meta.version) || meta.version < 1) {
    throw new ValidationError(`Vorlage "${id}": name oder version fehlt/ungültig`);
  }
  return {
    id: meta.id,
    name: String(meta.name),
    beschreibung: String(meta.beschreibung || ''),
    icon: String(meta.icon || 'layers'),
    color: String(meta.color || '#6366f1'),
    version: meta.version,
    ordner: Array.isArray(meta.ordner) ? meta.ordner.map(String) : [],
  };
}

/**
 * Alle verfügbaren Vorlagen für die Galerie. Eine kaputte Vorlage lässt die
 * Liste NICHT scheitern — sie wird geloggt und übersprungen (die Galerie muss
 * immer funktionieren, das leere Anlegen sowieso).
 */
async function listeVorlagen({ dir = VORLAGEN_DIR } = {}) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const vorlagen = [];
  for (const e of entries) {
    if (!e.isDirectory() || !VORLAGE_ID_RE.test(e.name)) {
      continue;
    }
    try {
      const meta = await leseSteckbrief(e.name, dir);
      // `ordner` ist ein internes Detail des Kopierens — nicht Teil der Galerie.
      const { ordner: _ordner, ...steckbrief } = meta;
      vorlagen.push(steckbrief);
    } catch (err) {
      logger.warn(
        `Projekt-Vorlage "${e.name}" ist fehlerhaft und wird übersprungen: ${err.message}`
      );
    }
  }
  return vorlagen.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** Eine Vorlage samt interner Felder (wirft NotFound). */
async function getVorlage(id) {
  return leseSteckbrief(assertSafeId(id));
}

/** Relative Pfade aus vorlage.json/inhalt hart einsperren. */
function sichererRelPfad(rel) {
  const teile = String(rel).split('/');
  if (rel.startsWith('/') || teile.includes('..') || teile.includes('')) {
    throw new ValidationError(`Vorlagen-Pfad "${rel}" ist ungültig`);
  }
  return rel;
}

/** Kopiert einen Dateibaum rekursiv mit `wx` — vorhandene Dateien bleiben. */
async function kopiereBaum(quelle, ziel, ergebnis) {
  let entries;
  try {
    entries = await fs.readdir(quelle, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return; // Vorlage ohne inhalt/ — nur `ordner` werden angelegt.
    }
    throw err;
  }
  for (const e of entries) {
    if (e.isSymbolicLink()) {
      continue;
    }
    const von = path.join(quelle, e.name);
    const nach = path.join(ziel, e.name);
    if (e.isDirectory()) {
      await fs.mkdir(nach, { recursive: true });
      await kopiereBaum(von, nach, ergebnis);
    } else if (e.isFile()) {
      try {
        const inhalt = await fs.readFile(von);
        await fs.writeFile(nach, inhalt, { flag: 'wx' });
        ergebnis.kopiert.push(path.relative(ergebnis.wurzel, nach));
      } catch (err) {
        if (err.code === 'EEXIST') {
          ergebnis.uebersprungen.push(path.relative(ergebnis.wurzel, nach));
        } else {
          throw err;
        }
      }
    }
  }
}

/**
 * Wendet eine Vorlage auf ein Projekt an: legt die deklarierten Ordner an,
 * kopiert den inhalt/-Baum (wx, überschreibt nie) und merkt sich Herkunft +
 * Version am Projekt.
 *
 * @returns {Promise<{vorlage: object, kopiert: string[], uebersprungen: string[]}>}
 */
async function wendeVorlageAn(projectId, vorlageId, deps = {}) {
  const {
    database = db,
    projektOrdner = ablageService.projektOrdner,
    vorlagenDir = VORLAGEN_DIR,
  } = deps;

  const id = assertSafeId(vorlageId);
  const vorlage = await leseSteckbrief(id, vorlagenDir);
  const wurzel = await projektOrdner(projectId);

  const ergebnis = { wurzel, kopiert: [], uebersprungen: [] };
  for (const rel of vorlage.ordner) {
    await fs.mkdir(path.join(wurzel, sichererRelPfad(rel)), { recursive: true });
  }
  await kopiereBaum(path.join(vorlagenDir, id, 'inhalt'), wurzel, ergebnis);

  await database.query(
    'UPDATE projects SET vorlage_id = $1, vorlage_version = $2, updated_at = NOW() WHERE id = $3',
    [vorlage.id, vorlage.version, projectId]
  );

  logger.info(
    `Vorlage "${id}" (v${vorlage.version}) auf Projekt ${projectId} angewendet: ` +
      `${ergebnis.kopiert.length} Dateien kopiert, ${ergebnis.uebersprungen.length} übersprungen`
  );
  return { vorlage, kopiert: ergebnis.kopiert, uebersprungen: ergebnis.uebersprungen };
}

module.exports = {
  listeVorlagen,
  getVorlage,
  wendeVorlageAn,
  VORLAGEN_DIR,
};
