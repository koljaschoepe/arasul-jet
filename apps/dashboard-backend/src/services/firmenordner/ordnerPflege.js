/**
 * Pflege der Ablage des Firmenordners (J33, 01.10.2026): Revisionen und
 * abgebrochene Uploads wachsen nicht still.
 *
 * WAS OPENCLOUD SELBST ANBIETET, UND WAS NICHT (am 01.10.2026 am Orin an einem
 * Wegwerf-Container der Fassung 8.0.1 gemessen, nicht aus der Doku gelesen):
 *
 *   - UPLOADS: `opencloud storage-users uploads sessions --expired --clean`
 *     entfernt abgelaufene Sitzungen samt Daten. Der Dienst setzt jeder
 *     Sitzung einen Ablauf (`STORAGE_USERS_UPLOAD_EXPIRATION`, Vorgabe 24 h),
 *     raeumt aber NIE von selbst auf: am Orin lagen 98 MB von vor drei Tagen,
 *     Ablauf laengst vorbei. Also ruft dieses Geraet den Befehl, stuendlich.
 *     Eine noch laufende Sitzung fasst `--expired` nicht an (gemessen).
 *   - REVISIONEN: es gibt KEINE Aufbewahrungsgrenze (keine Anzahl, kein
 *     Alter). `opencloud revisions purge` kennt nur „alle"; sein `-r` je
 *     Datei greift auf der Ablage `posix` nicht (gemessen: „no nodes found"),
 *     und der Weg ueber WebDAV (`DELETE …/meta/<id>/v/<rev>`) antwortet 501.
 *     „Alle" waere das Ende von „frueheren Fassungen wiederherstellen".
 *     Was `purge` im Kern tut, ist aber nichts anderes, als je Revision die
 *     Datei `.oc-nodes/…/<knoten>.REV.<zeit>` und ihre Sperrdatei
 *     `.oc-nodes/locks/<knoten>.REV.<zeit>.mlock` zu entfernen. Genau das
 *     tut dieses Modul fuer die AELTESTEN Revisionen je Datei jenseits der
 *     Grenze, mit `rm` im Container des Dienstes (dort liegt die Ablage
 *     schreibbar, im Backend nur lesend). Gemessen: die verbleibende Fassung
 *     bleibt in der Liste und laesst sich zurueckholen, eine neue Fassung
 *     legt sich normal an, der Dienst meldet nichts.
 *
 * WARUM DIE SPALTE „PLATZ" KEINE REVISIONEN ZAEHLT. Die Belegung, die der
 * Dienst meldet (`quota.used`), ist die Summe der SICHTBAREN Dateien; Revisionen
 * und Papierkorb zaehlen nicht mit (gemessen: fuenf Fassungen einer Datei,
 * `used` blieb bei einer). Das ist als Grenze richtig und als Auskunft ueber
 * die Platte falsch -- deshalb liest `revisionenJeBereich` sie getrennt von der
 * Platte, und die Oberflaeche zeigt sie neben der Belegung.
 */

const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const { entflechter } = require('../../utils/dockerAusgabe');
const { ServiceUnavailableError } = require('../../utils/errors');
const dienst = require('./ordnerdienst');

/** Im Backend (nur lesend, `compose.app.yaml`) und im Container des Dienstes. */
// Als Objekt, damit ein Test die Ablage auf einen Wegwerfordner legen kann.
const orte = { backend: '/arasul/firmenordner/posix/projects' };
const ABLAGE_DIENST = '/var/lib/opencloud/posix/projects';
const CONTAINER = `${process.env.CONTAINER_PREFIX || ''}firmenordner`;

/**
 * Wie viele Fassungen je Datei bleiben: die zehn neuesten. Begruendung im PR
 * und in `docs/features/FIRMENORDNER.md`: ein Ordner, der jeden Tag abgeglichen
 * wird, haelt damit gut zwei Wochen zurueck -- weit genug, um einen Fehler
 * von letzter Woche zu finden, und ein Bruchteil dessen, was ohne Grenze ueber
 * Jahre zusammenkaeme. Einstellbar ueber `FIRMENORDNER_REVISIONEN_MAX`.
 */
