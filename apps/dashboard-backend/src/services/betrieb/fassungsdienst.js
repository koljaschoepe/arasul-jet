/**
 * Eine neue Fassung einspielen ueber die Schnittstelle (J39, 02.10.2026).
 *
 * WAS DAS IST. Das Geraet spielt auf Auftrag eine neue Fassung seiner selbst
 * ein: das Release holen, die Pruefsumme pruefen, VORHER sichern, dann
 * `install.sh` der neuen Fassung laufen lassen -- und bei einem Fehler auf die
 * vorige Fassung zurueck. Bis J39 ging das nur ueber SSH (`upgrade.mjs` des
 * Kits brauchte einen Fernzugriff und `sudo reboot`); ein Kunde ohne beides
 * hatte keinen Weg.
 *
 * WARUM EIN HILFSCONTAINER. `install.sh` braucht den HOST: `docker compose`,
 * `sudo`, das Verzeichnis des Benutzers. Im Backend-Image gibt es nichts davon
 * (`apk add git tzdata`). Das Backend darf ueber den Docker-Proxy aber
 * Container anlegen (`POST`, `CONTAINERS`) -- es startet einen, der mit
 * `nsenter` in den Host steigt und dort `scripts/deploy/fassung-einspielen.sh`
 * der LAUFENDEN Fassung aufruft. Dass das Root-Rechte am Host sind, ist keine
 * neue Eigenschaft: wer ueber den Proxy Container anlegen kann, kann das
 * ohnehin. Neu ist nur, dass es EINEN benannten Weg gibt, und dass der hinter
 * dem Bereich `system:update` liegt (`config/apiBereiche.js`), den kein
 * Schluessel automatisch bekommt.
 *
 * WARUM NICHT IM BACKEND-PROZESS. Der Lauf schaltet den Stapel ab, und mit ihm
 * dieses Backend. Der Hilfscontainer gehoert zu keinem Compose-Projekt und
 * ueberlebt das; er schreibt den Stand nach `data/updates/fassung/status.json`,
 * und das NEUE Backend liest ihn nach seinem Start von dort.
 *
 * WAS DAS BACKEND SELBST TUT, BEVOR ES UEBERGIBT: pruefen, ob der Weg gangbar
 * ist, das Artefakt holen, seine Pruefsumme pruefen, sichern. Das ist die
 * Sicherung "ueber den Weg, den der Endpunkt selbst nimmt" -- dieselbe wie jede
 * andere (`sicherungsdienst.sichereJetzt`).
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

const logger = require('../../utils/logger');
const dockerService = require('../core/docker');
const sicherungsdienst = require('./sicherungsdienst');
const { versionFuerVergleich, versionBekannt, istReleaseNummer } = require('../../utils/version');
const {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} = require('../../utils/errors');

/** Wo die Fassung liegt, die das Geraet gerade ist (Inhalt: `status.json`, `lauf.log`). */
const UPDATES_ORDNER = process.env.UPDATES_DIR || '/arasul/updates';
const STATUS_ORDNER = path.join(UPDATES_ORDNER, 'fassung');
const ABLAGE = path.join(UPDATES_ORDNER, 'fassungen');
const STATUS_DATEI = path.join(STATUS_ORDNER, 'status.json');
const LOG_DATEI = path.join(STATUS_ORDNER, 'lauf.log');

/** Das Repo, in dem die Releases liegen (`arasul-release.json`, Feld `repo`). */
const REPO = process.env.UPDATE_REPO || 'koljaschoepe/arasul-jet';
const PRAEFIX = process.env.CONTAINER_PREFIX || '';
const HILFSCONTAINER = `${PRAEFIX}arasul-aktualisierung`;

/** Weniger freier Platz als das, und es wird nicht angefangen: drei Images bauen sich nicht in 2 GB. */
const MIN_FREI_BYTES = 8 * 1024 ** 3;
const MAX_ARTEFAKT_BYTES = 500 * 1024 ** 2;
const LOG_ZEILEN = 40;

const FASSUNG = /^\d+\.\d+\.\d+$/;
/** Pfade, die in eine Befehlszeile am Host wandern: nur das hier, nichts sonst. */
const SICHERER_PFAD = /^\/[A-Za-z0-9_./-]+$/;

/** Was im Backend-Prozess selbst laeuft, bevor der Hilfscontainer uebernimmt. */
let imProzess = null;

