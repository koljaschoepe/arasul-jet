/**
 * Sichern und wiederherstellen ueber die Schnittstelle (Phase C9 des Umbaus
 * vom 26.08.2026).
 *
 * WARUM DAS BACKEND DAS NICHT SELBST TUT. Die Sicherung braucht `pg_dump`,
 * `openssl` und den Sicherungsschluessel; alles drei liegt im
 * Sicherungs-Container und nicht hier. Ein zweiter Weg, der dasselbe noch
 * einmal koennte, waere ein zweiter Ort, an dem der naechste
 * Verschluesselungsfehler zu suchen ist. Dieser Baustein ruft deshalb die
 * Skripte im Sicherungs-Container -- ueber den Docker-Proxy, der genau dafuer
 * `EXEC: 1` gesetzt hat (`compose/compose.core.yaml`).
 *
 * WAS ER ZUSAETZLICH TUT, UND WARUM NUR ER ES KANN: nach einer
 * Wiederherstellung stehen die Pakete der Apps wieder auf der Platte und ihre
 * Zeilen wieder in `app_staende` -- aber es laeuft kein einziger Container,
 * und auf einem leeren Geraet gibt es auch kein Image mehr. Beides ist Sache
 * des Backends: `appStore.spieleEin` liest das Manifest aus dem
 * zurueckgeholten Paket, baut das Image bei Bedarf neu, vergibt einen frischen
 * Schluessel und startet den Container. Der Sicherungs-Container koennte das
 * nicht, ohne die halbe Plattform noch einmal zu sein.
 *
 * DER FRISCHE SCHLUESSEL IST KEIN NEBENEFFEKT, SONDERN RICHTIG SO: der alte
 * steckte in der Umgebung eines Containers, den es nicht mehr gibt. Sein
 * bcrypt-Abdruck kommt mit der Datenbank zurueck und passt zu nichts; ein
 * neuer Container braucht einen neuen Schluessel (`services/app/appSchluessel.js`).
 */

const fs = require('fs').promises;
const path = require('path');

const db = require('../../database');
const logger = require('../../utils/logger');
const {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} = require('../../utils/errors');
const dockerService = require('../core/docker');
const appStore = require('../app/appStore');

/** Wo die Sicherungen fuer DIESEN Prozess liegen (nur lesend eingehaengt). */
const SICHERUNGS_ORDNER = process.env.BACKUP_REPORT_PATH
  ? path.dirname(process.env.BACKUP_REPORT_PATH)
  : '/arasul/backups';

const BERICHT = path.join(SICHERUNGS_ORDNER, 'backup_report.json');
const EXTERN_BERICHT = path.join(SICHERUNGS_ORDNER, 'extern_bericht.json');
const DRILL_BERICHT = path.join(SICHERUNGS_ORDNER, 'restore_drill_report.json');
const WIEDERHER_BERICHT = path.join(SICHERUNGS_ORDNER, 'wiederherstellung_bericht.json');

/**
 * Welcher Sicherungsdienst gemeint ist -- MIT dem Praefix des Stacks.
 *
 * Auf dem Orin laufen zwei Stacks: der Betrieb und der Pruefstand
 * (`compose/pruefstand.vars`, `CONTAINER_PREFIX=pruef-`). Containernamen sind
 * global und nicht je Projekt; ohne das Praefix wuerde das Backend des
 * PRUEFSTANDS den Sicherungsdienst des BETRIEBS ansprechen -- und die
 * Wiederherstellung, die eine Abnahme dort ausloest, traefe die Daten des
 * Kunden. Genau dafuer gibt es den Pruefstand nicht.
 */
const CONTAINER = `${process.env.CONTAINER_PREFIX || ''}backup-service`;

/**
 * Nur eines zur Zeit. Sichern und Wiederherstellen greifen auf dieselbe
 * Datenbank und dieselben Dateien zu; zwei Laeufe gleichzeitig wuerden sich
 * gegenseitig die Grundlage wegziehen. Ein Merker im Prozess reicht: es gibt
 * genau ein Backend am Geraet.
 */
let laeuftGerade = null;

/** Ein JSON-Bericht aus dem Sicherungsordner, oder `null`. */
async function leseBericht(pfad) {
  try {
    const roh = await fs.readFile(pfad, 'utf8');
    const inhalt = JSON.parse(roh);
    const stat = await fs.stat(pfad);
    return { ...inhalt, _geschrieben: stat.mtime.toISOString(), _alterStunden: alterIn(stat) };
  } catch {
    return null;
  }
}

function alterIn(stat) {
  return Math.round((Date.now() - stat.mtimeMs) / 36e5);
}

