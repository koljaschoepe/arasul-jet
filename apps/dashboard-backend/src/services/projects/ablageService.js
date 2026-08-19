/**
 * Projektablage — der echte Geräte-Ordner eines Projekts.
 *
 * Jedes Projekt besitzt einen Ordner `/arasul/projects/<uuid>` (Host:
 * `data/projects/<uuid>`, Compose-Mount). Er ist die gemeinsame Wahrheit für
 * drei Welten:
 *
 *   - der Explorer zeigt und bearbeitet ihn (Datei-API in routes/ai/projects.js),
 *   - Flows nutzen ihn als Arbeitsverzeichnis (`projekt://aktiv` in ordner),
 *   - Sandboxes mounten ihn als /workspace/projekt (Batch 3).
 *
 * Der Git-Sync-Checkout (gitSyncService, PROJECT_GIT_DIR) liegt im SELBEN
 * Ordner — ein Git-gekoppeltes Projekt sieht hier schlicht sein Repo.
 *
 * Pfad-Sicherheit: jeder Zugriff läuft durch `resolveRealWithinRoots`
 * (symlink-sicher, Wurzel = der Projektordner). `.git` wird beim Auflisten
 * ausgeblendet und ist vor Löschen/Umbenennen geschützt — der Sync-Zustand
 * eines gekoppelten Repos soll nicht versehentlich aus dem Explorer heraus
 * zerlegt werden.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { resolveRealWithinRoots } = require('../flows/pathSafe');
const snapshotService = require('../flows/snapshotService');
const projectService = require('../rag/projectService');
const {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} = require('../../utils/errors');
const logger = require('../../utils/logger');

// Gleicher Standard wie gitSyncService — beide leben bewusst im selben Baum.
const ABLAGE_DIR = process.env.PROJECT_GIT_DIR || '/arasul/projects';

// Deckel gegen Ausreißer: der Editor ist für Text gedacht, nicht für Videos.
// 5 MB statt 1 MB (UX-Sweep 2026-08-12): agent-erzeugte HTML-Handbücher
// überschritten 1 MB und waren dann nur noch als Download sichtbar.
const MAX_EDITOR_BYTES = 5 * 1024 * 1024; // lesen/schreiben im Editor
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // Upload in die Ablage
const MAX_VORSCHAU_BYTES = 50 * 1024 * 1024; // Inline-Vorschau (PDF/Bild, Plan 019)
const MAX_TREE_ENTRIES = 2000; // Baum-Budget (danach ehrlich „gekürzt")
const MAX_TREE_DEPTH = 12;

/**
 * Einträge, die der Baum überspringt — Sync-Interna und Paket-Müllhalden.
 * `.arasul` ist die Marker-Datei des Ordner-Syncs (Lösch-Sicherung).
 */
const VERSTECKT = new Set([
  '.git',
  'node_modules',
  '__pycache__',
  '.venv',
  '.arasul',
  // Snapshot-/Undo-Speicher (Plan 022) — nie im Explorer/Baum zeigen.
  '.arasul-versions',
]);

/**
 * Liefert den (angelegten) Ablage-Ordner eines Projekts.
 * Wirft NotFound, wenn es das Projekt nicht gibt — kein Ordner für Geister.
 */