/** Ein Vergleich zweier `X.Y.Z`; < 0, 0, > 0. */
function vergleiche(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) {
      return x[i] - y[i];
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

async function leseDatei(pfad) {
  try {
    return await fs.readFile(pfad, 'utf8');
  } catch {
    return null;
  }
}

/** Die letzten Zeilen des Protokolls -- das ist der „Fortschritt lesbar". */
async function logEnde() {
  const roh = await leseDatei(LOG_DATEI);
  if (!roh) {
    return [];
  }
  return roh.split('\n').filter(Boolean).slice(-LOG_ZEILEN);
}

async function leseStatusDatei() {
  const roh = await leseDatei(STATUS_DATEI);
  if (!roh) {
    return null;
  }
  try {
    const status = JSON.parse(roh);
    return status && typeof status === 'object' ? status : null;
  } catch {
    return null;
  }
}

/** Dieselben Felder wie das Skript am Host (`scripts/deploy/fassung-einspielen.sh`). */
async function schreibeStatus(teil) {
  await fs.mkdir(STATUS_ORDNER, { recursive: true });
  const alt = (await leseStatusDatei()) || {};
  const neu = { ...alt, ...teil };
  const tmp = path.join(STATUS_ORDNER, '.status.json.tmp');
  await fs.writeFile(tmp, JSON.stringify(neu, null, 2));
  await fs.rename(tmp, STATUS_DATEI);
  return neu;
}

async function protokolliere(zeile) {
  const stempel = new Date().toTimeString().slice(0, 8);
  await fs.mkdir(STATUS_ORDNER, { recursive: true });
  await fs.appendFile(LOG_DATEI, `[${stempel}] ${zeile}\n`);
}

/** Laeuft der Hilfscontainer noch? */
async function hilfeLaeuft() {
  try {
    const info = await dockerService.docker.getContainer(HILFSCONTAINER).inspect();
    return info.State?.Running === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Wo steht das Geraet?
// ---------------------------------------------------------------------------

/**
 * Das Verzeichnis am HOST, aus dem dieser Stapel laeuft, und der Ort der
 * Update-Ablage am Host -- beides aus Dockers eigenen Angaben ueber den
 * eigenen Container, nicht aus einer Annahme (dieselbe Regel wie
 * `scripts/lib/installation.sh`).
 */
async function ermittleHost() {
  const info = await dockerService.docker.getContainer(`${PRAEFIX}dashboard-backend`).inspect();
  const wurzel = info.Config?.Labels?.['com.docker.compose.project.working_dir'];
  const mount = (info.Mounts || []).find(m => m.Destination === UPDATES_ORDNER);
  return { wurzel, ablage: mount?.Source ? path.join(mount.Source, 'fassungen') : null, info };
}

/**
 * Kann dieses Geraet sich selbst aktualisieren? Die Frage kommt VOR jeder
 * Aenderung. Die Antwort ist ein Satz fuer einen Menschen, das Technische
 * steht im Log (J35).
 */
async function wegPruefen() {
  if (process.env.AKTUALISIERUNG_AUS === 'true') {
    return {
      moeglich: false,
      grund: 'Aktualisieren über die Schnittstelle ist hier abgeschaltet.',
    };
  }
  try {
    const host = await ermittleHost();
    if (!host.wurzel || !SICHERER_PFAD.test(host.wurzel)) {
      logger.info(`Aktualisierung: kein brauchbares Arbeitsverzeichnis (${host.wurzel})`);
      return {
        moeglich: false,
        grund:
          'Dieses Gerät weiß nicht, aus welchem Ordner es läuft. Ihr Betreuer spielt die Aktualisierung ein.',
      };
    }
    if (!host.ablage || !SICHERER_PFAD.test(host.ablage)) {
      return {
        moeglich: false,
        grund: 'Dieses Gerät hat keinen Platz für Aktualisierungen. Ihr Betreuer spielt sie ein.',
      };
    }
    return { moeglich: true, grund: null, host };
  } catch (fehler) {
    logger.info(`Aktualisierung nicht moeglich: ${fehler.message}`);
    return {
      moeglich: false,
      grund:
        'Dieses Gerät kann sich nicht selbst aktualisieren. Ihr Betreuer spielt die Aktualisierung ein.',
    };
  }
}

/**
 * Die Nummer, gegen die verglichen wird. Ein Geraet, dessen Stand aus dem
 * Deploy kommt (`JJJJMMTT-<sha>`), traegt keine Release-Nummer -- aber den
 * Ordner einer (`arasul-0.8.14`).
 */
function installierteNummer(wurzel) {
  const fassung = versionBekannt() ? versionFuerVergleich() : null;
  if (fassung && istReleaseNummer(fassung)) {
    return fassung;
  }
  const treffer = String(wurzel || '').match(/arasul-(\d+\.\d+\.\d+)\/?$/);
  return treffer ? treffer[1] : null;
}

// ---------------------------------------------------------------------------
// Das Release
// ---------------------------------------------------------------------------

/** Die neueste Fassung im Netz. `null` heisst: nicht erreichbar oder keine Antwort. */
async function neuesteFassung() {
  try {
    const antwort = await axios.get(`https://api.github.com/repos/${REPO}/releases/latest`, {
      timeout: 15_000,
      headers: {
        'User-Agent': `Arasul/${versionFuerVergleich()}`,
        Accept: 'application/vnd.github+json',
      },
    });
    const treffer = String(antwort.data?.tag_name || '').match(/(\d+\.\d+\.\d+)$/);
    return treffer
      ? {
          fassung: treffer[1],
          hinweise: antwort.data?.body || null,
          veroeffentlicht: antwort.data?.published_at || null,
        }
      : null;
  } catch (fehler) {
    logger.warn(`Neueste Fassung nicht erfragt: ${fehler.message}`);
    return null;
  }
}

async function ladeHerunter(url, ziel, maxBytes) {
  const antwort = await axios.get(url, {
    responseType: 'stream',
    timeout: 60_000,
    maxContentLength: maxBytes,
    maxRedirects: 5,
    headers: { 'User-Agent': `Arasul/${versionFuerVergleich()}` },
  });
  const schreiber = fsSync.createWriteStream(ziel);
  let bytes = 0;
  await new Promise((fertig, scheitern) => {
    antwort.data.on('data', stueck => {
      bytes += stueck.length;
      if (bytes > maxBytes) {
        antwort.data.destroy(new Error('Das Paket ist größer als erlaubt.'));
      }
    });
    antwort.data.on('error', scheitern);
    schreiber.on('error', scheitern);
    schreiber.on('finish', fertig);
    antwort.data.pipe(schreiber);
  });
  return bytes;
}

function sha256Datei(pfad) {
  return new Promise((fertig, scheitern) => {
    const hash = crypto.createHash('sha256');
    fsSync
      .createReadStream(pfad)
      .on('data', stueck => hash.update(stueck))
      .on('error', scheitern)
      .on('end', () => fertig(hash.digest('hex')));
  });
}

/** Das Artefakt und seine Pruefsumme holen und gegeneinander pruefen. */
async function holeArtefakt(fassung) {
  await fs.mkdir(ABLAGE, { recursive: true });
  const name = `arasul-${fassung}.tar.gz`;
  const ziel = path.join(ABLAGE, name);
  const basis = `https://github.com/${REPO}/releases/download/v${fassung}`;

  await ladeHerunter(`${basis}/${name}`, ziel, MAX_ARTEFAKT_BYTES);
  const summenDatei = path.join(ABLAGE, `${name}.sha256`);
  await ladeHerunter(`${basis}/${name}.sha256`, summenDatei, 4096);

  const erwartet = (String(await fs.readFile(summenDatei, 'utf8')).match(/\b([0-9a-f]{64})\b/i) ||
    [])[1];
  if (!erwartet) {
    throw new ValidationError(`Zu ${name} gibt es keine lesbare Prüfsumme.`);
  }
  const gemessen = await sha256Datei(ziel);
  if (gemessen !== erwartet.toLowerCase()) {
    await fs.rm(ziel, { force: true });
    throw new ValidationError(
      `Die Prüfsumme von ${name} stimmt nicht. Das Paket wurde verworfen, am Gerät wurde nichts verändert.`
    );
  }
  return { name, pfad: ziel };
}

// ---------------------------------------------------------------------------
// Der Hilfscontainer
// ---------------------------------------------------------------------------

/**
 * Das Skript am Host starten, losgeloest von diesem Backend.
 *
 * Alles, was in die Befehlszeile kommt, ist vorher gegen enge Muster geprueft
 * (Fassung, Lauf, Pfade): hier steht ein Befehl, der als root am Host laeuft.
 */
async function starteAmHost(host, argumente) {
  const skript = `${host.wurzel}/scripts/deploy/fassung-einspielen.sh`;
  for (const teil of [skript, ...argumente]) {
    if (!/^[A-Za-z0-9_./-]+$/.test(teil)) {
      throw new ValidationError('Ein Wert für die Aktualisierung enthält unerlaubte Zeichen.');
    }
  }
  const befehl = `bash ${skript} ${argumente.join(' ')}`;
  // Als der Benutzer, dem das Verzeichnis gehoert: dort liegt der Zustand, und
  // `install.sh` laeuft ohne root (`sudo -n` fuer das, was es braucht).
  const huelle = `u=$(stat -c %U ${host.wurzel}); exec su -l "$u" -c '${befehl}'`;

  const docker = dockerService.docker;
  try {
    await docker.getContainer(HILFSCONTAINER).remove({ force: true });
  } catch {
    // war keiner da
  }
  const eigenes = host.info.Image;
  const container = await docker.createContainer({
    name: HILFSCONTAINER,
    Image: eigenes,
    User: 'root',
    Cmd: ['nsenter', '-t', '1', '-m', '-u', '-i', '-n', '-p', '--', 'bash', '-c', huelle],
    Labels: { 'arasul.aktualisierung': '1' },
    // Das Image des Backends bringt dessen Healthcheck mit; im Hilfscontainer
    // wird er nie gruen und liesse ihn „unhealthy" melden (J39, Orin 02.10.2026).
    Healthcheck: { Test: ['NONE'] },
    HostConfig: {
      Privileged: true,
      PidMode: 'host',
      RestartPolicy: { Name: 'no' },
      // Nach dem Lauf weg: ein stehengebliebener Container ist ein Ziel fuer den
      // Selbstheilungsdienst, und das Ergebnis steht in `status.json`.
      AutoRemove: true,
    },
  });
  await container.start();
  logger.info(`Aktualisierung: Hilfscontainer ${HILFSCONTAINER} gestartet`);
}

// ---------------------------------------------------------------------------
// Von aussen
// ---------------------------------------------------------------------------

/**
 * Was die Schnittstelle und die Oberflaeche zeigen: die eigene Fassung, ob das
 * Einspielen geht, der Stand des letzten oder laufenden Laufs mit den letzten
 * Zeilen seines Protokolls, und die vorige Fassung (der Rueckweg).
 */
async function stand() {
  const weg = await wegPruefen();
  const datei = await leseStatusDatei();
  let lauf = datei;

  // „laeuft", aber nichts laeuft mehr: der Hilfscontainer ist weg oder
  // beendet, und das Backend selbst arbeitet auch nicht. Das ist ein
  // Abbruch und kein Fortschritt -- ehrlich benennen statt ewig „laeuft".
  if (lauf?.status === 'laeuft' && !imProzess && !(await hilfeLaeuft())) {
    lauf = {
      ...lauf,
      status: 'abgebrochen',
      meldung:
        'Der Lauf ist abgebrochen, ohne ein Ergebnis zu melden. Das Protokoll sagt, wie weit er kam.',
    };
  }

  return {
    fassung: {
      version: versionBekannt() ? versionFuerVergleich() : null,
      nummer: installierteNummer(weg.host?.wurzel),
    },
    einspielenMoeglich: weg.moeglich,
    einspielenGrund: weg.grund,
    laeuft: lauf?.status === 'laeuft',
    lauf: lauf ? { ...lauf, protokoll: await logEnde() } : null,
    zurueckMoeglich: Boolean(
      lauf?.vorigeFassung && lauf?.vorigerOrdner && lauf?.status === 'fertig'
    ),
    vorige: lauf?.vorigeFassung ? { fassung: lauf.vorigeFassung } : null,
  };
}

async function pruefePlatz() {
  const sf = await fs.statfs(UPDATES_ORDNER);
  const frei = Number(sf.bavail) * Number(sf.bsize);
  if (frei < MIN_FREI_BYTES) {
    throw new ServiceUnavailableError(
      `Auf dem Gerät sind nur ${(frei / 1024 ** 3).toFixed(1).replace('.', ',')} GB frei. ` +
        'Für eine Aktualisierung braucht es mindestens 8 GB.'
    );
  }
}

async function pruefeNichtBesetzt() {
  if (imProzess || (await hilfeLaeuft())) {
    throw new ConflictError('Es läuft schon eine Aktualisierung.');
  }
}

/**
 * Eine Fassung einspielen.
 *
 * Antwortet, sobald die Vorpruefungen durch sind; Herunterladen, Sichern und
 * Einspielen laufen danach weiter, und `stand()` zeigt den Fortschritt.
 *
 * @param {{fassung?: string, durch?: string}} optionen
 */
async function spieleEin({ fassung = null, durch = null } = {}) {
  await pruefeNichtBesetzt();
  const weg = await wegPruefen();
  if (!weg.moeglich) {
    throw new ServiceUnavailableError(weg.grund);
  }

  const aktuell = installierteNummer(weg.host.wurzel);
  if (!aktuell) {
    throw new ConflictError(
      'Dieses Gerät kennt seine eigene Fassung nicht. Ob eine andere neuer ist, lässt sich damit nicht entscheiden.'
    );
  }

  let ziel = fassung;
  if (!ziel) {
    const neueste = await neuesteFassung();
    if (!neueste) {
      throw new ServiceUnavailableError(
        'Die neueste Fassung ließ sich nicht erfragen. Ist das Gerät im Netz?'
      );
    }
    ziel = neueste.fassung;
  }
  if (!FASSUNG.test(ziel)) {
    throw new ValidationError('Eine Fassung hat die Form X.Y.Z, zum Beispiel 0.8.15.');
  }
  if (vergleiche(ziel, aktuell) <= 0) {
    throw new ConflictError(
      `Das Gerät trägt schon ${aktuell}. ${ziel} ist nicht neuer, und das Gerät stuft sich nicht von selbst herunter.`
    );
  }
  await pruefePlatz();

  const lauf = `${Date.now().toString(36)}`;
  imProzess = lauf;
  await fs.rm(LOG_DATEI, { force: true });
  await schreibeStatus({
    lauf,
    art: 'einspielen',
    status: 'laeuft',
    schritt: 'herunterladen',
    meldung: `Die Fassung ${ziel} wird geholt`,
    von: aktuell,
    nach: ziel,
    ordner: weg.host.wurzel,
    vorigeFassung: '',
    vorigerOrdner: '',
    gestartet: new Date().toISOString(),
    beendet: null,
    durch: durch || null,
  });

  // Hintergrund: der Aufrufer bekommt seine Antwort, der Rest steht im Status.
  weiter(lauf, ziel, aktuell, weg.host)
    .catch(async fehler => {
      logger.error(`Aktualisierung gescheitert: ${fehler.message}`);
      await protokolliere(`Gescheitert: ${fehler.message}`).catch(() => {});
      await schreibeStatus({
        status: 'fehlgeschlagen',
        meldung: fehler.message,
        beendet: new Date().toISOString(),
      }).catch(() => {});
    })
    .finally(() => {
      imProzess = null;
    });

  return { lauf, von: aktuell, nach: ziel };
}

async function weiter(lauf, ziel, aktuell, host) {
  await protokolliere(`Einspielen ${aktuell} -> ${ziel}`);
  const artefakt = await holeArtefakt(ziel);
  await protokolliere(`Paket geholt und geprüft: ${artefakt.name}`);

  await schreibeStatus({ schritt: 'sichern', meldung: 'Vor dem Einspielen wird gesichert' });
  const sicherung = await sicherungsdienst.sichereJetzt();
  if (!sicherung.erfolg) {
    throw new ServiceUnavailableError(
      'Die Sicherung vor dem Einspielen ist fehlgeschlagen. Es wurde nichts verändert.'
    );
  }
  await protokolliere(`Sicherung fertig (${sicherung.bericht?.total_size || 'Größe unbekannt'})`);
  await schreibeStatus({
    sicherung: {
      zeitpunkt: sicherung.bericht?._geschrieben || new Date().toISOString(),
      groesse: sicherung.bericht?.total_size || null,
    },
    schritt: 'uebergabe',
    meldung: 'Das Einspielen übernimmt der Gerätedienst',
  });

  // Die Ablage am Host, nicht im Container.
  const amHost = path.join(host.ablage, artefakt.name);
  await starteAmHost(host, ['einspielen', amHost, ziel, lauf]);
}

/** Zurueck auf die vorige Fassung -- ein Weg, kein Datenrueckgriff (siehe das Skript). */
async function zurueck({ durch = null } = {}) {
  await pruefeNichtBesetzt();
  const weg = await wegPruefen();
  if (!weg.moeglich) {
    throw new ServiceUnavailableError(weg.grund);
  }
  const datei = await leseStatusDatei();
  if (!datei?.vorigeFassung) {
    throw new NotFoundError('Es gibt keine vorige Fassung, auf die das Gerät zurück könnte.');
  }

  const lauf = `${Date.now().toString(36)}`;
  await fs.rm(LOG_DATEI, { force: true });
  await schreibeStatus({
    lauf,
    art: 'zurueck',
    status: 'laeuft',
    schritt: 'uebergabe',
    meldung: `Zurück auf ${datei.vorigeFassung}`,
    von: installierteNummer(weg.host.wurzel),
    nach: datei.vorigeFassung,
    gestartet: new Date().toISOString(),
    beendet: null,
    durch: durch || null,
  });
  await starteAmHost(weg.host, ['zurueck', lauf]);
  return { lauf, nach: datei.vorigeFassung };
}

module.exports = {
  stand,
  spieleEin,
  zurueck,
  neuesteFassung,
  wegPruefen,
  // fuer Tests
  vergleiche,
  installierteNummer,
  STATUS_DATEI,
  FASSUNG,
};