function maxRevisionen() {
  const n = Number.parseInt(process.env.FIRMENORDNER_REVISIONEN_MAX, 10);
  return Number.isInteger(n) && n >= 1 ? n : 10;
}

const REVISION = /^(.+)\.REV\.(\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/;
const BEREICH = /^[A-Za-z0-9._-]+$/;

/** Go schneidet Nullen am Ende der Sekundenbruchteile ab; fuer den Vergleich auffuellen. */
function zeitSchluessel(zeit) {
  const [sekunden, bruch = 'Z'] = zeit.replace(/Z$/, '.').split('.');
  return `${sekunden}.${bruch.padEnd(9, '0')}`;
}

async function liesVerzeichnis(wurzel, segmente, treffer) {
  let eintraege;
  try {
    eintraege = await fs.promises.readdir(path.join(wurzel, ...segmente), { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return;
    }
    throw err;
  }
  for (const e of eintraege) {
    if (e.isDirectory()) {
      if (segmente.length === 0 && e.name === 'locks') {
        continue;
      }
      await liesVerzeichnis(wurzel, [...segmente, e.name], treffer);
      continue;
    }
    const m = REVISION.exec(e.name);
    if (!m) {
      continue;
    }
    const stat = await fs.promises.lstat(path.join(wurzel, ...segmente, e.name));
    treffer.push({
      segmente,
      datei: e.name,
      // Die Kennung des Knotens: die vier Verzeichnisse und der Rest des Namens.
      knoten: `${segmente.join('')}${m[1]}`,
      zeit: m[2],
      bytes: stat.size,
    });
  }
}

/** Alle Bereiche, die der Dienst auf der Platte hat. */
async function bereiche() {
  try {
    const liste = await fs.promises.readdir(orte.backend, { withFileTypes: true });
    return liste.filter(e => e.isDirectory() && BEREICH.test(e.name)).map(e => e.name);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

async function revisionenLesen(kennung) {
  const treffer = [];
  await liesVerzeichnis(path.join(orte.backend, kennung, '.oc-nodes'), [], treffer);
  return treffer;
}

const STAND_GUELTIG_MS = 5 * 60 * 1000;
let stand = null;

/**
 * Revisionen je Bereich, von der Platte: `{ kennung: { anzahl, bytes } }`.
 * Kurz gemerkt, weil die Verwaltung die Antwort bei jedem Oeffnen holt und
 * ein Lauf durch viele tausend Verzeichnisse nicht bei jedem Klick sein muss.
 * `null`, wenn die Ablage hier nicht lesbar ist.
 */
async function revisionenJeBereich() {
  if (stand && Date.now() - stand.zeit < STAND_GUELTIG_MS) {
    return stand.werte;
  }
  try {
    const werte = {};
    for (const kennung of await bereiche()) {
      const liste = await revisionenLesen(kennung);
      werte[kennung] = {
        anzahl: liste.length,
        bytes: liste.reduce((summe, r) => summe + r.bytes, 0),
      };
    }
    stand = { zeit: Date.now(), werte };
    return werte;
  } catch (err) {
    logger.warn(`Firmenordner: Revisionen nicht lesbar -- ${err.roh || err.message}`);
    return null;
  }
}

/** Ein Programm im Container des Dienstes, ohne Shell: die Argumente sind Argumente. */
async function imDienst(befehl, zeitlimitMs = 10 * 60 * 1000) {
  // Erst hier geladen: `dockerode` braucht nur der Lauf, nicht jede Verwaltungsfrage.
  const dockerService = require('../core/docker');
  const container = dockerService.docker.getContainer(CONTAINER);
  const info = await container.inspect();
  if (info.State?.Running !== true) {
    throw new ServiceUnavailableError(`${CONTAINER} läuft nicht`);
  }
  const exec = await container.exec({
    Cmd: befehl,
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });
  const strom = await exec.start({ hijack: true, stdin: false });
  const ausgabe = entflechter();
  await new Promise((fertig, scheitern) => {
    const uhr = setTimeout(
      () =>
        scheitern(
          new ServiceUnavailableError(`${befehl[0]} antwortete nicht in ${zeitlimitMs} ms`)
        ),
      zeitlimitMs
    );
    strom.on('data', stueck => ausgabe.schreibe(stueck));
    strom.on('end', () => {
      clearTimeout(uhr);
      fertig();
    });
    strom.on('error', err => {
      clearTimeout(uhr);
      scheitern(err);
    });
  });
  const ergebnis = await exec.inspect();
  return { code: ergebnis.ExitCode ?? -1, ausgabe: ausgabe.text().trim() };
}

/**
 * Abgelaufene, unvollstaendige Uploads vom Dienst entfernen lassen. Der Befehl
 * gehoert dem Dienst; hier wird nur gezaehlt, was er in seiner Tabelle nennt.
 */
async function uploadsAufraeumen() {
  if (!dienst.istAn()) {
    return { entfernt: 0 };
  }
  const { code, ausgabe } = await imDienst([
    'opencloud',
    'storage-users',
    'uploads',
    'sessions',
    '--expired',
    '--clean',
  ]);
  if (code !== 0) {
    throw new ServiceUnavailableError(
      `uploads sessions --clean endete mit ${code}: ${ausgabe.slice(-300)}`
    );
  }
  // Kopfzeile ausgenommen: Tabellenzeilen beginnen mit „│".
  const zeilen = ausgabe.split('\n').filter(z => z.startsWith('│')).length;
  const entfernt = Math.max(0, zeilen - 1);
  if (entfernt > 0) {
    logger.info(`Firmenordner: ${entfernt} abgelaufene Uploads entfernt`);
  }
  return { entfernt };
}

/**
 * Je Datei die aeltesten Revisionen jenseits von `max` entfernen -- samt ihrer
 * Sperrdatei, wie `opencloud revisions purge` es tut.
 */
async function revisionenBegrenzen({ max = maxRevisionen() } = {}) {
  if (!dienst.istAn()) {
    return { entfernt: 0, bytes: 0 };
  }
  const weg = [];
  let bytes = 0;
  for (const kennung of await bereiche()) {
    const jeKnoten = new Map();
    for (const r of await revisionenLesen(kennung)) {
      if (!jeKnoten.has(r.knoten)) {
        jeKnoten.set(r.knoten, []);
      }
      jeKnoten.get(r.knoten).push(r);
    }
    for (const liste of jeKnoten.values()) {
      if (liste.length <= max) {
        continue;
      }
      liste.sort((a, b) => zeitSchluessel(a.zeit).localeCompare(zeitSchluessel(b.zeit)));
      for (const r of liste.slice(0, liste.length - max)) {
        const knoten = `${ABLAGE_DIENST}/${kennung}/.oc-nodes`;
        weg.push(
          `${knoten}/${r.segmente.join('/')}/${r.datei}`,
          `${knoten}/locks/${r.knoten}.REV.${r.zeit}.mlock`
        );
        bytes += r.bytes;
      }
    }
  }
  for (let i = 0; i < weg.length; i += 200) {
    const { code, ausgabe } = await imDienst(['rm', '-f', '--', ...weg.slice(i, i + 200)]);
    if (code !== 0) {
      throw new ServiceUnavailableError(`rm endete mit ${code}: ${ausgabe.slice(-300)}`);
    }
  }
  stand = null;
  if (weg.length > 0) {
    logger.info(
      `Firmenordner: ${weg.length / 2} alte Revisionen entfernt (${bytes} Bytes), je Datei bleiben ${max}`
    );
  }
  return { entfernt: weg.length / 2, bytes };
}

const SPERRE =
  /^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:\.REV\.(\d{4}-\d{2}-\d{2}T[\d:.]+Z))?\.mlock$/;
/** Eine Sperrdatei, die juenger ist, gehoert vielleicht zu einem Schreibvorgang, der gerade laeuft. */
const SPERRE_MIN_ALTER_MS = 60 * 60 * 1000;

async function gibtEs(pfad) {
  try {
    await fs.promises.lstat(pfad);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

/**
 * Verwaiste Sperrdateien eines Bereichs: `locks/<knoten>.mlock` zu einem
 * Knoten, den es nicht mehr gibt, und `locks/<knoten>.REV.<zeit>.mlock` zu
 * einer Revision, die es nicht mehr gibt. Der Dienst legt sie leer an und
 * raeumt sie beim Entfernen nicht immer mit weg: in `firma` lagen am
 * 01.10.2026 9 646 davon, und sie sind die Ursache der 5 MB an Aktivitaeten
 * (`aenderungen`). Gemessen am Orin: von 400 Stichproben fehlte bei allen der
 * Knoten.
 */
async function verwaisteSperren(kennung) {
  const knoten = path.join(orte.backend, kennung, '.oc-nodes');
  let namen;
  try {
    namen = await fs.promises.readdir(path.join(knoten, 'locks'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { gesamt: 0, weg: [] };
    }
    throw err;
  }
  const weg = [];
  const grenze = Date.now() - SPERRE_MIN_ALTER_MS;
  for (const name of namen) {
    const m = SPERRE.exec(name);
    if (!m) {
      continue;
    }
    const id = m[1].replace(/-/g, '');
    const kopf = [id.slice(0, 2), id.slice(2, 4), id.slice(4, 6), id.slice(6, 8)];
    // Die Verzeichnisse tragen die ersten acht Zeichen der UUID ohne Bindestriche
    // (`bc/3e/d2/2d`), der Rest des Namens behaelt seine Bindestriche.
    const rest = m[1].slice(8);
    const ziel = path.join(knoten, ...kopf, m[2] ? `${rest}.REV.${m[2]}` : rest);
    if (await gibtEs(ziel)) {
      continue;
    }
    const stat = await fs.promises.lstat(path.join(knoten, 'locks', name));
    if (stat.mtimeMs > grenze) {
      continue;
    }
    weg.push(`${ABLAGE_DIENST}/${kennung}/.oc-nodes/locks/${name}`);
  }
  return { gesamt: namen.length, weg };
}

/** Sperrdateien zu Knoten und Revisionen entfernen, die es nicht mehr gibt. */
async function sperrenAufraeumen() {
  if (!dienst.istAn()) {
    return { entfernt: 0 };
  }
  let entfernt = 0;
  for (const kennung of await bereiche()) {
    const { weg } = await verwaisteSperren(kennung);
    for (let i = 0; i < weg.length; i += 200) {
      const { code, ausgabe } = await imDienst(['rm', '-f', '--', ...weg.slice(i, i + 200)]);
      if (code !== 0) {
        throw new ServiceUnavailableError(`rm endete mit ${code}: ${ausgabe.slice(-300)}`);
      }
    }
    entfernt += weg.length;
  }
  if (entfernt > 0) {
    logger.info(`Firmenordner: ${entfernt} verwaiste Sperrdateien entfernt`);
  }
  return { entfernt };
}

const STUNDE_MS = 60 * 60 * 1000;

/**
 * Stuendlich die Uploads, alle sechs Stunden die Revisionen. Der erste Lauf
 * fuenf Minuten nach dem Start, wenn Dienste und Mounts da sind. Wirft nie:
 * ein Dienst, der gerade nicht antwortet, ist der naechste Lauf.
 *
 * @returns {NodeJS.Timeout[]} die Zeitgeber, fuer das geordnete Beenden
 */
function starten() {
  let runde = 0;
  const lauf = async () => {
    try {
      await uploadsAufraeumen();
      if (runde % 6 === 0) {
        await revisionenBegrenzen();
        await sperrenAufraeumen();
      }
    } catch (err) {
      logger.warn(`Firmenordner: Pflege der Ablage gescheitert -- ${err.roh || err.message}`);
    }
    runde += 1;
  };
  return [setTimeout(lauf, 5 * 60 * 1000), setInterval(lauf, STUNDE_MS)];
}

/** Den gemerkten Stand verwerfen (fuer Tests und nach einem Eingriff). */
function standVergessen() {
  stand = null;
}

module.exports = {
  orte,
  standVergessen,
  starten,
  uploadsAufraeumen,
  revisionenBegrenzen,
  sperrenAufraeumen,
  revisionenJeBereich,
  maxRevisionen,
  zeitSchluessel,
};