async function projektOrdner(projectId, { getProject = projectService.getProject } = {}) {
  await getProject(projectId); // wirft NotFoundError bei unbekannt
  const dir = path.join(ABLAGE_DIR, String(projectId));
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

/** Löst einen relativen Pfad sicher innerhalb des Projektordners auf. */
function sicher(dir, relPfad) {
  const roh = String(relPfad ?? '.').trim();
  return resolveRealWithinRoots([dir], roh === '' ? '.' : roh);
}

/** Ist der (bereits aufgelöste) Pfad der Projektordner selbst? */
function istWurzel(dir, absolut) {
  return path.resolve(absolut) === fs.realpathSync(dir);
}

/** Liegt eine Pfad-Komponente in der Verboten-Liste (.git & Co.)? */
function beruehrtVersteckt(relPfad) {
  return String(relPfad || '')
    .split('/')
    .some(teil => VERSTECKT.has(teil));
}

/**
 * Schreibschutz ausgestellter Rechnungen (Plan 014, Phase 5): Ein in
 * `rechnungsnummern` registrierter Ablage-Pfad darf nie überschrieben,
 * gelöscht oder verschoben werden — auch nicht über einen Eltern-Ordner
 * (rekursives Löschen). Wirft ForbiddenError beim Treffer.
 */
async function pruefeRechnungsschutz(projectId, relPfade, deps = {}) {
  const { db = require('../../database') } = deps;
  for (const roh of relPfade) {
    const rel = String(roh || '').replace(/\/+$/, '');
    if (!rel) {
      continue;
    }
    // Der Ordner-Pfad geht als LIKE-Muster in die Abfrage — `%`, `_` und `\`
    // darin müssen escaped werden, sonst matcht z. B. „Kunde_A" auch
    // „KundeXA" (Unterstrich = beliebiges Zeichen) und sperrt einen
    // rechnungsfreien Ordner fälschlich (QA-Sweep-Befund).
    const likePrefix = rel.replace(/([\\%_])/g, '\\$1') + '/%';
    const { rows } = await db.query(
      `SELECT nummer FROM rechnungsnummern
        WHERE projekt_id = $1 AND (pfad = $2 OR pfad LIKE $3 ESCAPE '\\')
        LIMIT 1`,
      [projectId, rel, likePrefix]
    );
    if (rows.length > 0) {
      throw new ForbiddenError(
        `Ausgestellte Rechnungen sind schreibgeschützt (${rows[0].nummer}), sie dürfen nicht geändert, verschoben oder gelöscht werden`
      );
    }
  }
}

/**
 * Listet den Datei-Baum eines Projekts (Budget-gedeckelt).
 *
 * Durchlaufen wird in BREITE (Ebene für Ebene), nicht in die Tiefe — sonst
 * verbraucht ein einzelner tiefer Zweig das gemeinsame Budget und die Wurzel
 * kommt unvollständig heraus. Die Reihenfolge über den ganzen Baum ist
 * dadurch level-order; INNERHALB eines Ordners bleibt es bei „Ordner vor
 * Dateien, alphabetisch". Mehr braucht der Explorer nicht: er gruppiert die
 * flache Liste ohnehin nach Elternpfad (ExplorerPanel `kinderVon`).
 *
 * @returns {Promise<{eintraege: object[], gekuerzt: boolean}>}
 *   eintraege: [{ pfad, name, typ: 'ordner'|'datei', groesse, geaendert }],
 *   je Ordner erst Ordner, dann Dateien, alphabetisch; Pfade relativ mit '/'.
 */
async function listTree(projectId, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  // Optional auf einen Unterordner scopen (Plan 019: strenge Ordner-Bindung —
  // der Agent sieht nur den angehängten Ordner). Der Startpfad muss innerhalb
  // der Projektwurzel bleiben; ein Ausbruch (…/.., absolut) fällt sicher auf
  // die Wurzel zurück. Die gelieferten Pfade sind relativ zum Startordner.
  let startAbs = dir;
  if (typeof deps.startRel === 'string' && deps.startRel.trim()) {
    const kandidat = path.resolve(dir, deps.startRel);
    if (kandidat === dir || kandidat.startsWith(dir + path.sep)) {
      startAbs = kandidat;
    }
  }
  const eintraege = [];
  let budget = MAX_TREE_ENTRIES;
  let gekuerzt = false;

  // Breitensuche statt Tiefensuche (2026-08-18). Vorher lief der Baum
  // rekursiv in die Tiefe und teilte sich EIN Budget: In einem realistisch
  // großen Team-Ordner (>2000 Einträge) fraß der erste Unterordner das
  // gesamte Budget auf, und die Geschwister auf Ebene 1 wurden nie ausgegeben
  // — im Explorer fehlten damit ausgerechnet die OBERSTEN Ordner, obwohl der
  // Nutzer nur „Liste gekürzt" las. Ebene für Ebene heißt: die Wurzel ist
  // immer vollständig, und gekürzt wird dort, wo es niemanden überrascht —
  // in der Tiefe.
  let ebene = [{ abs: startAbs, rel: '' }];
  for (let tiefe = 0; tiefe <= MAX_TREE_DEPTH && ebene.length > 0; tiefe += 1) {
    const naechste = [];
    for (const ordner of ebene) {
      if (budget <= 0) {
        // Dieser Ordner (und alles dahinter) bleibt ungelesen.
        gekuerzt = true;
        break;
      }
      let dirents;
      try {
        dirents = await fsp.readdir(ordner.abs, { withFileTypes: true });
      } catch (err) {
        logger.warn(
          `Projektablage ${projectId}: "${ordner.rel || '.'}" nicht lesbar: ${err.message}`
        );
        continue;
      }
      // Ordner zuerst, dann Dateien — jeweils alphabetisch (wie im Explorer üblich).
      dirents.sort((a, b) => {
        const da = a.isDirectory() ? 0 : 1;
        const db = b.isDirectory() ? 0 : 1;
        return da !== db ? da - db : a.name.localeCompare(b.name, 'de');
      });
      for (const d of dirents) {
        // Symlinks nicht verfolgen — sie könnten aus der Ablage herausführen.
        if (VERSTECKT.has(d.name) || d.isSymbolicLink()) {
          continue;
        }
        if (budget <= 0) {
          gekuerzt = true;
          break;
        }
        const kindRel = ordner.rel ? `${ordner.rel}/${d.name}` : d.name;
        const kindAbs = path.join(ordner.abs, d.name);
        if (d.isDirectory()) {
          budget -= 1;
          eintraege.push({
            pfad: kindRel,
            name: d.name,
            typ: 'ordner',
            groesse: null,
            geaendert: null,
          });
          naechste.push({ abs: kindAbs, rel: kindRel });
        } else if (d.isFile()) {
          budget -= 1;
          let stat = null;
          try {
            stat = await fsp.stat(kindAbs);
          } catch {
            continue;
          }
          eintraege.push({
            pfad: kindRel,
            name: d.name,
            typ: 'datei',
            groesse: stat.size,
            geaendert: stat.mtime.toISOString(),
          });
        }
      }
    }
    ebene = naechste;
  }
  // Bleiben Ordner unbesucht — weil das Budget aufgebraucht ist oder die
  // Tiefengrenze griff —, dann ist der Baum ehrlich als gekürzt zu melden.
  if (ebene.length > 0) {
    gekuerzt = true;
  }
  return { eintraege, gekuerzt };
}

// Suche: eigenes, deutlich höheres Besuchs-Budget. Der Baum-Endpoint deckelt
// bei MAX_TREE_ENTRIES (Repo-Projekte reißen das locker) — die Suche muss
// trotzdem den GANZEN Bestand abdecken, sonst findet der Explorer tief
// liegende Dateien nie. Gedeckelt wird über besuchte Einträge und Treffer.
const MAX_SUCHE_BESUCHE = 50000;
const MAX_SUCHE_TREFFER = 200;

/**
 * Rekursive Namenssuche über die komplette Projektablage.
 * Case-insensitive Teilstring-Match auf Datei-/Ordnernamen.
 *
 * @returns {Promise<{eintraege: object[], gekuerzt: boolean}>} wie listTree,
 *   nur auf Treffer reduziert (flache Liste, Pfade relativ).
 */
async function searchTree(projectId, suchtext, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  const nadel = String(suchtext || '')
    .trim()
    .toLowerCase();
  const eintraege = [];
  let besuche = 0;
  let gekuerzt = false;

  async function rekurse(abs, rel, tiefe) {
    if (tiefe > MAX_TREE_DEPTH || eintraege.length >= MAX_SUCHE_TREFFER) {
      gekuerzt = gekuerzt || eintraege.length >= MAX_SUCHE_TREFFER;
      return;
    }
    let dirents;
    try {
      dirents = await fsp.readdir(abs, { withFileTypes: true });
    } catch (err) {
      logger.warn(`Ablage-Suche ${projectId}: "${rel || '.'}" nicht lesbar: ${err.message}`);
      return;
    }
    dirents.sort((a, b) => a.name.localeCompare(b.name, 'de'));
    for (const d of dirents) {
      if (VERSTECKT.has(d.name) || d.isSymbolicLink()) {
        continue;
      }
      if (besuche >= MAX_SUCHE_BESUCHE || eintraege.length >= MAX_SUCHE_TREFFER) {
        gekuerzt = true;
        return;
      }
      besuche += 1;
      const kindRel = rel ? `${rel}/${d.name}` : d.name;
      const passt = d.name.toLowerCase().includes(nadel);
      if (d.isDirectory()) {
        if (passt) {
          eintraege.push({ pfad: kindRel, name: d.name, typ: 'ordner', groesse: null });
        }
        await rekurse(path.join(abs, d.name), kindRel, tiefe + 1);
      } else if (d.isFile() && passt) {
        eintraege.push({ pfad: kindRel, name: d.name, typ: 'datei', groesse: null });
      }
    }
  }

  if (nadel) {
    await rekurse(dir, '', 0);
  }
  return { eintraege, gekuerzt };
}

/** Sieht der Puffer nach Binärdaten aus? (NUL-Byte im Anfangsstück) */
function istBinaer(buffer) {
  const probe = buffer.subarray(0, 8000);
  return probe.includes(0);
}

/**
 * Liest eine Datei für den Editor. Binärdateien und Übergrößen liefern
 * `binaer`/`zuGross` statt Inhalt — der Client bietet dann Download an.
 */
async function readFile(projectId, relPfad, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  const abs = sicher(dir, relPfad);
  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    throw new NotFoundError(`Datei "${relPfad}" nicht gefunden`);
  }
  if (!stat.isFile()) {
    throw new ValidationError(`"${relPfad}" ist keine Datei`);
  }
  if (stat.size > MAX_EDITOR_BYTES) {
    return { inhalt: null, groesse: stat.size, binaer: false, zuGross: true };
  }
  const buffer = await fsp.readFile(abs);
  if (istBinaer(buffer)) {
    return { inhalt: null, groesse: stat.size, binaer: true, zuGross: false };
  }
  return { inhalt: buffer.toString('utf8'), groesse: stat.size, binaer: false, zuGross: false };
}

