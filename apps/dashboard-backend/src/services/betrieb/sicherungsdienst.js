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
const SCHLUESSEL_PRUEFUNG = path.join(SICHERUNGS_ORDNER, 'schluessel_pruefung.json');
/**
 * Die Staende der Sicherung (M5, 03.10.2026). Seit M5 schreibt die Nacht
 * keinen Tagesordner mehr, sondern einen Stand, der nur Geaendertes neu
 * schreibt (restic, `services/backup-service/staende.sh`). Dieser Prozess hat
 * weder restic noch den Schluessel; `backup.sh` legt nach jedem Lauf hier ab,
 * welche Staende es gibt.
 */
const STAENDE = path.join(SICHERUNGS_ORDNER, 'staende.json');
/** Die Kennung eines Stands: die ersten acht Zeichen reichen, wie bei restic. */
const STAND_KENNUNG = /^[0-9a-f]{8,64}$/;

/**
 * Der Datentraeger (J37): ein USB-Stick oder eine SSD, vom Host eingehaengt und
 * NUR LESEND hier sichtbar. Die Namen stehen in Umgebungsvariablen, damit der
 * Pruefstand einen eigenen Ort haben kann; die Pfade selbst gehen nie an die
 * Oberflaeche.
 */
const EXTERN_ORDNER = process.env.EXTERN_ORDNER || '/arasul/extern';
const EXTERN_ZUSTAND = process.env.EXTERN_ZUSTAND || '/arasul/extern-zustand/zustand.json';
/** Ein Tagesordner auf dem Datentraeger (vor M5): `arasul-sicherung/<JJJJMMTT>/`. */
const TAGESORDNER = /^\d{8}$/;

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
 * `env` bekommt, was nicht in die Befehlszeile gehoert (der
 * Wiederherstellungscode, J37): Befehlszeilen stehen in der Prozessliste, die
 * Umgebung eines `exec` nicht.
 *
 * @param {string[]} befehl
 * @param {number} zeitlimitMs
 * @param {string[]} [env] Eintraege der Form `NAME=wert`
 */
async function imContainer(befehl, zeitlimitMs, env = []) {
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
    ...(env.length > 0 ? { Env: env } : {}),
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
 * Haengt gerade ein Datentraeger dran? Eingehaengt heisst: der Ordner liegt auf
 * einem ANDEREN Dateisystem als der Sicherungsordner. Ein leerer Ordner, der
 * nur als Mountpunkt im Container existiert, liegt auf demselben und zaehlt
 * nicht.
 */
async function istEingehaengt() {
  try {
    const [extern, lokal] = await Promise.all([fs.stat(EXTERN_ORDNER), fs.stat(SICHERUNGS_ORDNER)]);
    return extern.isDirectory() && extern.dev !== lokal.dev;
  } catch {
    return false;
  }
}

/** Was der Host ueber den Datentraeger hinterlegt hat, oder `null`. */
async function leseZustand() {
  try {
    const zustand = JSON.parse(await fs.readFile(EXTERN_ZUSTAND, 'utf8'));
    return zustand && typeof zustand === 'object' ? zustand : null;
  } catch {
    return null;
  }
}

/**
 * Der Datentraeger, wie ihn die Oberflaeche zeigt: Name, Dateisystem, freier
 * Platz. Ohne eingehaengten Stick ODER ohne Zustandsdatei des Hosts gibt es
 * keinen -- ein Ordner ohne Namen ist fuer einen Menschen kein Datentraeger.
 */
async function datentraeger() {
  const leer = { angesteckt: false, name: null, dateisystem: null, frei: null, gesamt: null };
  if (!(await istEingehaengt())) {
    return leer;
  }
  const zustand = await leseZustand();
  if (!zustand) {
    return leer;
  }
  let frei = null;
  let gesamt = null;
  try {
    const sf = await fs.statfs(EXTERN_ORDNER);
    frei = Number(sf.bavail) * Number(sf.bsize);
    gesamt = Number(sf.blocks) * Number(sf.bsize);
  } catch {
    // Platz unbekannt: kein Grund, den Datentraeger zu verschweigen.
  }
  return {
    angesteckt: true,
    name: zustand.name || zustand.label || 'Datenträger',
    dateisystem: zustand.dateisystem ?? null,
    frei,
    gesamt,
  };
}

/** Das Ergebnis der Schluesselpruefung (schreibt der Sicherungsdienst), oder `null`. */
async function leseSchluesselPruefung() {
  try {
    const roh = JSON.parse(await fs.readFile(SCHLUESSEL_PRUEFUNG, 'utf8'));
    return roh && typeof roh === 'object' ? roh : null;
  } catch {
    return null;
  }
}

/** Ein Teilergebnis (lokal oder extern) der Schluesselpruefung, immer mit denselben Feldern. */
function pruefTeil(teil) {
  return {
    neueste: teil?.neueste ?? null,
    passt: typeof teil?.passt === 'boolean' ? teil.passt : null,
    lesbar: Number.isFinite(teil?.lesbar) ? teil.lesbar : 0,
    unlesbar: Number.isFinite(teil?.unlesbar) ? teil.unlesbar : 0,
  };
}

/**
 * Passt der Schluessel dieses Geraets zu dem, womit gesichert wurde?
 * `passt: null` heisst „nichts zu pruefen“ -- auch, wenn die Datei fehlt.
 */
async function schluessel() {
  const p = await leseSchluesselPruefung();
  return {
    passt: typeof p?.passt === 'boolean' ? p.passt : null,
    geprueft: p?.zeitpunkt ?? null,
    grund: p?.grund || null,
    aelterUnlesbar: Number.isFinite(p?.aeltere_unlesbar) ? p.aeltere_unlesbar : 0,
    lokal: p ? pruefTeil(p.lokal) : null,
    extern: p ? pruefTeil(p.extern) : null,
  };
}

/** Was `backup.sh` ueber die Staende hinterlegt hat, oder `null`. */
async function leseStaende() {
  try {
    const roh = JSON.parse(await fs.readFile(STAENDE, 'utf8'));
    return roh && typeof roh === 'object' && Array.isArray(roh.staende) ? roh : null;
  } catch {
    return null;
  }
}

/** `JJJJMMTT` eines Zeitpunkts, so wie die Tagesordner heissen. */
function tagVon(zeitpunkt) {
  const t = typeof zeitpunkt === 'string' ? zeitpunkt.slice(0, 10).replace(/-/g, '') : '';
  return TAGESORDNER.test(t) ? t : null;
}

/**
 * Das Verzeichnis auf dem Datentraeger.
 *
 * Seit M5 liegt dort EIN Manifest (`arasul-sicherung/MANIFEST.json`) neben dem
 * Repo der Staende; es nennt die Staende und die Apps. Vorher war es eines je
 * Tagesordner -- ein Stick, der nur solche hat, wird weiter gelesen: der
 * neueste Tag mit lesbarem MANIFEST.json. Die Tagesnamen kommen aus `readdir`
 * und muessen `^\d{8}$` sein -- Pfade werden nie aus einer Eingabe gebaut.
 */
async function leseManifeste() {
  const wurzel = path.join(EXTERN_ORDNER, 'arasul-sicherung');
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(wurzel, 'MANIFEST.json'), 'utf8'));
    if (manifest && typeof manifest === 'object' && Array.isArray(manifest.staende)) {
      const tage = [...new Set(manifest.staende.map(s => tagVon(s?.zeit)).filter(Boolean))]
        .sort()
        .reverse();
      const datum = tagVon(manifest.staende.at(-1)?.zeit) ?? tagVon(manifest.zeitpunkt);
      return { tage, neueste: { datum, manifest } };
    }
  } catch {
    // Kein Manifest der Staende: ein Datentraeger von vor M5.
  }
  let namen;
  try {
    namen = (await fs.readdir(wurzel))
      .filter(n => TAGESORDNER.test(n))
      .sort()
      .reverse();
  } catch {
    return { tage: [], neueste: null };
  }
  for (const datum of namen) {
    try {
      const manifest = JSON.parse(
        await fs.readFile(path.join(wurzel, datum, 'MANIFEST.json'), 'utf8')
      );
      if (manifest && typeof manifest === 'object') {
        return { tage: namen, neueste: { datum, manifest } };
      }
    } catch {
      // Dieser Tag ist unvollstaendig -- der naechstaeltere zaehlt.
    }
  }
  return { tage: namen, neueste: null };
}

