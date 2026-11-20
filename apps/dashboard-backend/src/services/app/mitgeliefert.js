/**
 * Die Apps, die mit Arasul selbst kommen (J44, M7, Karte entwickler-cockpit).
 *
 * Seit dem 20.11.2026 genau eine: das Entwickler-Cockpit
 * (`company/plattform.md`: „Einzige mitgelieferte App"). Sie ist eine App im
 * Rahmen wie jede andere -- Seite unter `/apps/<id>/`, eigenes `app.json`,
 * gebaut aus der Bibliothek zur Laufzeit (`/marken/5/`) --, mit drei
 * Unterschieden, und alle drei stehen in dieser Datei:
 *
 * 1. WOHER DIE DATEIEN KOMMEN. Nicht aus `APPS_DIR`, sondern aus dem Image
 *    des Backends (`mitgeliefert/<id>/`, gebaut im Dockerfile aus
 *    `apps/entwickler-cockpit/`). Sie kommt also mit jedem Update des Geraets
 *    und geht nie durch das Ausrollen: keine Zeile in `apps` oder
 *    `app_staende`, kein Teststand, kein Container, keine Datenbank.
 * 2. WER SIE SIEHT. Nicht die Freigabe in `app_members` entscheidet, sondern
 *    das Kennzeichen Entwickler (`admin_users.entwickler`), frisch aus der
 *    Datenbank bei jeder Anfrage -- auch fuer einen Entwickler ohne
 *    Admin-Rolle, und nie fuer einen Administrator ohne Kennzeichen.
 * 3. WAS SIE ERREICHT. Sie hat kein Backend, also keinen Schluessel und keine
 *    Datenbank. Sie ruft die Plattform-API des Geraets mit der Sitzung des
 *    Menschen, der vor ihr sitzt (gleiche Herkunft, Cookie, CSRF-Kopf), und
 *    jede dieser Routen prueft das Kennzeichen selbst. Damit gilt die Regel
 *    „Apps erreichen nur ihre eigene Datenbank und die Plattform-API" auch
 *    fuer sie: sie liest nie eine fremde Datenbank, und was sie darf, darf
 *    genau der Mensch.
 *
 * Die Kennung ist fuer Pakete vergeben (`MITGELIEFERTE_APPS` in
 * `schemas/apps.js`): ein Manifest mit `entwickler-cockpit` wird abgewiesen.
 */

const fs = require('fs');
const path = require('path');
const db = require('../../database');
const logger = require('../../utils/logger');
const { MITGELIEFERTE_APPS } = require('../../schemas/apps');
const { ForbiddenError, NotFoundError, ServiceUnavailableError } = require('../../utils/errors');

const COCKPIT = 'entwickler-cockpit';

/**
 * Wo die gebauten Dateien liegen. Im Image `/app/apps/dashboard-backend/
 * mitgeliefert/`, im Checkout derselbe Ort (nicht eingecheckt, siehe
 * `.gitignore`). Tests setzen ihn mit `_setzeVerzeichnis`.
 */
let verzeichnis = path.resolve(__dirname, '../../../mitgeliefert');

/** Was ueber eine mitgelieferte App feststeht, auch ohne gebaute Dateien. */
const BEKANNT = Object.freeze({
  [COCKPIT]: Object.freeze({
    name: 'Entwickler-Cockpit',
    beschreibung:
      'Rückmeldungen je App mit Stand, Fassungen in Test und Live, der Schritt nach Live.',
    symbol: 'gauge',
  }),
});

function istMitgeliefert(appId) {
  return MITGELIEFERTE_APPS.includes(appId);
}

/**
 * Das `app.json` der gebauten App, oder `null`, wenn sie in diesem Image
 * fehlt. Nicht zwischengespeichert: die Datei ist klein, und ein Backend, das
 * nach einem Bau ohne Neustart eine alte Fassung meldete, waere die
 * schlechtere Auskunft.
 */
function manifest(appId) {
  try {
    const roh = fs.readFileSync(path.join(verzeichnis, appId, 'app.json'), 'utf8');
    return JSON.parse(roh);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn(`Mitgelieferte App ${appId}: app.json unlesbar (${err.message})`);
    }
    return null;
  }
}