/**
 * `mkdir -p` mit sauberer Fehlerabbildung: liegt ein Vorfahr als DATEI im Weg
 * (z. B. Ordner „notiz/sub" anlegen, während „notiz" eine Datei ist), wirft
 * Node ENOTDIR/EEXIST. Das ist erwartbare Nutzereingabe → 4xx statt rohem 500
 * (QA-Sweep-Befund).
 */
async function mkdirSicher(zielDir) {
  try {
    await fsp.mkdir(zielDir, { recursive: true });
  } catch (err) {
    if (err && (err.code === 'ENOTDIR' || err.code === 'EEXIST')) {
      throw new ValidationError('Ein Teil des Pfads ist bereits eine Datei');
    }
    throw err;
  }
}

/** Schreibt eine Textdatei (legt Zwischenordner an). */
async function writeFile(projectId, relPfad, inhalt, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  if (beruehrtVersteckt(relPfad)) {
    throw new ValidationError('Dieser Pfad ist für die Ablage gesperrt');
  }
  await pruefeRechnungsschutz(projectId, [relPfad], deps);
  const text = String(inhalt ?? '');
  if (Buffer.byteLength(text, 'utf8') > MAX_EDITOR_BYTES) {
    throw new ValidationError('Datei zu groß für den Editor (max. 5 MB)');
  }
  const abs = sicher(dir, relPfad);
  if (istWurzel(dir, abs)) {
    throw new ValidationError('Pfad zeigt auf den Projektordner selbst');
  }
  await mkdirSicher(path.dirname(abs));
  // Plan 022 — vor dem Speichern den alten Stand sichern (mehrstufiges Undo,
  // gemeinsamer Stapel mit den Agent-Schreibschritten). Der Schlüssel ist der
  // kanonische Pfad relativ zum Projektordner — identisch zu dem, den die
  // Agent-Werkzeuge bilden, damit beide auf denselben Verlauf greifen.
  const relKanon = path.relative(dir, abs).split(path.sep).join('/');
  await sichereVorherKanon(dir, relKanon, abs);
  await fsp.writeFile(abs, text, 'utf8');
  const stat = await fsp.stat(abs);
  return { pfad: relPfad, groesse: stat.size, geaendert: stat.mtime.toISOString() };
}