/**
 * Steuerzeichen raus, Zeilenumbrueche und Tabulatoren bleiben.
 *
 * Kein regulaerer Ausdruck: einer mit Steuerzeichen darin ist schwer zu lesen
 * und die Regel `no-control-regex` verbietet ihn zu Recht. Hier steht in einer
 * Zeile, was gemeint ist.
 */
function ohneSteuerzeichen(text) {
  return Array.from(text)
    .filter(zeichen => {
      const nummer = zeichen.codePointAt(0);
      return nummer > 31 || nummer === 9 || nummer === 10;
    })
    .join('');
}

/**
 * Ein Skript im Sicherungs-Container laufen lassen.
 *
 * Ueber dockerode und den Proxy, nicht ueber ein `docker`-Programm: im
 * Backend-Image gibt es keines (`apk add git tzdata`), und ein Aufruf davon
 * scheitert mit ENOENT -- genau daran ist der Aktualisierungsweg jahrelang
 * still gescheitert.
 *
 * Die Ausgabe wird eingesammelt und gekuerzt zurueckgegeben: sie ist die
 * einzige Erklaerung, die ein Mensch bekommt, wenn etwas schiefgeht, und sie
 * gehoert deshalb in die Antwort und nicht nur ins Protokoll.
 *
 * @param {string[]} befehl
 * @param {number} zeitlimitMs
 */
async function imContainer(befehl, zeitlimitMs) {
  const docker = dockerService.docker;
  const container = docker.getContainer(CONTAINER);

  let laeuft = false;
  try {
    const info = await container.inspect();
    laeuft = info.State?.Running === true;
  } catch (fehler) {
    if (fehler.statusCode === 404) {
      throw new ServiceUnavailableError(
        `Den Sicherungsdienst (${CONTAINER}) gibt es an diesem Geraet nicht. ` +
          'Ohne ihn laesst sich weder sichern noch wiederherstellen.'
      );
    }
    throw fehler;
  }
  if (!laeuft) {
    throw new ServiceUnavailableError(
      `Der Sicherungsdienst (${CONTAINER}) laeuft nicht. ` + 'Erst starten, dann noch einmal.'
    );
  }

  const exec = await container.exec({
    Cmd: befehl,
    AttachStdout: true,
    AttachStderr: true,
  });
  const strom = await exec.start({ hijack: true, stdin: false });

  const zeilen = [];
  await new Promise((fertig, scheitern) => {
    const uhr = setTimeout(() => {
      scheitern(
        new ServiceUnavailableError(
          `${befehl[0]} hat nach ${Math.round(zeitlimitMs / 1000)}s nicht geantwortet`
        )
      );
    }, zeitlimitMs);
    strom.on('data', stueck => {
      // Docker mischt stdout und stderr in EINEN Strom und stellt jedem Block
      // acht Byte Vorspann voran (Stream-Kennung und Laenge). Ein Protokoll
      // braucht davon nichts: die Steuerzeichen fliegen raus, die Zeilen
      // bleiben lesbar. Ein sauberes Demultiplexen waere hier mehr Code als
      // Nutzen -- wer die Trennung von stdout und stderr braucht, liest die
      // Protokolldatei im Sicherungsordner.
      zeilen.push(ohneSteuerzeichen(stueck.toString('utf8')));
    });
    strom.on('end', () => {
      clearTimeout(uhr);
      fertig();
    });
    strom.on('error', fehler => {
      clearTimeout(uhr);
      scheitern(fehler);
    });
  });

  const ergebnis = await exec.inspect();
  const ausgabe = zeilen.join('').trim();
  return {
    code: ergebnis.ExitCode ?? -1,
    ausgabe: ausgabe.length > 4000 ? `…${ausgabe.slice(-4000)}` : ausgabe,
  };
}

/**
 * Was liegt an Sicherungen da?
 *
 * Gelesen wird die Platte und nicht der Bericht: der Bericht sagt, was die
 * letzte Nacht getan hat, die Platte sagt, was heute noch zurueckspielbar ist.
 * Das ist nicht dasselbe -- eine geloeschte Datei aendert den Bericht nicht.
 */