/** Was liegt auf dem Datentraeger? (`GET /api/backup/extern/inhalt`) */
async function externInhalt() {
  const traeger = await datentraeger();
  if (!traeger.angesteckt) {
    return { angesteckt: false, name: null, neuesteSicherung: null, tage: [] };
  }
  const { tage, neueste } = await leseManifeste();
  return {
    angesteckt: true,
    name: traeger.name,
    neuesteSicherung: neueste
      ? {
          datum: neueste.datum,
          zeitpunkt: neueste.manifest.zeitpunkt ?? null,
          bytes: neueste.manifest.bytes ?? null,
          apps: (Array.isArray(neueste.manifest.apps) ? neueste.manifest.apps : []).map(a => ({
            id: a.id,
            staende: Array.isArray(a.staende) ? a.staende : [],
          })),
          dateien: Array.isArray(neueste.manifest.dateien) ? neueste.manifest.dateien.length : 0,
          // Seit M5: wie viele Staende auf dem Datentraeger liegen.
          ...(Array.isArray(neueste.manifest.staende)
            ? { staende: neueste.manifest.staende.length }
            : {}),
        }
      : null,
    tage,
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

  // Die Staende (M5). Je Stand eine Zeile, und `bytes` ist, was er NEU
  // geschrieben hat -- die Zahl, um die es geht. 0 heisst auch: das hat der
  // Lauf, der ihn anlegte, nicht gemessen.
  const staende = await leseStaende();
  for (const stand of staende?.staende ?? []) {
    if (typeof stand?.id !== 'string' || typeof stand?.zeit !== 'string') {
      continue;
    }
    liste.push({
      art: 'stand',
      zweck: 'Stand des ganzen Geräts: Datenbank, Apps, Flows, Firmenordner, Konfiguration',
      name: stand.kurz || stand.id.slice(0, 8),
      id: stand.id,
      bytes: Number.isFinite(stand.geschrieben) ? stand.geschrieben : 0,
      zeitpunkt: new Date(stand.zeit).toISOString(),
    });
  }

  liste.sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt));
  return liste;
}

/**
 * Die Staende, wie sie der Status nennt (M5): wie viele, wie gross das Repo,
 * der neueste, die Aufbewahrung -- und der Hinweis, wenn das Ziel voll war
 * und der aelteste Stand dafuer gefallen ist. `null`, solange es keinen gibt.
 */
function staendeFuerStatus(staende) {
  if (!staende) {
    return null;
  }
  const liste = staende.staende.filter(s => typeof s?.id === 'string');
  const neuester = liste.at(-1) ?? null;
  return {
    anzahl: liste.length,
    bytes: Number.isFinite(staende.bytes) ? staende.bytes : null,
    neuester: neuester
      ? {
          id: neuester.id,
          zeitpunkt: neuester.zeit ?? null,
          geschrieben: Number.isFinite(neuester.geschrieben) ? neuester.geschrieben : null,
        }
      : null,
    aeltester: liste[0]?.zeit ?? null,
    aufbewahrung: staende.aufbewahrung ?? null,
    hinweis: staende.hinweis || null,
    entfallenWegenPlatz: Array.isArray(staende.entfallen_wegen_platz)
      ? staende.entfallen_wegen_platz
      : [],
  };
}

