/**
 * Das Manifest auf der Platte (Phase C3 des Umbaus vom 26.08.2026).
 *
 * Eine App liegt am Geraet als Ordner je Version:
 *
 *     /arasul/apps/<id>/<version>/app.json
 *     /arasul/apps/<id>/<version>/frontend/…      (statisch, wird ausgeliefert)
 *
 * Zwei Versionen koennen gleichzeitig dort liegen, weil zwei Staende
 * gleichzeitig laufen: der Livestand fuer alle, der Teststand fuer die Tester.
 * Deshalb ist die Version Teil des Pfades und nicht eine Datei, die beim
 * naechsten Deploy ueberschrieben wird.
 *
 * Dieser Baustein liest und prueft, mehr nicht. Was von einer App LAEUFT,
 * steht in der Datenbank (`appStore.js`), und was in einem Container passiert,
 * regelt `appContainer.js`.
 */

const fs = require('fs').promises;
const path = require('path');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { AppId, Version, AppManifest } = require('../../schemas/apps');

const APPS_DIR = process.env.APPS_DIR || '/arasul/apps';

/**
 * Kennung und Version pruefen, bevor sie in einen Pfad geraten.
 *
 * Beide Regeln stehen in `schemas/apps.js` und verbieten dort schon den
 * Schraegstrich und den Punkt allein. Hier werden sie ein zweites Mal
 * angewandt, weil dieser Baustein auch von Stellen aufgerufen wird, an denen
 * kein Zod-Schema davorsteht (Werksreset, Abnahmeskript). Danach kommt trotzdem
 * noch die Pruefung des fertigen Pfades: eine Regel, die man an einer Stelle
 * lockert, soll nicht auf einmal das Wurzelverzeichnis oeffnen.
 */
function verzeichnisFuer(appId, version) {
  const kennung = AppId.safeParse(appId);
  if (!kennung.success) {
    throw new ValidationError(kennung.error.issues[0].message);
  }
  const fassung = Version.safeParse(version);
  if (!fassung.success) {
    throw new ValidationError(fassung.error.issues[0].message);
  }
  const ziel = path.resolve(APPS_DIR, kennung.data, fassung.data);
  if (ziel !== path.join(APPS_DIR, kennung.data, fassung.data)) {
    throw new ValidationError(`Pfad fuehrt aus ${APPS_DIR} heraus: ${appId}/${version}`);
  }
  return ziel;
}

/** Der Ordner einer App ueber alle Versionen. */
function appVerzeichnis(appId) {
  const kennung = AppId.safeParse(appId);
  if (!kennung.success) {
    throw new ValidationError(kennung.error.issues[0].message);
  }
  return path.join(APPS_DIR, kennung.data);
}

/**
 * Das Manifest einer Version lesen und pruefen.
 *
 * Ein Manifest, das nicht zu seinem Ordner passt, wird abgewiesen: `id` und
 * `version` im `app.json` MUESSEN dieselben sein wie im Pfad. Sonst haette
 * eine App zwei Namen, je nachdem wen man fragt, und das Verzeichnis waere
 * beim naechsten Deploy nicht wiederzufinden.
 */
async function leseManifest(appId, version) {
  const datei = path.join(verzeichnisFuer(appId, version), 'app.json');
  let roh;
  try {
    roh = await fs.readFile(datei, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new NotFoundError(`Kein app.json fuer ${appId} in Version ${version}`);
    }
    throw err;
  }

  let gelesen;
  try {
    gelesen = JSON.parse(roh);
  } catch (err) {
    throw new ValidationError(
      `app.json von ${appId} ${version} ist kein gueltiges JSON: ${err.message}`
    );
  }

  const geprueft = AppManifest.safeParse(gelesen);
  if (!geprueft.success) {
    const erste = geprueft.error.issues[0];
    throw new ValidationError(
      `app.json von ${appId} ${version}: ${erste.message}` +
        (erste.path.length ? ` (Feld ${erste.path.join('.')})` : '')
    );
  }

  const manifest = geprueft.data;
  if (manifest.id !== appId || manifest.version !== version) {
    throw new ValidationError(
      `app.json nennt ${manifest.id} ${manifest.version}, liegt aber unter ${appId}/${version}`
    );
  }
  return manifest;
}

/** Welche Versionen einer App am Geraet liegen. Leere Liste, wenn keine. */
async function listeVersionen(appId) {
  let eintraege;
  try {
    eintraege = await fs.readdir(appVerzeichnis(appId), { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
  return eintraege
    .filter(e => e.isDirectory() && Version.safeParse(e.name).success)
    .map(e => e.name)
    .sort();
}

/**
 * Der Ordner mit den statischen Dateien einer Version, oder `null`, wenn die
 * App keines hat. Wirft, wenn das Manifest ein Frontend verspricht, das nicht
 * da ist: eine App, deren Seite fehlt, soll beim Einspielen scheitern und nicht
 * erst beim ersten Besucher.
 */
async function frontendVerzeichnis(manifest) {
  if (!manifest.frontend) {
    return null;
  }
  const ordner = path.join(
    verzeichnisFuer(manifest.id, manifest.version),
    manifest.frontend.verzeichnis
  );
  try {
    const stat = await fs.stat(path.join(ordner, 'index.html'));
    if (!stat.isFile()) {
      throw new ValidationError(`${ordner}/index.html ist keine Datei`);
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ValidationError(
        `Frontend von ${manifest.id} ${manifest.version} fehlt: ${ordner}/index.html`
      );
    }
    throw err;
  }
  return ordner;
}

/**
 * Die Dateien einer App wegwerfen: `/arasul/apps/<id>/` mit allen Versionen
 * (Phase C5).
 *
 * Nur ueber `appVerzeichnis`, also nur nach der Pruefung der Kennung. Ein
 * rekursives Loeschen ist die eine Stelle, an der ein durchgerutschter
 * Schraegstrich nicht eine Fehlermeldung, sondern einen Schaden ergibt.
 *
 * @returns {Promise<string[]>} die Versionen, die dabei weggefallen sind
 */
async function entferneDateien(appId) {
  const ordner = appVerzeichnis(appId);
  const versionen = await listeVersionen(appId);
  await fs.rm(ordner, { recursive: true, force: true });
  return versionen;
}

module.exports = {
  APPS_DIR,
  verzeichnisFuer,
  appVerzeichnis,
  leseManifest,
  listeVersionen,
  frontendVerzeichnis,
  entferneDateien,
};