async function sicherungen() {
  const arten = [
    ['postgres', 'postgres', '.sql.gz', 'Datenbank'],
    ['apps', 'apps', '.tar.gz', 'Die Pakete der Apps'],
    ['flows', 'flows', '.tar.gz', 'Flow-Dateien am Geraet'],
    ['config', 'config', '.tar.gz', 'Konfiguration ohne den Sicherungsschluessel'],
  ];

  const liste = [];
  for (const [art, ordner, endung, zweck] of arten) {
    let eintraege;
    try {
      eintraege = await fs.readdir(path.join(SICHERUNGS_ORDNER, ordner));
    } catch {
      continue; // Diesen Ordner gibt es (noch) nicht — kein Fehler.
    }
    for (const name of eintraege) {
      if (!name.endsWith(endung) || name.includes('latest')) {
        continue;
      }
      const voll = path.join(SICHERUNGS_ORDNER, ordner, name);
      const stat = await fs.stat(voll).catch(() => null);
      if (!stat || !stat.isFile()) {
        continue;
      }
      liste.push({
        art,
        zweck,
        name,
        bytes: stat.size,
        zeitpunkt: stat.mtime.toISOString(),
      });
    }
  }

  liste.sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt));
  return liste;
}

/**
 * Der Zustand der Sicherung, wie ihn ein Mensch oder ein Ara-Kit liest.
 *
 * Die Frage „wann lag zuletzt eine Kopie AUSSERHALB des Geraets" wird getrennt
 * beantwortet und aus einer eigenen Datei: der Tagesbericht wird jede Nacht
 * ueberschrieben, und ein Stick, der eine Nacht nicht steckte, darf das Datum
 * der letzten echten Kopie nicht loeschen. Steckte noch nie einer, ist die
 * Antwort leer -- und sagt das, statt zu schweigen.
 */
async function status() {
  const [bericht, extern, drill, wieder] = await Promise.all([
    leseBericht(BERICHT),
    leseBericht(EXTERN_BERICHT),
    leseBericht(DRILL_BERICHT),
    leseBericht(WIEDERHER_BERICHT),
  ]);

  const veraltet = !bericht || bericht._alterStunden > 48;

  return {
    // Sichert dieses Geraet? Nicht „koennte es", sondern „hat es".
    sichertWirklich: bericht?.status === 'completed' && !veraltet,
    letzteSicherung: bericht
      ? {
          status: bericht.status,
          zeitpunkt: bericht.timestamp ?? null,
          alterStunden: bericht._alterStunden,
          veraltet,
          verschluesselt: bericht.encrypted === 'true' || bericht.encrypted === true,
          groesse: bericht.total_size ?? null,
          apps: bericht.apps_status ?? null,
          flows: bericht.flows_status ?? null,
          konfiguration: bericht.config_status ?? null,
        }
      : { status: 'fehlt', zeitpunkt: null, alterStunden: null, veraltet: true },
    // Leer, wenn noch nie eine Kopie ausserhalb entstanden ist.
    ausserhalb: extern
      ? {
          vorhanden: true,
          zeitpunkt: extern.zeitpunkt ?? null,
          bytes: extern.bytes ?? null,
          dateien: extern.dateien ?? null,
          ziel: extern.ziel ?? null,
          letzterVersuch: bericht?.extern_status ?? null,
        }
      : {
          vorhanden: false,
          zeitpunkt: null,
          bytes: null,
          dateien: null,
          ziel: null,
          letzterVersuch: bericht?.extern_status ?? null,
        },
    wiederherstellungstest: drill
      ? {
          status: drill.status,
          zeitpunkt: drill.timestamp ?? null,
          tabellen: drill.verified_tables,
        }
      : { status: 'nie_gelaufen', zeitpunkt: null, tabellen: null },
    letzteWiederherstellung: wieder
      ? { status: wieder.status, zeitpunkt: wieder.zeitpunkt ?? null, grund: wieder.grund }
      : null,
    laeuftGerade,
  };
}

/** Jetzt sichern. Dauert am Jetson Minuten, nicht Sekunden. */
async function sichereJetzt() {
  if (laeuftGerade) {
    throw new ConflictError(`Es laeuft gerade: ${laeuftGerade}`);
  }
  laeuftGerade = 'sicherung';
  try {
    const { code, ausgabe } = await imContainer(['/usr/local/bin/backup.sh'], 30 * 60_000);
    const bericht = await leseBericht(BERICHT);
    if (code !== 0 || bericht?.status !== 'completed') {
      logger.error('Sicherung fehlgeschlagen', { code, ausgabe });
      return { erfolg: false, code, ausgabe, bericht };
    }
    logger.info(`Sicherung fertig (${bericht.total_size})`);
    return { erfolg: true, code, ausgabe, bericht };
  } finally {
    laeuftGerade = null;
  }
}