/** Snapshot des Ist-Stands einer Datei (best effort) vor dem Überschreiben. */
async function sichereVorherKanon(dir, relKanon, abs) {
  let existierte = true;
  let altInhalt = null;
  try {
    const st = await fsp.stat(abs);
    if (!st.isFile()) {
      return;
    }
    if (st.size <= snapshotService.MAX_SNAPSHOT_BYTES) {
      altInhalt = await fsp.readFile(abs, 'utf8');
    } else {
      // Zu groß für eine Kopie → keine Undo-Stufe (statt Leer-Kopie).
      return;
    }
  } catch {
    existierte = false;
  }
  await snapshotService.sichereVorher(dir, relKanon, { existierte, altInhalt });
}

/**
 * Undo-Verlauf einer Projektdatei (Plan 022): Anzahl Stufen + ob ein Text-
 * Vorher-Stand für den Diff verfügbar ist.
 */
async function versionsInfo(projectId, relPfad, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  const abs = sicher(dir, relPfad);
  const relKanon = path.relative(dir, abs).split(path.sep).join('/');
  const info = await snapshotService.versionsInfo(dir, relKanon);
  if (!info) {
    return { pfad: relPfad, anzahl: 0, vorherInhalt: null };
  }
  const vorherInhalt = await snapshotService.letzterInhalt(dir, relKanon);
  return { pfad: relPfad, anzahl: info.anzahl, letzte: info.letzte, vorherInhalt };
}

