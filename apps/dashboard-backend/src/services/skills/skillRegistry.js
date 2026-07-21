/**
 * Skill-Registry (Plan 011, Schritt 4).
 *
 * Liest die Skill-Dateien aus `data/skills/` (im Container `/arasul/skills`),
 * hält sie im Speicher und schreibt Änderungen zurück. Das Verzeichnis ist ein
 * eigenes Docker-Volume, damit Skills einen Rebuild überleben und ins Backup
 * wandern — und bewusst getrennt vom Nutzer-Workspace, damit ein Skill mit
 * Schreibrecht seine eigene Definition nicht überschreiben kann (§8).
 *
 * Zwischenspeicher: Der Cache wird pro Datei über mtime+size invalidiert. Damit
 * ist eine von Hand editierte Datei sofort wirksam, ohne dass wir bei jedem
 * Slash-Menü-Aufruf jede Datei neu parsen.
 */

const path = require('path');
const fs = require('fs').promises;
const logger = require('../../utils/logger');
const { ValidationError, NotFoundError, ConflictError } = require('../../utils/errors');
const { parseSkillFile, serializeSkillFile } = require('./skillFile');
const { SKILL_NAME_RE } = require('../../schemas/skills');

const SKILLS_DIR = process.env.SKILLS_DIR || '/arasul/skills';

/** name → { skill, mtimeMs, size } */
const cache = new Map();

/** Macht die temporären Schreibdateien pro Aufruf eindeutig (siehe `saveSkill`). */
let tmpCounter = 0;

/**
 * Wirft, wenn `name` kein sauberer Skill-Name ist. Der Name wird zum Dateinamen,
 * deshalb ist das hier die Pfad-Sperre: keine Trenner, kein `..`, nichts, was
 * aus dem Verzeichnis herausführt.
 */
function assertSafeName(name) {
  const n = String(name || '').trim();
  if (!SKILL_NAME_RE.test(n)) {
    throw new ValidationError(
      `Ungültiger Skill-Name "${name}" — erlaubt sind Kleinbuchstaben, Ziffern und Bindestriche`
    );
  }
  return n;
}

function fileFor(name) {
  return path.join(SKILLS_DIR, `${assertSafeName(name)}.md`);
}

/** Legt das Skill-Verzeichnis an, falls es fehlt (frisches Gerät, leeres Volume). */
async function ensureDir() {
  await fs.mkdir(SKILLS_DIR, { recursive: true });
}

/**
 * Lädt einen Skill von der Platte — mit Cache über mtime+size.
 * @param {string} name
 * @returns {Promise<object>} Validierte Skill-Definition.
 * @throws {NotFoundError} wenn die Datei fehlt.
 */
async function loadSkill(name) {
  const safe = assertSafeName(name);
  const file = fileFor(safe);

  let stat;
  try {
    stat = await fs.stat(file);
  } catch (err) {
    if (err.code === 'ENOENT') {
      cache.delete(safe);
      throw new NotFoundError(`Skill "${safe}" nicht gefunden`);
    }
    throw err;
  }

  const hit = cache.get(safe);
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
    return hit.skill;
  }

  const text = await fs.readFile(file, 'utf8');
  const skill = parseSkillFile(text, { name: safe });
  cache.set(safe, { skill, mtimeMs: stat.mtimeMs, size: stat.size });
  return skill;
}

/**
 * Listet alle Skills. Eine kaputte Datei lässt den Aufruf NICHT scheitern —
 * sie wird mit ihrem Fehler zurückgegeben, damit das Menü weiter funktioniert
 * und der Nutzer sieht, welcher Skill klemmt (statt eines leeren Menüs).
 * @returns {Promise<{skills: object[], fehlerhaft: {name:string, fehler:string}[]}>}
 */
async function listSkills() {
  await ensureDir();

  let entries;
  try {
    entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { skills: [], fehlerhaft: [] };
    }
    throw err;
  }

  const names = entries
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map(e => e.name.slice(0, -3))
    .sort((a, b) => a.localeCompare(b));

  const skills = [];
  const fehlerhaft = [];
  for (const name of names) {
    try {
      skills.push(await loadSkill(name));
    } catch (err) {
      fehlerhaft.push({ name, fehler: err.message });
      logger.warn(`Skill "${name}" ist fehlerhaft und wird übersprungen: ${err.message}`);
    }
  }
  return { skills, fehlerhaft };
}

/**
 * Schreibt einen Skill. Validiert IMMER vor dem Schreiben, indem die erzeugte
 * Datei direkt wieder geparst wird — was auf der Platte landet, ist damit
 * garantiert ladbar. Ein kaputter Skill kann nicht entstehen.
 *
 * @param {object} definition - Rohe Definition (wird validiert).
 * @param {{ overwrite?: boolean }} [opts] - `overwrite:false` erzwingt Neuanlage.
 * @returns {Promise<object>} Die gespeicherte, normalisierte Definition.
 * @throws {ConflictError} wenn der Skill schon existiert und nicht überschrieben werden darf.
 */
async function saveSkill(definition, opts = {}) {
  const safe = assertSafeName(definition && definition.name);
  await ensureDir();
  const file = fileFor(safe);

  const exists = await fs
    .access(file)
    .then(() => true)
    .catch(() => false);

  if (exists && opts.overwrite === false) {
    throw new ConflictError(`Skill "${safe}" existiert bereits`);
  }
  if (!exists && opts.overwrite === true) {
    throw new NotFoundError(`Skill "${safe}" nicht gefunden`);
  }

  // Serialisieren und sofort zurücklesen: das ist die eigentliche Prüfung.
  // Sie fängt auch Fälle, in denen die Serialisierung selbst etwas verlöre.
  const text = serializeSkillFile({ ...definition, name: safe });
  const verified = parseSkillFile(text, { name: safe });

  // Atomar über eine temporäre Datei — ein abgebrochener Schreibvorgang darf
  // keinen halben Skill hinterlassen, der beim nächsten Laden scheitert.
  //
  // Der Name ist pro Aufruf eindeutig, nicht nur pro Prozess: zwei gleichzeitige
  // Speichervorgänge auf denselben Skill würden sich sonst dieselbe temporäre
  // Datei teilen und einander den Inhalt unter dem `rename` wegziehen. Das
  // Ergebnis wäre zwar nie halb geschrieben (rename ist atomar), aber einer der
  // beiden könnte am fehlenden Temp-File scheitern. Der Zähler kostet nichts.
  tmpCounter += 1;
  const tmp = `${file}.tmp-${process.pid}-${tmpCounter}`;
  try {
    await fs.writeFile(tmp, text, 'utf8');
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    throw err;
  }

  cache.delete(safe);
  logger.info(`Skill "${safe}" gespeichert (${exists ? 'geändert' : 'neu'})`);
  return verified;
}

/**
 * Löscht einen Skill.
 * @param {string} name
 * @throws {NotFoundError} wenn es ihn nicht gibt.
 */
async function deleteSkill(name) {
  const safe = assertSafeName(name);
  try {
    await fs.unlink(fileFor(safe));
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new NotFoundError(`Skill "${safe}" nicht gefunden`);
    }
    throw err;
  }
  cache.delete(safe);
  logger.info(`Skill "${safe}" gelöscht`);
}

/** Nur für Tests: Cache leeren. */
function clearCache() {
  cache.clear();
}

module.exports = {
  listSkills,
  loadSkill,
  saveSkill,
  deleteSkill,
  ensureDir,
  clearCache,
  assertSafeName,
  SKILLS_DIR,
};
