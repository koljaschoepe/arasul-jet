/**
 * Angesteckte Datenträger als Ziel für den Export (Plan 023 J3).
 *
 * Den Export gibt es seit langem, das Ziel fehlte: er kam nur als Download im
 * Browser. Auf einem Gerät, das im Serverraum steht und über den Fernzugriff
 * bedient wird, ist ein Browser-Download der unbequemste aller Wege.
 *
 * WIE EINE PLATTE HIER ANKOMMT: der Host hängt sie unter `/media/<nutzer>/<name>`
 * ein (udisks, der Standardweg unter Ubuntu). Dieser Ordner ist per Compose in
 * den Container gereicht. Der Container sieht damit GENAU die eingehängten
 * Datenträger und sonst nichts vom Host — kein `lsblk`, kein Docker-Socket,
 * keine Rechte, selbst einzuhängen.
 *
 * Das ist Absicht: Einhängen ist Sache des Betriebssystems, das hier ist nur
 * ein Blick in einen Ordner. Wer die Platte nicht sieht, hat sie nicht
 * eingehängt, und das steht dann auch so in der Antwort, statt dass jemand
 * einen Fehler im Dashboard sucht.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileP = promisify(execFile);
const logger = require('../../utils/logger');
const { ValidationError, NotFoundError } = require('../../utils/errors');

/** Wo die eingehängten Datenträger im Container erscheinen. */
const MEDIEN_DIR = process.env.EXTERNE_MEDIEN_DIR || '/arasul/medien';

/** Ein Name, der als Ordner unter MEDIEN_DIR auftauchen darf. */
const NAME_RE = /^[^/\\]{1,120}$/;

/**
 * Freier Platz eines Pfads in Bytes.
 *
 * Scheitert die Abfrage, wird der Datenträger trotzdem angeboten, nur ohne
 * Zahl. Ein Datenträger, den man nicht sieht, ist schlimmer als einer ohne
 * Größenangabe.
 */
async function freierPlatz(pfad) {
  try {
    const { stdout } = await execFileP('df', ['-kP', pfad], { timeout: 5000 });
    const zeile = stdout.trim().split('\n').pop();
    const frei = parseInt(zeile.split(/\s+/)[3], 10);
    return Number.isFinite(frei) ? frei * 1024 : null;
  } catch {
    return null;
  }
}

/** Ist der Ordner beschreibbar? Ohne das ist er kein Ziel, sondern eine Falle. */
async function beschreibbar(pfad) {
  try {
    await fsp.access(pfad, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Welche Datenträger sind gerade da?
 *
 * @returns {Promise<{medien: Array, ordner: string, hinweis: string|null}>}
 */
async function liste(deps = {}) {
  const dir = deps.dir || MEDIEN_DIR;
  let eintraege;
  try {
    eintraege = await fsp.readdir(dir, { withFileTypes: true });
  } catch (err) {
    // Kein Ordner heißt: der Mount fehlt. Das ist eine Einrichtungsfrage und
    // kein leerer Zustand, und der Unterschied gehört in die Antwort.
    logger.warn(`Externe Medien: "${dir}" nicht lesbar: ${err.message}`);
    return {
      medien: [],
      ordner: dir,
      hinweis:
        'Der Ordner für angesteckte Datenträger ist nicht eingebunden. ' +
        'In compose/compose.app.yaml muss EXTERNE_MEDIEN auf den Einhängepunkt ' +
        'des Hosts zeigen (unter Ubuntu: /media/<nutzer>).',
    };
  }

  const medien = [];
  for (const e of eintraege) {
    if (!e.isDirectory() || e.name.startsWith('.')) {
      continue;
    }
    const pfad = path.join(dir, e.name);
    medien.push({
      name: e.name,
      freiBytes: await freierPlatz(pfad),
      beschreibbar: await beschreibbar(pfad),
    });
  }
  medien.sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return {
    medien,
    ordner: dir,
    hinweis: medien.length
      ? null
      : 'Kein Datenträger eingehängt. Platte anstecken und kurz warten; ' +
        'das Betriebssystem hängt sie von selbst ein.',
  };
}

/**
 * Einen Datenträger auflösen und prüfen, dass er beschreibbar ist.
 *
 * Der Name kommt aus der Anfrage und darf deshalb keinen Pfad enthalten. Er
 * wird NICHT bereinigt, sondern abgewiesen: ein stillschweigend gekürzter Name
 * schriebe die Daten irgendwohin.
 */
async function aufloesen(name, deps = {}) {
  const dir = deps.dir || MEDIEN_DIR;
  const roh = String(name || '').trim();
  if (!NAME_RE.test(roh) || roh === '.' || roh === '..') {
    throw new ValidationError(`Ungültiger Datenträger: "${roh}"`);
  }
  const pfad = path.join(dir, roh);
  // Zweite Wand: der aufgelöste Pfad muss WIRKLICH unter dem Ordner liegen.
  // Ein Symlink auf der Platte zeigt sonst zurück ins Gerät.
  const echt = await fsp.realpath(pfad).catch(() => null);
  const wurzel = await fsp.realpath(dir).catch(() => dir);
  if (!echt || !echt.startsWith(wurzel + path.sep)) {
    throw new NotFoundError(`Datenträger "${roh}" ist nicht eingehängt`);
  }
  if (!(await beschreibbar(echt))) {
    throw new ValidationError(
      `Auf "${roh}" lässt sich nicht schreiben. Ist die Platte schreibgeschützt ` +
        'oder nur lesend eingehängt?'
    );
  }
  return echt;
}

/**
 * Eine Datei auf einen Datenträger schreiben.
 *
 * Erst daneben schreiben, dann umbenennen: wer die Platte mitten im Schreiben
 * abzieht, hat sonst eine halbe Datei, die aussieht wie ein Export.
 *
 * @returns {Promise<{pfad: string, bytes: number}>}
 */
async function schreibe(name, dateiname, inhalt, deps = {}) {
  const ziel = await aufloesen(name, deps);
  const sauber = String(dateiname || '')
    .trim()
    .replace(/[/\\]/g, '_');
  if (!sauber || sauber.startsWith('.')) {
    throw new ValidationError(`Ungültiger Dateiname: "${dateiname}"`);
  }
  const voll = path.join(ziel, sauber);
  const tmp = `${voll}.teil`;
  await fsp.writeFile(tmp, inhalt);
  await fsp.rename(tmp, voll);
  const stat = await fsp.stat(voll);
  logger.info(`Export geschrieben: ${voll} (${stat.size} Bytes)`);
  return { pfad: path.join(name, sauber), bytes: stat.size };
}

module.exports = { liste, aufloesen, schreibe, MEDIEN_DIR };