/**
 * Macht den jüngsten Schreibschritt einer Projektdatei rückgängig (mehrstufig).
 * Danach den Ordner-Sync anstoßen, damit der Wissens-Spiegel nachzieht.
 */
async function undoDatei(projectId, relPfad, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  if (beruehrtVersteckt(relPfad)) {
    throw new ValidationError('Dieser Pfad ist für die Ablage gesperrt');
  }
  await pruefeRechnungsschutz(projectId, [relPfad], deps);
  const abs = sicher(dir, relPfad);
  const relKanon = path.relative(dir, abs).split(path.sep).join('/');
  const res = await snapshotService.wiederherstellen(dir, relKanon);
  if (!res.ok) {
    throw new NotFoundError(res.grund || 'Keine frühere Version vorhanden');
  }
  return { pfad: relPfad, verbleibend: res.verbleibend, art: res.art };
}

/** Legt einen (verschachtelten) Ordner an. */
async function createDir(projectId, relPfad, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  if (beruehrtVersteckt(relPfad)) {
    throw new ValidationError('Dieser Pfad ist für die Ablage gesperrt');
  }
  await pruefeRechnungsschutz(projectId, [relPfad], deps);
  const abs = sicher(dir, relPfad);
  if (istWurzel(dir, abs)) {
    throw new ValidationError('Pfad zeigt auf den Projektordner selbst');
  }
  await mkdirSicher(abs);
  return { pfad: relPfad };
}

/** Löscht eine Datei oder einen Ordner (rekursiv). Die Wurzel und .git nie. */
async function remove(projectId, relPfad, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  if (beruehrtVersteckt(relPfad)) {
    throw new ValidationError('Dieser Pfad ist für die Ablage gesperrt');
  }
  await pruefeRechnungsschutz(projectId, [relPfad], deps);
  const abs = sicher(dir, relPfad);
  if (istWurzel(dir, abs)) {
    throw new ValidationError('Der Projektordner selbst kann nicht gelöscht werden');
  }
  let stat;
  try {
    stat = await fsp.lstat(abs);
  } catch {
    throw new NotFoundError(`"${relPfad}" nicht gefunden`);
  }
  await fsp.rm(abs, { recursive: true, force: true });
  return { pfad: relPfad, typ: stat.isDirectory() ? 'ordner' : 'datei' };
}

