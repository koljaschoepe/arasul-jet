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
const { entflechter } = require('../../utils/dockerAusgabe');
const {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} = require('../../utils/errors');
const dockerService = require('../core/docker');
const appStore = require('../app/appStore');
const appDatenbank = require('../app/appDatenbank');
const appContainer = require('../app/appContainer');

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
        `Den Sicherungsdienst (${CONTAINER}) gibt es an diesem Gerät nicht. ` +
          'Ohne ihn lässt sich weder sichern noch wiederherstellen.'
      );
    }
    throw fehler;
  }
  if (!laeuft) {
    throw new ServiceUnavailableError(
      `Der Sicherungsdienst (${CONTAINER}) läuft nicht. ` + 'Erst starten, dann noch einmal.'
    );
  }

  const exec = await container.exec({
    Cmd: befehl,
    AttachStdout: true,
    AttachStderr: true,
    // Ausdruecklich ohne Terminal: mit einem schrieben Werkzeuge Farben und
    // Fortschrittsbalken, und gelesen wird das in der Oberflaeche.
    Tty: false,
  });
  const strom = await exec.start({ hijack: true, stdin: false });

  // Der Strom traegt je Block acht Byte Vorspann (J35, 25.09.2026): sie
  // werden entflochten, nicht gefiltert -- siehe `utils/dockerAusgabe.js`.
  const ausgabeStrom = entflechter();
  await new Promise((fertig, scheitern) => {
    const uhr = setTimeout(() => {
      // Befehl und Pfad nur im Log (J35).
      logger.warn(`${befehl[0]} hat nach ${Math.round(zeitlimitMs / 1000)}s nicht geantwortet`);
      scheitern(
        new ServiceUnavailableError(
          `Die Sicherung hat nach ${Math.round(zeitlimitMs / 60000).toLocaleString('de-DE')} ` +
            'Minuten nicht geantwortet. Sehen Sie später unter „Sicherung“ nach, ob sie noch ' +
            'fertig wurde.'
        )
      );
    }, zeitlimitMs);
    strom.on('data', stueck => ausgabeStrom.schreibe(stueck));
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
  const ausgabe = ausgabeStrom.text().trim();
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
  // Als Objekte mit `zweck`, nicht als Tupel: `zweck` ist ein Satz, den die
  // Oberflaeche zeigt, und `__tests__/unit/kundensprache.test.js` liest ihn nur
  // unter diesem Schluessel. In einem Tupel stand er an ihm vorbei, und zwei
  // Beschriftungen mit ae/ue kamen so bis in die Liste (J35, Durchlauf 3).
  const arten = [
    { art: 'postgres', ordner: 'postgres', endung: '.sql.gz', zweck: 'Datenbank' },
    // Je App und Stand eine, im Unterordner (Phase H7). Sie stehen als eigene
    // Art da und nicht unter `postgres`: fuer den, der das Geraet betreibt,
    // sind es verschiedene Dinge -- die eine Zeile ist das Geraet, die anderen
    // sind die Daten je App, und wie viele es davon gibt, ist eine Auskunft.
    {
      art: 'app-datenbanken',
      ordner: 'postgres/apps',
      endung: '.sql.gz',
      zweck: 'Die Datenbanken der Apps',
    },
    { art: 'apps', ordner: 'apps', endung: '.tar.gz', zweck: 'Die Pakete der Apps' },
    { art: 'flows', ordner: 'flows', endung: '.tar.gz', zweck: 'Flow-Dateien am Gerät' },
    {
      art: 'config',
      ordner: 'config',
      endung: '.tar.gz',
      zweck: 'Konfiguration ohne den Sicherungsschlüssel',
    },
    // Der Firmenordner (J33): `backup.sh` sichert ihn seit dem 22.09.2026 nach
    // `firmenordner/`, die Liste fuehrte ihn bis J35 nicht -- wer nachsah, ob
    // die Dateien der Firma gesichert sind, fand keine Zeile dafuer.
    {
      art: 'firmenordner',
      ordner: 'firmenordner',
      endung: '.tar.gz',
      zweck: 'Die Dateien des Firmenordners',
    },
  ];

  const liste = [];
  for (const { art, ordner, endung, zweck } of arten) {
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
        // Bei den Datenbanken der Apps: WELCHE (J35). Aus dem Dateinamen, denn
        // nach dem Entfernen einer App gibt es keine Zeile mehr, die es sagte
        // -- und genau dann fragt jemand danach.
        ...(art === 'app-datenbanken'
          ? { datenbank: name.replace(/_\d{8}_\d{6}\.sql\.gz$/, '') }
          : {}),
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
          // Der Firmenordner (J33, 22.09.2026). Er steht hier und nicht nur im
          // Bericht auf der Platte, weil er der einzige der vier Toepfe ist, in
          // dem AUSSCHLIESSLICH Dinge liegen, die es nirgendwo sonst gibt:
          // Apps lassen sich neu einspielen, Flows neu schreiben, die
          // Konfiguration neu erzeugen. `null` heisst „dieses Geraet hat
          // keinen" -- das ist eine Auskunft und kein Fehlwert.
          firmenordner: bericht.firmenordner_status ?? null,
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
    throw new ConflictError(`Es läuft gerade: ${laeuftGerade}`);
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
    throw new ConflictError(`Es läuft gerade: ${laeuftGerade}`);
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
 * Die Daten EINER App zurueckholen, und nur sie (J35, 25.09.2026).
 *
 * Der ganze Weg zurueck (`stelleWiederHer`) ersetzt die ganze Datenbank des
 * Geraets -- wer die Daten einer entfernten App zurueckhaben will, naehme
 * damit jedem anderen Menschen und jeder anderen App, was seit der Sicherung
 * geschah. Dieser Weg fasst je Stand genau die eine Datenbank der App an
 * (`wiederherstellen.sh --app-datenbank`), vorher abgezogen.
 *
 * ES GEHT AUCH, WENN ES DIE APP GERADE NICHT GIBT. Die Namen kommen aus
 * `appDatenbank.namenFuer` und nicht aus einer Tabelle: nach dem Entfernen
 * gibt es keine Zeile mehr, und genau dann wird dieser Weg gebraucht. Die Rolle
 * steht danach mit einem Zufallswert da; das naechste Einspielen der App
 * findet Rolle und Datenbank vor und setzt sein Passwort (`sorgeFuer`) -- die
 * Daten bleiben, wie sie sind. Ist die App eingespielt, setzt dieser Aufruf
 * das Passwort selbst und startet ihren Container neu: seine offenen
 * Verbindungen hat das Neuanlegen der Datenbank getrennt.
 *
 * @param {{appId: string, stand?: 'test'|'live'|null, durch?: number|null}} was
 */
async function stelleAppWiederHer({ appId, stand = null }) {
  if (laeuftGerade) {
    throw new ConflictError(`Es läuft gerade: ${laeuftGerade}`);
  }
  const staende = stand ? [stand] : ['test', 'live'];
  const vorhanden = [];
  for (const s of staende) {
    const name = appDatenbank.namenFuer(appId, s);
    const zeiger = path.join(SICHERUNGS_ORDNER, 'postgres', 'apps', `${name}_latest.sql.gz`);
    // `stat` folgt dem Zeiger: ein Zeiger auf eine geloeschte Datei ist keine Sicherung.
    const da = await fs.stat(zeiger).then(
      st => st.isFile(),
      () => false
    );
    if (da) {
      vorhanden.push({ stand: s, datenbank: name });
    }
  }
  if (vorhanden.length === 0) {
    throw new NotFoundError(
      `Für die App ${appId}${stand ? ` (${stand})` : ''} liegt keine Sicherung ihrer Daten vor. ` +
        'Gesichert wird jede Nacht und mit „Jetzt sichern“ unter Einstellungen → System → Sicherung.'
    );
  }

  laeuftGerade = 'wiederherstellung einer app';
  try {
    const ergebnisse = [];
    for (const { stand: s, datenbank } of vorhanden) {
      const { code, ausgabe } = await imContainer(
        ['/usr/local/bin/wiederherstellen.sh', '--app-datenbank', datenbank],
        30 * 60_000
      );
      const eintrag = { stand: s, datenbank, erfolg: code === 0, ausgabe, neu_gestartet: false };
      if (code === 0) {
        eintrag.neu_gestartet = await verbindeWieder(appId, s);
      } else {
        logger.error(`Daten von ${appId}/${s} kamen nicht zurueck`, { code, ausgabe });
      }
      ergebnisse.push(eintrag);
    }
    const gescheitert = ergebnisse.filter(e => !e.erfolg);
    logger.info(
      `Daten von ${appId} zurueck: ${ergebnisse.length - gescheitert.length} von ${ergebnisse.length} Stand/Staenden`
    );
    return { erfolg: gescheitert.length === 0, app: appId, staende: ergebnisse };
  } finally {
    laeuftGerade = null;
  }
}

/**
 * Nach dem Zurueckholen einer App-Datenbank: das richtige Passwort setzen und
 * den Container neu starten -- aber nur, wenn die App in diesem Stand
 * eingespielt ist. Sonst tut es das naechste Einspielen.
 *
 * Wirft nicht: die Daten SIND zurueck, und ein Container, der sich nicht neu
 * starten laesst, ist eine Auskunft in der Antwort und kein Fehlschlag des
 * Weges.
 */
async function verbindeWieder(appId, stand) {
  try {
    const { rows } = await db.query(
      'SELECT 1 FROM public.app_datenbanken WHERE app_id = $1 AND stand = $2',
      [appId, stand]
    );
    if (rows.length === 0) {
      return false;
    }
    await appDatenbank.sorgeFuer({ appId, stand });
    await dockerService.docker.getContainer(appContainer.containerName(appId, stand)).restart();
    return true;
  } catch (fehler) {
    logger.warn(`${appId}/${stand}: nach dem Zurueckholen nicht neu verbunden: ${fehler.message}`);
    return false;
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
    throw new ConflictError(`Es läuft gerade: ${laeuftGerade}`);
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
  stelleAppWiederHer,
  testeWiederherstellung,
  baueAppsNeu,
};