function frontendOrdner(appId) {
  const m = manifest(appId);
  return path.join(verzeichnis, appId, m?.frontend?.verzeichnis ?? 'frontend');
}

/** Traegt diese Person das Kennzeichen Entwickler? Frisch aus der Datenbank. */
async function istEntwickler(personId) {
  const { rows } = await db.query(
    'SELECT entwickler FROM public.admin_users WHERE id = $1 AND is_active = true',
    [personId]
  );
  return rows[0]?.entwickler === true;
}

/**
 * Darf dieser Mensch die mitgelieferte App? Dieselbe Form wie
 * `appZugang.pruefe`, und von dort gerufen: 403 ohne Kennzeichen (mit dem
 * Grund `nicht_freigegeben` fuer die Sperrseite), 404 fuer den Teststand,
 * den es nicht gibt.
 */
async function pruefe({ benutzerId, appId, stand }) {
  if (!(await istEntwickler(benutzerId))) {
    const fehler = new ForbiddenError(
      `Das ${BEKANNT[appId]?.name ?? appId} sehen nur Personen mit dem Kennzeichen Entwickler. ` +
        'Ein Administrator schaltet es unter Verwaltung › Personen.'
    );
    fehler.grund = 'nicht_freigegeben';
    throw fehler;
  }
  if (stand === 'test') {
    throw new NotFoundError(
      `${BEKANNT[appId]?.name ?? appId} kommt mit Arasul und hat keinen Teststand. Sie liegt unter /apps/${appId}/.`
    );
  }
  return { app_id: appId, stand: 'live', freigegeben_bis: 'live' };
}

/**
 * Woraus die Seite ausgeliefert wird; dieselbe Form wie
 * `appStore.ausliefernAus`. Fehlen die Dateien im Image, ist das eine Aussage
 * (503 `APP_DATEIEN_FEHLEN`), kein Absturz.
 */
function ausliefernAus(appId) {
  const m = manifest(appId);
  const ordner = frontendOrdner(appId);
  if (!m || !fs.existsSync(path.join(ordner, 'index.html'))) {
    throw new ServiceUnavailableError(
      `${BEKANNT[appId]?.name ?? appId} fehlt in diesem Abbild des Geräts. ` +
        'Ein Update des Geräts spielt es wieder ein.',
      { code: 'APP_DATEIEN_FEHLEN' }
    );
  }
  return { version: m.version, verzeichnis: ordner };
}

/**
 * Die mitgelieferten Apps fuer `GET /api/apps/meine`, in derselben Form wie
 * eine ausgerollte App. Leer ohne Kennzeichen, und leer, wenn die Dateien im
 * Image fehlen: eine Kachel, hinter der nichts ist, bekommt niemand.
 */
async function fuerNutzer(benutzerId) {
  // Erst die Platte, dann die Datenbank: ohne gebaute App (ein Checkout ohne
  // Bau, die Tests) fragt `/meine` nichts zusaetzlich.
  const gebaut = MITGELIEFERTE_APPS.map(appId => ({ appId, m: manifest(appId) })).filter(
    ({ appId, m }) => m && fs.existsSync(path.join(frontendOrdner(appId), 'index.html'))
  );
  if (gebaut.length === 0 || !(await istEntwickler(benutzerId))) {
    return [];
  }
  const liste = [];
  for (const { appId, m } of gebaut) {
    liste.push({
      id: appId,
      name: m.name ?? BEKANNT[appId].name,
      beschreibung: m.beschreibung ?? BEKANNT[appId].beschreibung,
      symbol: m.symbol ?? BEKANNT[appId].symbol,
      mitgeliefert: true,
      live: { version: m.version, pfad: `/apps/${appId}/`, api: null },
      test: null,
    });
  }
  return liste;
}

/** Nur fuer Tests. */
function _setzeVerzeichnis(neu) {
  verzeichnis = neu;
}

module.exports = {
  COCKPIT,
  BEKANNT,
  istMitgeliefert,
  istEntwickler,
  pruefe,
  ausliefernAus,
  fuerNutzer,
  manifest,
  _setzeVerzeichnis,
};