/** Benennt um / verschiebt innerhalb der Ablage. */
async function move(projectId, vonPfad, nachPfad, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  if (beruehrtVersteckt(vonPfad) || beruehrtVersteckt(nachPfad)) {
    throw new ValidationError('Dieser Pfad ist für die Ablage gesperrt');
  }
  await pruefeRechnungsschutz(projectId, [vonPfad, nachPfad], deps);
  const von = sicher(dir, vonPfad);
  const nach = sicher(dir, nachPfad);
  if (istWurzel(dir, von) || istWurzel(dir, nach)) {
    throw new ValidationError('Der Projektordner selbst kann nicht verschoben werden');
  }
  // Ein Ordner in seinen eigenen Unterbaum ergäbe von fsp.rename nur einen
  // kryptischen EINVAL — vorher sauber ablehnen.
  if (nach === von || nach.startsWith(von + path.sep)) {
    throw new ValidationError('Ein Ordner kann nicht in sich selbst verschoben werden');
  }
  try {
    await fsp.access(von);
  } catch {
    throw new NotFoundError(`"${vonPfad}" nicht gefunden`);
  }
  let nachExistiert = true;
  try {
    await fsp.access(nach);
  } catch {
    nachExistiert = false;
  }
  if (nachExistiert) {
    throw new ConflictError(`"${nachPfad}" existiert bereits`);
  }
  await mkdirSicher(path.dirname(nach));
  await fsp.rename(von, nach);
  return { von: vonPfad, nach: nachPfad };
}

/** Legt eine hochgeladene Datei ab (Buffer aus multer). */
async function saveUpload(projectId, zielOrdner, originalname, buffer, deps = {}) {
  const dir = await projektOrdner(projectId, deps);
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new ValidationError('Datei zu groß (max. 50 MB)');
  }
  // Nur der Dateiname der hochgeladenen Datei — keine Pfad-Anteile von außen.
  const name = path.basename(String(originalname || 'datei'));
  if (!name || name === '.' || name === '..') {
    throw new ValidationError('Ungültiger Dateiname');
  }
  const relZiel = zielOrdner ? `${zielOrdner}/${name}` : name;
  if (beruehrtVersteckt(relZiel)) {
    throw new ValidationError('Dieser Pfad ist für die Ablage gesperrt');
  }
  // Eine ausgestellte Rechnung darf ein Upload nie überschreiben — sauberer
  // ForbiddenError statt eines rohen EACCES vom 0444-Dateimodus.
  await pruefeRechnungsschutz(projectId, [relZiel], deps);
  await mkdirSicher(path.dirname(sicher(dir, relZiel)));
  // Nie überschreiben: existiert der Name schon, weicht es auf name-2.ext,
  // name-3.ext … aus (kein stiller Datenverlust — QA-Sweep-Befund). Die
  // Nummerierung läuft auf der LOGISCHEN rel-Ebene, damit der zurückgegebene
  // Pfad relativ bleibt (nicht über realpath-Differenzen stolpert).
  const ext = path.extname(name);
  const stamm = name.slice(0, name.length - ext.length);
  for (let n = 1; n <= 1000; n++) {
    const kandidatName = n === 1 ? name : `${stamm}-${n}${ext}`;
    const kandidatRel = zielOrdner ? `${zielOrdner}/${kandidatName}` : kandidatName;
    try {
      await fsp.writeFile(sicher(dir, kandidatRel), buffer, { flag: 'wx' });
      return { pfad: kandidatRel, groesse: buffer.length };
    } catch (err) {
      // EEXIST: gleichnamige Datei — nächsten Namen probieren.
      // EISDIR: ein ORDNER belegt den Namen — ebenfalls ausweichen statt einen
      // rohen 500 zu werfen (die name-N-Variante kollidiert nicht mit dem Ordner).
      if (err && (err.code === 'EEXIST' || err.code === 'EISDIR')) {
        continue;
      }
      throw err;
    }
  }
  throw new ConflictError('Zu viele gleichnamige Dateien, bitte umbenennen');
}

