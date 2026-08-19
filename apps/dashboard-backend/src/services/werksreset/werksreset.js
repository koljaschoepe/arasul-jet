/**
 * Werksreset, Plan 023 B5.
 *
 * Ein Gerät, das ausgeliefert und zurückgenommen wird, braucht einen Weg zurück
 * in den Zustand, in dem es das Haus verlassen hat. Bis heute gab es den nicht.
 *
 * Zwei Stufen:
 *
 *   `inhalte`      Alles, was der Nutzer erzeugt hat, ist weg. Die Einrichtung
 *                  bleibt: Zugang, Erweiterungen, Flows, Einstellungen, Modelle.
 *   `auslieferung` Zusätzlich die ganze Einrichtung. Danach läuft beim nächsten
 *                  Aufruf wieder die Ersteinrichtung, so wie bei einem neuen Gerät.
 *
 * Drei Eigenschaften, auf die es ankommt:
 *
 * 1. Der Reset weiß, was er nicht kennt. `unbekannteTabellen()` vergleicht die
 *    Klassifikation in `tabellen.js` mit der Datenbank. Bleibt etwas übrig,
 *    verweigert er den Dienst. Ein unvollständiger Werksreset ist schlimmer als
 *    keiner, weil er Vollständigkeit behauptet.
 * 2. Er räumt in einer Transaktion. Entweder alle Tabellen oder keine.
 * 3. Die Reihenfolge ergibt sich, sie steht nicht im Code. Fremdschlüssel legen
 *    sie fest, und die kennt die Datenbank besser als eine gepflegte Liste.
 *    Deshalb: löschen, was geht, den Rest in der nächsten Runde. Wer in einer
 *    ganzen Runde nichts löschen kann, hat einen echten Fehler, keine
 *    Reihenfolgefrage.
 */

const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const db = require('../../database');
const logger = require('../../utils/logger');
const { escapeIdentifier } = require('../../utils/sqlIdentifier');
const { ValidationError, ConflictError } = require('../../utils/errors');
const { INHALTE, AUSLIEFERUNG, MODELLE, alleBekanntenTabellen } = require('./tabellen');
const systemSettingsService = require('../system-settings/systemSettingsService');
const { cacheService } = require('../core/cacheService');

const STUFEN = ['inhalte', 'auslieferung'];

/** Ordner, deren INHALT geleert wird. Der Ordner selbst bleibt, er ist ein Mountpunkt. */
const ORDNER = {
  inhalte: [
    [process.env.PROJECTS_DIR || '/arasul/projects', 'Projektablage'],
    [process.env.SANDBOX_PROJECTS_DIR || '/arasul/sandbox/projects', 'Sandbox-Arbeitsordner'],
  ],
  auslieferung: [
    [process.env.FLOWS_DIR || '/arasul/flows', 'Flow-Definitionen'],
    [process.env.EXTENSIONS_DIR || '/arasul/extensions', 'Erweiterungs-Pakete'],
    [process.env.EXTENSIONS_DATA_DIR || '/arasul/extensions-data', 'Daten der Erweiterungen'],
  ],
};

/** Tabellennamen `schema.tabelle` sicher in einen SQL-Bezeichner übersetzen. */
function alsBezeichner(name) {
  const teile = String(name).split('.');
  if (teile.length !== 2) {
    throw new ValidationError(`Tabellenname ohne Schema: ${name}`);
  }
  return `${escapeIdentifier(teile[0])}.${escapeIdentifier(teile[1])}`;
}