/**
 * Zurueck auf eine Sicherung -- und danach laeuft die Beispielapp wieder.
 *
 * Zwei Schritte, und der zweite ist der, den man vergisst:
 *
 *   1. `wiederherstellen.sh` im Sicherungs-Container: Datenbank, die Pakete
 *      der Apps, die Flow-Dateien.
 *   2. HIER: fuer jede Zeile in `app_staende` einmal `spieleEin`. Das baut das
 *      Image aus dem zurueckgeholten Paket (auf einem leeren Geraet gibt es
 *      keines mehr), vergibt einen frischen Schluessel und startet den
 *      Container.
 *
 * Ohne Schritt 2 waere die Wiederherstellung eine Datenbank voller Apps, von
 * denen keine antwortet -- und genau danach fragt Abnahme A6.
 *
 * EINE APP, DIE NICHT HOCHKOMMT, HAELT DIE ANDEREN NICHT AUF. Sie wird
 * genannt, nicht verschwiegen: wer neun von zehn Apps zurueckbekommt, muss
 * wissen, welche die zehnte ist.
 */
async function stelleWiederHer({ datei = null, durch = null } = {}) {
  if (laeuftGerade) {
    throw new ConflictError(`Es laeuft gerade: ${laeuftGerade}`);
  }
  // Ein Dateiname, kein Pfad. Das Skript prueft es noch einmal, aber ein
  // Aufruf, der `../` durchreicht, hat hier schon nichts verloren.
  if (datei && !/^[A-Za-z0-9._-]+$/.test(datei)) {
    throw new ValidationError(
      'Der Name der Sicherung darf nur Buchstaben, Ziffern, Punkt, Strich und Unterstrich enthalten.'
    );
  }

  laeuftGerade = 'wiederherstellung';
  try {
    const befehl = ['/usr/local/bin/wiederherstellen.sh'];
    if (datei) {
      befehl.push('--datei', datei);
    }
    const { code, ausgabe } = await imContainer(befehl, 60 * 60_000);
    const bericht = await leseBericht(WIEDERHER_BERICHT);

    if (code !== 0) {
      logger.error('Wiederherstellung fehlgeschlagen', { code, ausgabe });
      return { erfolg: false, code, ausgabe, bericht, apps: [] };
    }

    const apps = await baueAppsNeu(durch);
    const gescheitert = apps.filter(a => !a.erfolg);
    logger.info(
      `Wiederherstellung fertig: ${apps.length - gescheitert.length} von ${apps.length} App-Staenden laufen`
    );
    return { erfolg: gescheitert.length === 0, code, ausgabe, bericht, apps };
  } finally {
    laeuftGerade = null;
  }
}

/**
 * Jeden App-Stand aus seinem zurueckgeholten Paket neu aufbauen.
 *
 * Nacheinander und nicht gleichzeitig: `spieleEin` baut Images, und zwei
 * Docker-Builds parallel auf einem Jetson heisst, dass beide langsamer sind
 * als einer nach dem anderen -- und die Wiederherstellung laeuft ohnehin nur,
 * wenn gerade sonst nichts los ist.
 */
async function baueAppsNeu(durch) {
  const { rows } = await db.query(
    `SELECT app_id, stand, version
       FROM public.app_staende
      ORDER BY app_id, stand`
  );

  const ergebnisse = [];
  for (const zeile of rows) {
    try {
      await appStore.spieleEin({
        appId: zeile.app_id,
        version: zeile.version,
        stand: zeile.stand,
        durch,
      });
      ergebnisse.push({ ...zeile, erfolg: true, grund: null });
    } catch (fehler) {
      logger.error(`App ${zeile.app_id} ${zeile.version} (${zeile.stand}) kam nicht zurueck`, {
        error: fehler.message,
      });
      ergebnisse.push({ ...zeile, erfolg: false, grund: fehler.message });
    }
  }
  return ergebnisse;
}

/**
 * Den Wiederherstellungstest anstossen: eine Wegwerf-Datenbank, die neueste
 * Sicherung hinein, nachzaehlen. Er faellt nicht ueber den Betrieb her.
 */
async function testeWiederherstellung() {
  if (laeuftGerade) {
    throw new ConflictError(`Es laeuft gerade: ${laeuftGerade}`);
  }
  laeuftGerade = 'wiederherstellungstest';
  try {
    const { code, ausgabe } = await imContainer(['/usr/local/bin/restore-drill.sh'], 30 * 60_000);
    const bericht = await leseBericht(DRILL_BERICHT);
    if (!bericht) {
      throw new NotFoundError('Der Test hat keinen Bericht hinterlassen');
    }
    return { erfolg: code === 0 && bericht.status === 'ok', code, ausgabe, bericht };
  } finally {
    laeuftGerade = null;
  }
}

module.exports = {
  SICHERUNGS_ORDNER,
  status,
  sicherungen,
  sichereJetzt,
  stelleWiederHer,
  testeWiederherstellung,
  baueAppsNeu,
};