/**
 * Löst einen Pfad für den Download auf (Datei ODER Ordner).
 * @returns {Promise<{abs: string, typ: 'datei'|'ordner', name: string, groesse: number|null, wurzel: string}>}
 */
async function fuerDownload(projectId, relPfad, deps = {}) {
  const { getProject = projectService.getProject } = deps;
  const dir = await projektOrdner(projectId, deps);
  const abs = sicher(dir, relPfad ?? '.');
  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    throw new NotFoundError(`"${relPfad}" nicht gefunden`);
  }
  const projekt = await getProject(projectId);
  const name = istWurzel(dir, abs) ? projekt.slug || 'projekt' : path.basename(abs);
  return {
    abs,
    typ: stat.isDirectory() ? 'ordner' : 'datei',
    name,
    groesse: stat.isFile() ? stat.size : null,
    wurzel: dir,
  };
}

/**
 * Datei-Deskriptor für die Inline-Vorschau (Plan 019 · Phase 3): PDF-/Bild-
 * Viewer im Workspace. Anders als der Editor (5-MB-Textgrenze) erlaubt die
 * Vorschau große Binärdateien bis MAX_VORSCHAU_BYTES; die Route streamt sie
 * dann (Range-fähig) statt sie als JSON zu laden. Nur Dateien, keine Ordner.
 */
async function fuerVorschau(projectId, relPfad, deps = {}) {
  const ziel = await fuerDownload(projectId, relPfad, deps);
  if (ziel.typ !== 'datei') {
    throw new ValidationError('Vorschau ist nur für Dateien möglich');
  }
  if (typeof ziel.groesse === 'number' && ziel.groesse > MAX_VORSCHAU_BYTES) {
    throw new ValidationError(
      `Datei zu groß für die Vorschau (max. ${Math.round(MAX_VORSCHAU_BYTES / (1024 * 1024))} MB)`
    );
  }
  return ziel;
}

/**
 * Der EINE Baum des Ein-Ordner-Modells: der Datei-Baum plus Wissens-Status.
 * Dateien, die als Dokument gespiegelt sind, tragen `dokument: {id, status}`;
 * Ordner mit Wissensraum-Spiegel tragen ihre `space_id` (für „Mit Ordner
 * chatten" und die Wissenssuche-Scopes).
 */
async function listTreeMitWissen(projectId, deps = {}) {
  const { db = require('../../database') } = deps;
  const { eintraege, gekuerzt } = await listTree(projectId, deps);
  const [docs, raeume] = await Promise.all([
    db.query(
      `SELECT id, rel_pfad, status FROM documents
        WHERE project_id = $1 AND rel_pfad IS NOT NULL
          AND deleted_at IS NULL AND status <> 'deleted'`,
      [projectId]
    ),
    db.query(
      `SELECT id, rel_pfad FROM knowledge_spaces
        WHERE project_id = $1 AND rel_pfad IS NOT NULL`,
      [projectId]
    ),
  ]);
  const docJePfad = new Map(docs.rows.map(r => [r.rel_pfad, r]));
  const raumJePfad = new Map(raeume.rows.map(r => [r.rel_pfad, r.id]));
  for (const e of eintraege) {
    if (e.typ === 'datei') {
      const doc = docJePfad.get(e.pfad);
      if (doc) {
        e.dokument = { id: doc.id, status: doc.status };
      }
    } else if (raumJePfad.has(e.pfad)) {
      e.space_id = raumJePfad.get(e.pfad);
    }
  }
  return { eintraege, gekuerzt };
}

module.exports = {
  ABLAGE_DIR,
  MAX_EDITOR_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_VORSCHAU_BYTES,
  MAX_TREE_ENTRIES,
  projektOrdner,
  pruefeRechnungsschutz,
  listTree,
  listTreeMitWissen,
  searchTree,
  readFile,
  writeFile,
  createDir,
  remove,
  move,
  saveUpload,
  fuerDownload,
  fuerVorschau,
  versionsInfo,
  undoDatei,
};