/** Die Tabellenliste für eine Stufe, aufsteigend sortiert. */
function tabellenFuer(stufe, modelleLoeschen = false) {
  if (!STUFEN.includes(stufe)) {
    throw new ValidationError(`Unbekannte Stufe: ${stufe}`);
  }
  const liste = [...INHALTE];
  if (stufe === 'auslieferung') {
    liste.push(...AUSLIEFERUNG);
  }
  if (modelleLoeschen) {
    liste.push(...MODELLE);
  }
  return liste
    .map(([name, zweck]) => ({ name, zweck }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Tabellen in der Datenbank, die in keinem der vier Töpfe stehen.
 * @returns {Promise<string[]>}
 */
async function unbekannteTabellen() {
  const { rows } = await db.query(
    `SELECT table_schema || '.' || table_name AS name
       FROM information_schema.tables
      WHERE table_schema IN ('public', 'arasul')
        AND table_type = 'BASE TABLE'`
  );
  const bekannt = alleBekanntenTabellen();
  return rows
    .map(r => r.name)
    .filter(name => !bekannt.has(name))
    .sort();
}

/** Der Name, den der Nutzer zur Bestätigung tippen muss. */
async function geraetename() {
  try {
    const { rows } = await db.query('SELECT hostname FROM system_settings WHERE id = 1');
    const aus_db = rows[0]?.hostname;
    if (aus_db && String(aus_db).trim()) {
      return String(aus_db).trim();
    }
  } catch (err) {
    logger.warn(`[werksreset] Gerätename nicht aus der Datenbank lesbar: ${err.message}`);
  }
  return process.env.MDNS_NAME || os.hostname() || 'arasul';
}

/**
 * Was ein Werksreset dieser Stufe kosten würde, ohne etwas anzufassen.
 */
async function vorschau({ stufe, modelleLoeschen = false } = {}) {
  const tabellen = tabellenFuer(stufe, modelleLoeschen);
  const unbekannt = await unbekannteTabellen();

  // Achtzig Zaehlabfragen nacheinander machen die Vorschau spuerbar traege,
  // achtzig gleichzeitig reissen den Verbindungspool leer (database.js klinkt
  // bei mehr als zehn Wartenden aus, siehe gdprExport). Deshalb in Gruppen.
  const mitZahlen = [];
  const GLEICHZEITIG = 4;
  for (let i = 0; i < tabellen.length; i += GLEICHZEITIG) {
    const ergebnisse = await Promise.all(
      tabellen.slice(i, i + GLEICHZEITIG).map(async eintrag => {
        try {
          const { rows } = await db.query(
            `SELECT count(*)::int AS n FROM ${alsBezeichner(eintrag.name)}`
          );
          return { ...eintrag, zeilen: rows[0].n };
        } catch (err) {
          logger.warn(`[werksreset] Vorschau für ${eintrag.name} fehlgeschlagen: ${err.message}`);
          return { ...eintrag, zeilen: null };
        }
      })
    );
    mitZahlen.push(...ergebnisse);
  }

  const ordner = [...ORDNER.inhalte, ...(stufe === 'auslieferung' ? ORDNER.auslieferung : [])];
  const ordnerStand = [];
  for (const [pfad, zweck] of ordner) {
    let eintraege = null;
    try {
      eintraege = (await fsp.readdir(pfad)).length;
    } catch {
      eintraege = null;
    }
    ordnerStand.push({ pfad, zweck, eintraege });
  }

  return {
    stufe,
    modelleLoeschen,
    geraetename: await geraetename(),
    tabellen: mitZahlen,
    zeilenGesamt: mitZahlen.reduce((s, t) => s + (t.zeilen ?? 0), 0),
    ordner: ordnerStand,
    n8nWirdGeleert: stufe === 'auslieferung',
    unbekannteTabellen: unbekannt,
    durchfuehrbar: unbekannt.length === 0,
  };
}

/**
 * Tabellen leeren. Reihenfolge ergibt sich aus den Fremdschlüsseln, nicht aus
 * einer Liste: was in dieser Runde scheitert, kommt in die nächste. Eine Runde
 * ganz ohne Fortschritt ist ein echter Fehler und bricht ab.
 * @param {import('pg').PoolClient} client - Innerhalb einer Transaktion.
 */
async function leereTabellen(client, namen) {
  let offen = [...namen];
  const geleert = {};
  let runde = 0;

  while (offen.length > 0) {
    runde += 1;
    const gescheitert = [];
    let letzterFehler = null;

    for (const name of offen) {
      const marke = `wr_${runde}_${gescheitert.length}_${Object.keys(geleert).length}`;
      await client.query(`SAVEPOINT ${marke}`);
      try {
        const res = await client.query(`DELETE FROM ${alsBezeichner(name)}`);
        geleert[name] = res.rowCount;
        await client.query(`RELEASE SAVEPOINT ${marke}`);
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${marke}`);
        gescheitert.push(name);
        letzterFehler = err;
      }
    }

    if (gescheitert.length === offen.length) {
      throw new ConflictError(
        `Werksreset abgebrochen: ${gescheitert.length} Tabellen lassen sich nicht leeren, ` +
          `zuletzt ${gescheitert[0]} (${letzterFehler?.message || 'ohne Meldung'})`
      );
    }
    offen = gescheitert;
  }

  return geleert;
}

/** Inhalt eines Ordners entfernen, den Ordner selbst behalten. */
async function leereOrdner(pfad) {
  let entfernt = 0;
  let eintraege;
  try {
    eintraege = await fsp.readdir(pfad);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { entfernt: 0, fehlend: true };
    }
    throw err;
  }
  for (const eintrag of eintraege) {
    await fsp.rm(path.join(pfad, eintrag), { recursive: true, force: true });
    entfernt += 1;
  }
  return { entfernt, fehlend: false };
}

/**
 * Werksreset ausführen.
 *
 * @param {object} opts
 * @param {'inhalte'|'auslieferung'} opts.stufe
 * @param {string} opts.bestaetigung - muss dem Gerätenamen entsprechen
 * @param {boolean} [opts.modelleLoeschen]
 * @param {string} [opts.ausgeloestVon]
 */
async function ausfuehren({ stufe, bestaetigung, modelleLoeschen = false, ausgeloestVon } = {}) {
  if (!STUFEN.includes(stufe)) {
    throw new ValidationError(`Unbekannte Stufe: ${stufe}. Erlaubt: ${STUFEN.join(', ')}`);
  }

  const name = await geraetename();
  if (String(bestaetigung || '').trim() !== name) {
    throw new ValidationError(`Bestätigung stimmt nicht. Es muss der Gerätename stehen: ${name}`);
  }

  const unbekannt = await unbekannteTabellen();
  if (unbekannt.length > 0) {
    throw new ConflictError(
      `Werksreset verweigert: ${unbekannt.length} Tabellen sind nicht eingeordnet ` +
        `(${unbekannt.join(', ')}). Ein Reset, der etwas stehen lässt, behauptet ` +
        `Vollständigkeit, die er nicht hat.`
    );
  }

  const begonnen = Date.now();
  const tabellen = tabellenFuer(stufe, modelleLoeschen).map(t => t.name);
  logger.warn(
    `[werksreset] Stufe "${stufe}" gestartet von ${ausgeloestVon || 'unbekannt'}, ` +
      `${tabellen.length} Tabellen, Modelle ${modelleLoeschen ? 'mit' : 'ohne'}`
  );

  const geleert = await db.transaction(async client => {
    const ergebnis = await leereTabellen(client, tabellen);
    if (stufe === 'auslieferung') {
      // n8n legt sein Schema beim Start selbst an. Ein leeres Schema ist der
      // ehrliche Auslieferungszustand: keine Workflows, keine Zugangsdaten,
      // kein Konto. Der Neustart des Containers passiert nach der Transaktion.
      await client.query('DROP SCHEMA IF EXISTS n8n CASCADE');
      await client.query('CREATE SCHEMA n8n');
      await werkseinstellungen(client);
    }
    return ergebnis;
  });

  const ordner = [...ORDNER.inhalte, ...(stufe === 'auslieferung' ? ORDNER.auslieferung : [])];
  const ordnerErgebnis = [];
  for (const [pfad, zweck] of ordner) {
    try {
      const { entfernt, fehlend } = await leereOrdner(pfad);
      ordnerErgebnis.push({ pfad, zweck, entfernt, fehlend });
    } catch (err) {
      logger.error(`[werksreset] Ordner ${pfad} nicht leerbar: ${err.message}`);
      ordnerErgebnis.push({ pfad, zweck, fehler: err.message });
    }
  }

  const nebenwirkungen = await raeumeUmsysteme({ stufe, modelleLoeschen });

  systemSettingsService
    .reload()
    .catch(err => logger.warn(`[werksreset] Einstellungen nicht neu geladen: ${err.message}`));
  cacheService.clear();

  const bericht = {
    stufe,
    modelleLoeschen,
    geraetename: name,
    ausgeloestVon: ausgeloestVon || null,
    dauerMs: Date.now() - begonnen,
    tabellen: geleert,
    zeilenGesamt: Object.values(geleert).reduce((s, n) => s + n, 0),
    ordner: ordnerErgebnis,
    ...nebenwirkungen,
  };

  logger.warn(
    `[werksreset] Stufe "${stufe}" fertig: ${bericht.zeilenGesamt} Zeilen, ` +
      `${bericht.dauerMs} ms`
  );
  return bericht;
}

/**
 * Alles, was nicht in der Datenbank und nicht im Dateisystem des Backends liegt:
 * Objektspeicher, Vektoren, n8n, Modelle. Jeder Punkt einzeln abgesichert, ein
 * nicht erreichbarer Nachbardienst darf den Reset nicht zurücknehmen; er ist zu
 * diesem Zeitpunkt schon geschehen.
 */
async function raeumeUmsysteme({ stufe, modelleLoeschen }) {
  const ergebnis = {};

  ergebnis.objektspeicher = await stillEntfernen('Objektspeicher', async () => {
    const minio = require('../documents/minioService');
    // listAllObjects liefert ein Set von PFADEN, keine Objekte. Ein
    // `objekt.name` waere hier undefined und der Objektspeicher bliebe voll,
    // ohne dass es jemand merkt.
    const pfade = [...(await minio.listAllObjects())];
    // Ein Aufruf je Datei laesst den Reset bei einem gefuellten Dokumentenspeicher
    // in die Minuten laufen. In Stapeln bleibt er in Sekunden.
    const STAPEL = 20;
    for (let i = 0; i < pfade.length; i += STAPEL) {
      await Promise.all(pfade.slice(i, i + STAPEL).map(pfad => minio.removeObject(pfad)));
    }
    return { entfernt: pfade.length };
  });

  ergebnis.vektoren = await stillEntfernen('Vektoren', async () => {
    const qdrant = require('../documents/qdrantService');
    return qdrant.deleteAllVectors();
  });

  if (stufe === 'auslieferung') {
    // Ohne diesen Schritt waere der Werksreset eine Luege: `bootstrap.js` legt
    // beim naechsten Start wieder einen Administrator an, sobald keiner
    // existiert UND `ADMIN_PASSWORD` noch in der .env steht. Das alte Passwort
    // wuerde nach dem Zuruecksetzen also weiter funktionieren. Der Wert, den
    // bootstrap.js als "nicht mehr verwendbar" liest, ist REDACTED_AFTER_BOOTSTRAP.
    ergebnis.erstpasswort = await stillEntfernen('Erstpasswort', async () => {
      const { updateEnvVariable } = require('../../utils/envManager');
      await updateEnvVariable('ADMIN_PASSWORD', 'REDACTED_AFTER_BOOTSTRAP');
      delete process.env.ADMIN_PASSWORD;
      return { entwertet: true };
    });

    ergebnis.n8n = await stillEntfernen('n8n', async () => {
      const docker = require('../core/docker');
      await docker.restartContainer('n8n');
      return { neugestartet: true };
    });
  }

  if (modelleLoeschen) {
    ergebnis.modelle = await stillEntfernen('Modelle', () => loescheAlleModelle());
  }

  return ergebnis;
}

/**
 * Alle Modelle von der Platte. Gefragt wird Ollama selbst, nicht die eigene
 * Tabelle: was wirklich Platz belegt, weiss nur die Laufzeit. Die Tabelle
 * `llm_installed_models` wird ohnehin geleert, wenn diese Option gewaehlt ist.
 */
async function loescheAlleModelle() {
  const axios = require('axios');
  const services = require('../../config/services');
  const basis = services.llm.url;

  const { data } = await axios.get(`${basis}/api/tags`, { timeout: 15000 });
  const namen = (data?.models || []).map(m => m.name).filter(Boolean);

  const entfernt = [];
  const fehler = [];
  for (const name of namen) {
    try {
      await axios.delete(`${basis}/api/delete`, { data: { name }, timeout: 60000 });
      entfernt.push(name);
    } catch (err) {
      fehler.push(`${name}: ${err.message}`);
    }
  }
  return { entfernt: entfernt.length, namen: entfernt, fehler };
}

async function stillEntfernen(was, fn) {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    logger.error(`[werksreset] ${was} nicht geräumt: ${err.message}`);
    return { ok: false, fehler: err.message };
  }
}

/**
 * Die Einzelzeile `system_settings` auf Werkswerte. Nicht löschen: an `id = 1`
 * hängt ein Dutzend Abfragen, und die Spaltendefaults sind die Werkswerte.
 */
async function werkseinstellungen(client) {
  const { rows } = await client.query(
    `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'system_settings'
        AND column_name <> 'id'`
  );
  const zuweisungen = rows.map(spalte => {
    const ziel =
      spalte.column_default !== null && !/nextval\(/.test(spalte.column_default)
        ? spalte.column_default
        : 'NULL';
    // Nicht-nullbare Spalten ohne Default gäbe es nur als Fehler im Schema.
    return `${escapeIdentifier(spalte.column_name)} = ${ziel}`;
  });
  if (zuweisungen.length === 0) {
    return;
  }
  await client.query(`UPDATE system_settings SET ${zuweisungen.join(', ')} WHERE id = 1`);
}

module.exports = {
  STUFEN,
  ORDNER,
  vorschau,
  ausfuehren,
  unbekannteTabellen,
  tabellenFuer,
  geraetename,
  // für Tests
  _leereTabellen: leereTabellen,
  _werkseinstellungen: werkseinstellungen,
};