/**
 * Was zur Kopie ausserhalb noch gehoert (J37): der Datentraeger, ob auf ihm
 * Klartext liegt (soll 0 sein) und was drauf ist.
 */
function ausserhalbDazu(traeger, bericht, extern) {
  return {
    datentraeger: traeger,
    klartextDateien: Number.isFinite(bericht?.extern_klartext) ? bericht.extern_klartext : null,
    inhalt: Array.isArray(extern?.apps) ? { apps: extern.apps } : null,
  };
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
  const [bericht, extern, drill, wieder, traeger, schluesselStand, staende] = await Promise.all([
    leseBericht(BERICHT),
    leseBericht(EXTERN_BERICHT),
    leseBericht(DRILL_BERICHT),
    leseBericht(WIEDERHER_BERICHT),
    datentraeger(),
    schluessel(),
    leseStaende(),
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
          // Was sich im Firmenordner WAEHREND der Sicherung bewegt hat (J35,
          // 27.09.2026). Das ist kein Fehler -- jemand hat eine Datei
          // abgelegt, waehrend die Nacht sicherte --, aber eine Datei, die
          // erst waehrend des Laufs kam, steht vielleicht nicht im Archiv, und
          // das soll man sehen statt vermuten. `null` bei einem Bericht von
          // vor J35.
          firmenordnerGeaendert:
            typeof bericht.firmenordner_geaendert === 'number'
              ? {
                  anzahl: bericht.firmenordner_geaendert,
                  dateien: Array.isArray(bericht.firmenordner_geaendert_dateien)
                    ? bericht.firmenordner_geaendert_dateien
                    : [],
                }
              : null,
          // Der Stand dieser Nacht (M5): was gelesen und was davon NEU
          // geschrieben wurde. `null` bei einem Bericht von vor M5.
          stand: bericht.stand_status
            ? {
                status: bericht.stand_status,
                id: bericht.stand_id || null,
                geschrieben: bericht.stand_geschrieben_bytes ?? null,
                gelesen: bericht.stand_gelesen_bytes ?? null,
                klartext: bericht.stand_klartext ?? null,
              }
            : null,
        }
      : { status: 'fehlt', zeitpunkt: null, alterStunden: null, veraltet: true },
    staende: staendeFuerStatus(staende),
    // Leer, wenn noch nie eine Kopie ausserhalb entstanden ist.
    ausserhalb: extern
      ? {
          ...ausserhalbDazu(traeger, bericht, extern),
          vorhanden: true,
          zeitpunkt: extern.zeitpunkt ?? null,
          bytes: extern.bytes ?? null,
          dateien: extern.dateien ?? null,
          ziel: extern.ziel ?? null,
          geschrieben: extern.geschrieben ?? null,
          letzterVersuch: bericht?.extern_status ?? null,
        }
      : {
          ...ausserhalbDazu(traeger, bericht, extern),
          vorhanden: false,
          zeitpunkt: null,
          bytes: null,
          dateien: null,
          ziel: null,
          letzterVersuch: bericht?.extern_status ?? null,
        },
    schluessel: schluesselStand,
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

const KEIN_DATENTRAEGER = 'Es ist kein Datenträger angesteckt.';

/**
 * Wofuer ein Stand vor einem Zurueckholen entstand (Tag `fuer:` in restic):
 * `app:<id>`, `bereich:<kennung>` oder `geraet` -- seit dem Auftrag
 * live-schalten-mit-sicherung (M5) auch `live:<id>`, vor dem Live-Schalten
 * einer App. Sonst `null`.
 */
function fuerAus(fuer) {
  if (fuer === 'geraet') {
    return { art: 'geraet', id: null };
  }
  const treffer =
    typeof fuer === 'string' ? /^(app|bereich|live):([a-z0-9][a-z0-9-]{0,63})$/.exec(fuer) : null;
  return treffer ? { art: treffer[1], id: treffer[2] } : null;
}

const nurText = liste => (Array.isArray(liste) ? liste.filter(x => typeof x === 'string') : []);

/**
 * Die Staende einer Quelle, wie `backup.sh` sie hinterlegt: auf diesem Geraet
 * `staende.json`, auf dem Datentraeger `arasul-sicherung/MANIFEST.json`.
 * Aelteste zuerst, nur Eintraege mit Kennung und Zeit.
 */
async function rohStaende(quelle) {
  let liste;
  if (quelle === 'extern') {
    const { neueste } = await leseManifeste();
    liste = neueste?.manifest?.staende;
  } else {
    liste = (await leseStaende())?.staende;
  }
  return (Array.isArray(liste) ? liste : []).filter(
    s => typeof s?.id === 'string' && STAND_KENNUNG.test(s.id) && typeof s?.zeit === 'string'
  );
}

/** Ein Stand der Quelle zu einer Kennung (die ersten acht Zeichen reichen, eindeutig). */
async function findeStand(quelle, kennung) {
  const treffer = (await rohStaende(quelle)).filter(s => s.id.startsWith(kennung));
  if (treffer.length !== 1) {
    throw new NotFoundError(
      'Diesen Stand gibt es nicht mehr. Wählen Sie in der Liste einen anderen Zeitpunkt.'
    );
  }
  return treffer[0];
}

/**
 * Die Staende zum Zurueckholen (Auftrag sicherung-zurueckholen, M5):
 * neueste zuerst, je Stand der Zeitpunkt, ob er vor einem Zurueckholen
 * entstand und wofuer, und was darin steht -- Apps mit ihrem Namen, Bereiche
 * des Firmenordners mit ihrem Namen und ob es sie am Geraet noch gibt. Die
 * Kennung steht dabei, aber die Oberflaeche zeigt sie nur aufgeklappt: ein
 * Mensch waehlt nach Datum und Uhrzeit.
 */
async function staendeZumZurueckholen(quelle = 'lokal') {
  await pruefeQuelle(quelle);
  const roh = await rohStaende(quelle);
  const [appZeilen, bereichZeilen] = await Promise.all([
    db.query('SELECT id, name FROM public.apps').then(
      r => r.rows,
      () => []
    ),
    // Ein Bereich ist ein Raum: Ebene 1, oder die Wurzel (Ebene 0).
    db.query('SELECT kennung, name FROM public.firmenordner_ordner WHERE ebene IN (0, 1)').then(
      r => r.rows,
      () => []
    ),
  ]);
  const appNamen = new Map(appZeilen.map(z => [z.id, z.name]));
  const bereichNamen = new Map(bereichZeilen.map(z => [z.kennung, z.name]));
  return roh
    .map(s => {
      const inhalt = s.inhalt && typeof s.inhalt === 'object' ? s.inhalt : null;
      return {
        id: s.id,
        zeitpunkt: new Date(s.zeit).toISOString(),
        vorher: s.vorher === true,
        fuer: fuerAus(s.fuer),
        geschrieben: Number.isFinite(s.geschrieben) ? s.geschrieben : null,
        inhaltBekannt: inhalt !== null,
        apps: nurText(inhalt?.apps).map(id => ({ id, name: appNamen.get(id) ?? null })),
        appDatenbanken: nurText(inhalt?.app_datenbanken),
        bereiche: nurText(inhalt?.bereiche).map(kennung => ({
          kennung,
          name: bereichNamen.get(kennung) ?? null,
          vorhanden: bereichNamen.has(kennung),
        })),
      };
    })
    .sort((a, b) => b.zeitpunkt.localeCompare(a.zeitpunkt));
}

/**
 * DER STAND VOR DEM ZURUECKHOLEN (Auftrag sicherung-zurueckholen, M5).
 *
 * Bevor irgendetwas ersetzt wird, laeuft eine ganz normale Sicherung -- nur
 * mit `ARASUL_STAND_ANLASS=vorher`, damit der Stand den Tag `vorher` traegt
 * und die Aufbewahrung ihn nicht nimmt (staende.sh). Er ist der Weg zurueck
 * vom Zurueckholen: wer den falschen Zeitpunkt erwischt hat, waehlt diesen
 * Stand und holt dasselbe noch einmal -- derselbe Weg, kein zweiter.
 *
 * Er bleibt auf diesem Geraet (backup.sh kopiert ihn nicht auf den
 * Datentraeger) und dauert, was eine Sicherung dauert: am Orin um eine Minute,
 * weil nur Geaendertes geschrieben wird.
 *
 * GELINGT ER NICHT, WIRD NICHTS ZURUECKGEHOLT. Gezaehlt wird der Stand, nicht
 * die Rueckgabe des Skripts: ein Datentraeger, der klemmt, ist kein Grund, und
 * ein Stand, der fehlt, ist einer.
 *
 * @param {string} fuer `app:<id>`, `bereich:<kennung>` oder `geraet`
 */
async function sichereVorher(fuer) {
  const beginn = Date.now();
  const { code, ausgabe } = await imContainer(['/usr/local/bin/backup.sh'], 30 * 60_000, [
    'ARASUL_STAND_ANLASS=vorher',
    `ARASUL_STAND_FUER=${fuer}`,
  ]);
  const bericht = await leseBericht(BERICHT);
  const frisch = bericht && Date.parse(bericht._geschrieben) >= beginn - 2000;
  const id = frisch && bericht.stand_status === 'ok' ? bericht.stand_id || null : null;
  if (!id) {
    logger.error('Der Stand vor dem Zurueckholen liess sich nicht anlegen', { code, ausgabe });
    return { erfolg: false, id: null, zeitpunkt: null, ausgabe };
  }
  logger.info(`Stand vor dem Zurueckholen: ${id.slice(0, 8)} (${fuer})`);
  return { erfolg: true, id, zeitpunkt: bericht.timestamp ?? null, ausgabe };
}

/** Der Satz im Bericht zum Stand davor -- gelungen oder nicht. */
function vorherSatz(vorher) {
  return {
    schritt: 'vorher',
    erfolg: vorher.erfolg,
    text: vorher.erfolg
      ? 'Der jetzige Stand ist vorher gesichert. Mit ihm lässt sich dieses Zurückholen rückgängig machen.'
      : 'Der jetzige Stand ließ sich nicht sichern. Deshalb wurde nichts zurückgeholt.',
  };
}

/**
 * Welcher Stand zurueckkommt, wenn keiner genannt ist: der neueste -- aber
 * festgehalten, BEVOR der Stand davor entsteht. Sonst waere der neueste
 * danach genau der, der gerade gesichert wurde, und das Zurueckholen holte
 * nichts zurueck. `null`, wenn die Quelle keinen Stand hat.
 */
async function neuesterStand(quelle) {
  return (await rohStaende(quelle)).at(-1) ?? null;
}

/** `extern` geht nur mit eingehaengtem Datentraeger. */
async function pruefeQuelle(quelle) {
  if (quelle === 'extern' && !(await istEingehaengt())) {
    throw new ConflictError(KEIN_DATENTRAEGER);
  }
}

/** Der Code geht in die Umgebung, nie in die Befehlszeile; hier die letzte Sperre. */
function pruefeCode(code) {
  if (code && !/^[A-Za-z0-9 -]{1,100}$/.test(code)) {
    throw new ValidationError(
      'Der Wiederherstellungscode besteht nur aus Buchstaben, Ziffern und Strichen.'
    );
  }
}

function codeEnv(code) {
  return code ? [`ARASUL_WIEDERHERSTELLUNGSCODE=${code}`] : [];
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
async function stelleWiederHer({
  datei = null,
  stand = null,
  durch = null,
  quelle = 'lokal',
  wiederherstellungscode = null,
  vorherSichern = false,
} = {}) {
  if (laeuftGerade) {
    throw new ConflictError(`Es läuft gerade: ${laeuftGerade}`);
  }
  await pruefeQuelle(quelle);
  pruefeCode(wiederherstellungscode);
  // Ein Dateiname, kein Pfad. Das Skript prueft es noch einmal, aber ein
  // Aufruf, der `../` durchreicht, hat hier schon nichts verloren.
  if (datei && !/^[A-Za-z0-9._-]+$/.test(datei)) {
    throw new ValidationError(
      'Der Name der Sicherung darf nur Buchstaben, Ziffern, Punkt, Strich und Unterstrich enthalten.'
    );
  }
  if (stand && !STAND_KENNUNG.test(stand)) {
    throw new ValidationError(
      'Ein Stand wird mit seiner Kennung genannt (8 bis 64 Zeichen aus 0-9 und a-f).'
    );
  }
  if (stand && datei) {
    throw new ValidationError('Entweder ein Stand oder eine Datei, nicht beides.');
  }

  laeuftGerade = 'wiederherstellung';
  try {
    // Mit dem Stand davor (aus der Oberflaeche immer): erst festhalten, was
    // zurueckkommt, dann sichern, dann zurueckholen. Ohne Staende auf diesem
    // Geraet (von vor M5) gilt ausdruecklich die neueste Datei der
    // Tagesordner -- sonst naehme das Skript den eben gesicherten Stand.
    let vorher = null;
    if (vorherSichern) {
      if (!stand && !datei) {
        const neuester = await neuesterStand(quelle);
        if (neuester) {
          stand = neuester.id;
        } else if (quelle === 'lokal') {
          datei = 'arasul_db_latest.sql.gz';
        }
      }
      vorher = await sichereVorher('geraet');
      if (!vorher.erfolg) {
        return {
          erfolg: false,
          code: null,
          ausgabe: vorher.ausgabe,
          bericht: { status: 'fehler', grund: vorherSatz(vorher).text },
          apps: [],
          vorher,
        };
      }
    }
    const befehl = ['/usr/local/bin/wiederherstellen.sh'];
    if (datei) {
      befehl.push('--datei', datei);
    }
    if (stand) {
      befehl.push('--stand', stand);
    }
    if (quelle === 'extern') {
      befehl.push('--quelle', 'extern');
    }
    const { code, ausgabe } = await imContainer(
      befehl,
      60 * 60_000,
      codeEnv(wiederherstellungscode)
    );
    const bericht = await leseBericht(WIEDERHER_BERICHT);

    if (code !== 0) {
      logger.error('Wiederherstellung fehlgeschlagen', { code, ausgabe });
      return { erfolg: false, code, ausgabe, bericht, apps: [], vorher };
    }

    const apps = await baueAppsNeu(durch);
    const gescheitert = apps.filter(a => !a.erfolg);
    logger.info(
      `Wiederherstellung fertig: ${apps.length - gescheitert.length} von ${apps.length} App-Staenden laufen`
    );
    return { erfolg: gescheitert.length === 0, code, ausgabe, bericht, apps, vorher };
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
 * WELCHER STAND (Auftrag sicherung-zurueckholen, M5): `standId` nennt einen
 * Stand der Quelle; was er enthaelt, steht in `staende.json` bzw. im Manifest
 * (`inhalt`), und nur das wird geholt -- eine App, die in diesem Stand nur
 * ihr Paket hat, bekommt nur ihr Paket. Ohne `standId` gilt der neueste.
 *
 * DER STAND DAVOR: mit `vorherSichern` (aus der Oberflaeche immer) entsteht
 * vor dem ersten Handgriff ein Stand des ganzen Geraets (`sichereVorher`).
 * Misslingt er, wird nichts angefasst.
 *
 * @param {{appId: string, stand?: 'test'|'live'|null, standId?: string|null,
 *   durch?: number|null, vorherSichern?: boolean}} was
 */
async function stelleAppWiederHer({
  appId,
  stand = null,
  standId = null,
  quelle = 'lokal',
  paket = false,
  wiederherstellungscode = null,
  durch = null,
  vorherSichern = false,
}) {
  if (laeuftGerade) {
    throw new ConflictError(`Es läuft gerade: ${laeuftGerade}`);
  }
  await pruefeQuelle(quelle);
  pruefeCode(wiederherstellungscode);
  if (standId && !STAND_KENNUNG.test(standId)) {
    throw new ValidationError(
      'Ein Stand wird mit seiner Kennung genannt (8 bis 64 Zeichen aus 0-9 und a-f).'
    );
  }

  // Der Stand: der genannte, oder (mit dem Stand davor) der neueste, BEVOR
  // der Stand davor entsteht.
  let gewaehlt = null;
  if (standId) {
    gewaehlt = await findeStand(quelle, standId);
  } else if (vorherSichern) {
    gewaehlt = await neuesterStand(quelle);
    if (!gewaehlt && quelle === 'lokal') {
      throw new ConflictError(
        'Auf diesem Gerät gibt es noch keinen Stand. Sichern Sie zuerst mit „Jetzt sichern“.'
      );
    }
  }
  const inhalt = gewaehlt?.inhalt && typeof gewaehlt.inhalt === 'object' ? gewaehlt.inhalt : null;

  const staende = stand ? [stand] : ['test', 'live'];
  // Auf dem Datentraeger gilt das Verzeichnis des neuesten Tages, nicht die
  // Platte: eine App, die dort nicht verzeichnet ist, laesst sich von dort nicht holen.
  let imManifest = null;
  if (!inhalt && quelle === 'extern') {
    const { neueste } = await leseManifeste();
    const eintrag = (neueste?.manifest?.apps ?? []).find(a => a.id === appId);
    imManifest = new Set(Array.isArray(eintrag?.staende) ? eintrag.staende : []);
  }
  // Auf diesem Geraet (M5): der Stand nennt seine App-Datenbanken; ohne
  // gewaehlten Stand der neueste. Vor dem ersten Stand gilt der Zeiger der
  // Tagesordner.
  const imStand = inhalt
    ? nurText(inhalt.app_datenbanken)
    : quelle === 'extern'
      ? null
      : ((await leseStaende())?.neuester?.app_datenbanken ?? null);
  const vorhanden = [];
  for (const s of staende) {
    const name = appDatenbank.namenFuer(appId, s);
    let da;
    if (Array.isArray(imStand)) {
      da = imStand.includes(name);
    } else if (quelle === 'extern') {
      da = imManifest.has(s);
    } else {
      const zeiger = path.join(SICHERUNGS_ORDNER, 'postgres', 'apps', `${name}_latest.sql.gz`);
      // `stat` folgt dem Zeiger: ein Zeiger auf eine geloeschte Datei ist keine Sicherung.
      da = await fs.stat(zeiger).then(
        st => st.isFile(),
        () => false
      );
    }
    if (da) {
      vorhanden.push({ stand: s, datenbank: name });
    }
  }
  // Das Paket: steht im Inhalt des Stands, ob es darin ist. Ohne Inhalt wird
  // es versucht, wenn es Daten gab (wie bis M5).
  const paketImStand = inhalt ? nurText(inhalt.apps).includes(appId) : vorhanden.length > 0;
  if (vorhanden.length === 0 && !(paket && paketImStand && inhalt)) {
    throw new NotFoundError(
      `Für die App ${appId}${stand ? ` (${stand})` : ''} liegt ${
        quelle === 'extern' ? 'auf dem Datenträger' : 'auf diesem Gerät'
      } ${gewaehlt && standId ? 'in diesem Stand ' : ''}keine Sicherung vor. ` +
        'Gesichert wird jede Nacht und mit „Jetzt sichern“ unter Verwaltung → System → Sicherung.'
    );
  }

  const quellArg = quelle === 'extern' ? ['--quelle', 'extern'] : [];
  const standArg = gewaehlt ? ['--stand', gewaehlt.id] : [];
  const env = codeEnv(wiederherstellungscode);
  const bericht = [];

  laeuftGerade = 'wiederherstellung einer app';
  try {
    let vorher = null;
    if (vorherSichern) {
      vorher = await sichereVorher(`app:${appId}`);
      bericht.push(vorherSatz(vorher));
      if (!vorher.erfolg) {
        return {
          erfolg: false,
          app: appId,
          quelle,
          stand: gewaehlt ? { id: gewaehlt.id, zeitpunkt: gewaehlt.zeit } : null,
          vorher,
          staende: [],
          paket: null,
          bericht,
        };
      }
    }

    const ergebnisse = [];
    for (const { stand: s, datenbank } of vorhanden) {
      const { code, ausgabe } = await imContainer(
        [
          '/usr/local/bin/wiederherstellen.sh',
          '--app-datenbank',
          datenbank,
          ...standArg,
          ...quellArg,
        ],
        30 * 60_000,
        env
      );
      ergebnisse.push({ stand: s, datenbank, erfolg: code === 0, ausgabe, neu_gestartet: false });
      bericht.push({
        schritt: 'datenbank',
        stand: s,
        erfolg: code === 0,
        text:
          code === 0
            ? `Die Daten der App (${standName(s)}) sind zurückgeholt.`
            : `Die Daten der App (${standName(s)}) ließen sich nicht zurückholen.`,
      });
      if (code !== 0) {
        logger.error(`Daten von ${appId}/${s} kamen nicht zurueck`, { code, ausgabe });
      }
    }

    // Das Paket EINMAL, nicht je Stand: es ist ein Archiv fuer die ganze App.
    let paketErgebnis = null;
    if (paket && paketImStand && (ergebnisse.length === 0 || ergebnisse.some(e => e.erfolg))) {
      const { code, ausgabe } = await imContainer(
        ['/usr/local/bin/wiederherstellen.sh', '--app-paket', appId, ...standArg, ...quellArg],
        30 * 60_000,
        env
      );
      paketErgebnis = { erfolg: code === 0, ausgabe };
      bericht.push({
        schritt: 'paket',
        erfolg: code === 0,
        text:
          code === 0
            ? 'Das Paket der App (Oberfläche und Programm) ist zurückgeholt.'
            : 'Das Paket der App ließ sich nicht zurückholen.',
      });
      if (code !== 0) {
        logger.error(`Paket von ${appId} kam nicht zurueck`, { code, ausgabe });
      }
    }

    // Danach laufen lassen. Mit zurueckgeholtem Paket wird jeder Stand, den es
    // gibt, aus dem Paket neu gebaut; sonst bleibt es beim neuen Verbinden.
    // Kam nur das Paket (keine Daten im Stand), dann jeder eingespielte Stand.
    const zuStarten =
      ergebnisse.length > 0
        ? ergebnisse.filter(x => x.erfolg)
        : paketErgebnis?.erfolg
          ? staende.map(s => ({ stand: s, nurPaket: true }))
          : [];
    for (const e of zuStarten) {
      if (paketErgebnis?.erfolg) {
        const gestartet = await spieleStandEin({ appId, stand: e.stand, durch });
        e.neu_gestartet = gestartet.erfolg;
        if (gestartet.uebersprungen) {
          if (!e.nurPaket) {
            bericht.push({
              schritt: 'neu_gestartet',
              stand: e.stand,
              erfolg: true,
              text: `Die App war nicht eingespielt (${standName(e.stand)}); ihre Daten liegen bereit.`,
            });
          }
        } else {
          e.neuStartFehler = !gestartet.erfolg;
          bericht.push({
            schritt: 'neu_gestartet',
            stand: e.stand,
            erfolg: gestartet.erfolg,
            text: gestartet.erfolg
              ? `Die App läuft wieder (${standName(e.stand)}), aus dem zurückgeholten Paket.`
              : `Die App ließ sich nicht neu starten (${standName(e.stand)}).`,
          });
        }
      } else {
        e.neu_gestartet = await verbindeWieder(appId, e.stand);
        if (e.neu_gestartet) {
          bericht.push({
            schritt: 'neu_gestartet',
            stand: e.stand,
            erfolg: true,
            text: `Die App ist neu verbunden und läuft mit den zurückgeholten Daten (${standName(e.stand)}).`,
          });
        }
      }
    }

    const gescheitert =
      ergebnisse.some(e => !e.erfolg || e.neuStartFehler) ||
      zuStarten.some(e => e.neuStartFehler) ||
      (paketErgebnis && !paketErgebnis.erfolg);
    for (const e of ergebnisse) {
      delete e.neuStartFehler;
    }
    logger.info(
      `Daten von ${appId} zurueck: ${ergebnisse.filter(e => e.erfolg).length} von ${ergebnisse.length} Stand/Staenden`
    );
    return {
      erfolg: !gescheitert,
      app: appId,
      quelle,
      stand: gewaehlt ? { id: gewaehlt.id, zeitpunkt: gewaehlt.zeit } : null,
      vorher,
      staende: ergebnisse,
      paket: paketErgebnis,
      bericht,
    };
  } finally {
    laeuftGerade = null;
  }
}

/**
 * EINEN BEREICH DES FIRMENORDNERS zurueckholen (Auftrag
 * sicherung-zurueckholen, M5): seine Dateien auf den Stand des gewaehlten
 * Zeitpunkts, sonst nichts. Kein anderer Bereich, keine Rechte, nicht der
 * ganze Firmenordner.
 *
 * Der Bereich muss am Geraet bestehen (eine Zeile in `firmenordner_ordner`
 * auf Ebene 0 oder 1, und damit ein Raum im Dienst): Dateien in einem Ordner,
 * den der Dienst nicht kennt, saehe niemand. Der Dienst laeuft dabei weiter
 * und nimmt die Dateien auf, wie jede, die am Geraet abgelegt wird
 * (`wiederherstellen.sh --firmenordner-bereich`, dort die Begruendung).
 *
 * @param {{kennung: string, standId?: string|null, quelle?: 'lokal'|'extern',
 *   wiederherstellungscode?: string|null, vorherSichern?: boolean}} was
 */
async function stelleBereichWiederHer({
  kennung,
  standId = null,
  quelle = 'lokal',
  wiederherstellungscode = null,
  vorherSichern = false,
}) {
  if (laeuftGerade) {
    throw new ConflictError(`Es läuft gerade: ${laeuftGerade}`);
  }
  await pruefeQuelle(quelle);
  pruefeCode(wiederherstellungscode);
  if (!/^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(kennung || '')) {
    throw new ValidationError('Ein Bereich wird mit seiner Kennung genannt (a-z, 0-9, Strich).');
  }
  if (standId && !STAND_KENNUNG.test(standId)) {
    throw new ValidationError(
      'Ein Stand wird mit seiner Kennung genannt (8 bis 64 Zeichen aus 0-9 und a-f).'
    );
  }
  const { rows } = await db.query(
    'SELECT kennung, name FROM public.firmenordner_ordner WHERE kennung = $1 AND ebene IN (0, 1)',
    [kennung]
  );
  if (rows.length === 0) {
    throw new NotFoundError(
      `Den Bereich „${kennung}“ gibt es an diesem Gerät nicht. ` +
        'Legen Sie ihn unter Firmenordner an und holen Sie ihn dann zurück.'
    );
  }
  const gewaehlt = standId ? await findeStand(quelle, standId) : await neuesterStand(quelle);
  if (!gewaehlt) {
    throw new NotFoundError(
      'Es gibt noch keinen Stand, aus dem sich ein Bereich zurückholen ließe. ' +
        'Sichern Sie zuerst mit „Jetzt sichern“.'
    );
  }
  const inhalt = gewaehlt.inhalt && typeof gewaehlt.inhalt === 'object' ? gewaehlt.inhalt : null;
  if (inhalt && !nurText(inhalt.bereiche).includes(kennung)) {
    throw new NotFoundError(
      `Der Bereich „${rows[0].name}“ steht nicht in diesem Stand. Wählen Sie einen anderen Zeitpunkt.`
    );
  }

  const quellArg = quelle === 'extern' ? ['--quelle', 'extern'] : [];
  const bericht = [];
  laeuftGerade = 'wiederherstellung eines bereichs';
  try {
    let vorher = null;
    if (vorherSichern) {
      vorher = await sichereVorher(`bereich:${kennung}`);
      bericht.push(vorherSatz(vorher));
      if (!vorher.erfolg) {
        return {
          erfolg: false,
          bereich: { kennung, name: rows[0].name },
          stand: { id: gewaehlt.id, zeitpunkt: gewaehlt.zeit },
          vorher,
          zahlen: null,
          bericht,
        };
      }
    }
    const { code, ausgabe } = await imContainer(
      [
        '/usr/local/bin/wiederherstellen.sh',
        '--firmenordner-bereich',
        kennung,
        '--stand',
        gewaehlt.id,
        ...quellArg,
      ],
      60 * 60_000,
      codeEnv(wiederherstellungscode)
    );
    const zeile = /^ERGEBNIS bereich=\S+ geschrieben=(\d+) entfernt=(\d+) ordner_neu=(\d+)/m.exec(
      ausgabe
    );
    const zahlen = zeile
      ? { geschrieben: Number(zeile[1]), entfernt: Number(zeile[2]), ordnerNeu: Number(zeile[3]) }
      : null;
    if (code !== 0) {
      logger.error(`Bereich ${kennung} kam nicht zurueck`, { code, ausgabe });
    }
    bericht.push({
      schritt: 'bereich',
      erfolg: code === 0,
      text:
        code === 0
          ? `Die Dateien des Bereichs „${rows[0].name}“ sind zurückgeholt${
              zahlen
                ? `: ${zahlen.geschrieben} ${zahlen.geschrieben === 1 ? 'Datei' : 'Dateien'} zurückgeschrieben, ${zahlen.entfernt} entfernt, die seitdem dazukamen.`
                : '.'
            }`
          : `Die Dateien des Bereichs „${rows[0].name}“ ließen sich nicht vollständig zurückholen.`,
    });
    logger.info(`Bereich ${kennung} zurueck aus ${gewaehlt.id.slice(0, 8)} (Rueckgabe ${code})`);
    return {
      erfolg: code === 0,
      bereich: { kennung, name: rows[0].name },
      stand: { id: gewaehlt.id, zeitpunkt: gewaehlt.zeit },
      vorher,
      zahlen,
      bericht,
      ...(code === 0 ? {} : { ausgabe }),
    };
  } finally {
    laeuftGerade = null;
  }
}

function standName(stand) {
  return stand === 'live' ? 'Live' : 'Test';
}

/**
 * DER STAND VOR DEM LIVE-SCHALTEN (M5, Auftrag live-schalten-mit-sicherung).
 *
 * Derselbe Stand wie vor einem Zurueckholen (`sichereVorher`), nur mit
 * `fuer:live:<id>`: er haelt die Live-Datenbank der App fest, bevor eine neue
 * Fassung ihre Strukturaenderung darauf laufen laesst. Scheitert die, holt
 * `holeLiveDatenZurueck` genau diese Datenbank aus genau diesem Stand.
 *
 * Wirft `ConflictError`, wenn gerade eine andere Sicherung oder ein
 * Zurueckholen laeuft -- dann wird nicht geschaltet.
 */
async function sichereVorLive(appId) {
  if (laeuftGerade) {
    throw new ConflictError(`Es läuft gerade: ${laeuftGerade}. Danach noch einmal live schalten.`);
  }
  laeuftGerade = 'sicherung vor dem live schalten';
  try {
    return await sichereVorher(`live:${appId}`);
  } finally {
    laeuftGerade = null;
  }
}

/**
 * Die Live-Datenbank einer App aus dem Stand vor dem Live-Schalten
 * zurueckholen: dieselbe Datenbank wird verworfen und aus dem Stand neu
 * eingespielt (`wiederherstellen.sh --app-datenbank`), mit allem, was die
 * gescheiterte Strukturaenderung halb angelegt hatte. Den Container startet
 * der Aufrufer (er spielt die Fassung von vorher ein). Wirft nicht.
 *
 * @returns {Promise<{erfolg: boolean, ausgabe: string}>}
 */
async function holeLiveDatenZurueck(appId, standId) {
  if (!STAND_KENNUNG.test(standId || '')) {
    return { erfolg: false, ausgabe: 'Keine gültige Kennung des Stands.' };
  }
  laeuftGerade = 'live-daten zurückholen';
  try {
    const { code, ausgabe } = await imContainer(
      [
        '/usr/local/bin/wiederherstellen.sh',
        '--app-datenbank',
        appDatenbank.namenFuer(appId, 'live'),
        '--stand',
        standId,
      ],
      30 * 60_000
    );
    if (code !== 0) {
      logger.error(`Live-Daten von ${appId} kamen nicht zurueck`, { code, ausgabe });
    }
    return { erfolg: code === 0, ausgabe };
  } catch (fehler) {
    logger.error(`Live-Daten von ${appId} kamen nicht zurueck: ${fehler.message}`);
    return { erfolg: false, ausgabe: fehler.message };
  } finally {
    laeuftGerade = null;
  }
}

/**
 * Einen Stand der App aus ihrem zurueckgeholten Paket neu bauen -- aber nur,
 * wenn es ihn in `app_staende` gibt (sonst weiss niemand, welche Version).
 * Wirft nicht.
 */
async function spieleStandEin({ appId, stand, durch }) {
  try {
    const { rows } = await db.query(
      'SELECT version FROM public.app_staende WHERE app_id = $1 AND stand = $2',
      [appId, stand]
    );
    if (rows.length === 0) {
      return { erfolg: true, uebersprungen: true };
    }
    await appStore.spieleEin({ appId, version: rows[0].version, stand, durch });
    return { erfolg: true, uebersprungen: false };
  } catch (fehler) {
    logger.error(`${appId}/${stand} kam aus dem Paket nicht wieder hoch`, {
      error: fehler.message,
    });
    return { erfolg: false, uebersprungen: false };
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
  leseStaende,
  status,
  sicherungen,
  sichereJetzt,
  stelleWiederHer,
  stelleAppWiederHer,
  stelleBereichWiederHer,
  staendeZumZurueckholen,
  sichereVorher,
  sichereVorLive,
  holeLiveDatenZurueck,
  externInhalt,
  schluessel,
  leseSchluesselPruefung,
  testeWiederherstellung,
  baueAppsNeu,
};
