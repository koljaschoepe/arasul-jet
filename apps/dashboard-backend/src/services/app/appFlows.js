/**
 * Die Flows einer App (Phase C6 des Umbaus vom 26.08.2026).
 *
 * Bis C5 war ein Flow eine Datei unter `/arasul/flows/`, die ein Mensch am
 * Geraet anlegte, und `app.json` nannte in `flows: [...]` nur die Namen derer,
 * die eine App VORAUSSETZT. Wer eine App ausrollte, baute ihre Flows getrennt
 * davon von Hand nach; ob beides zusammenpasste, zeigte sich beim ersten Lauf.
 *
 * Ab C6 bringt das Paket seine Flows mit:
 *
 *     app.json                     "flows": { "verzeichnis": "flows" }
 *     flows/bericht.md             ein Flow, YAML-Kopf + Markdown-Rumpf
 *     flows/pruefen.md             noch einer
 *
 * Beim Einspielen werden sie JE APP UND STAND registriert (`app_flows`). Der
 * Namensraum ist damit die App: zwei Apps duerfen beide einen `bericht` haben,
 * ohne voneinander zu wissen, und der `bericht` des Teststandes ist ein
 * anderer Gegenstand als der des Livestandes -- der Teststand ist eine andere
 * Version.
 *
 * WAS DER ADMINISTRATOR AENDERT, LIEGT NICHT IN DER DATEI (`flow_settings`,
 * `services/flows/flowSettings.js`). Die Datei gehoert dem Partner und kommt
 * mit jedem Paket neu; eine Aenderung darin waere beim naechsten Update weg.
 * Deshalb ueberlebt die Ueberschreibung ein App-Update, ohne dass der Deploy
 * eine Datei aussparen muesste.
 *
 * ORIENTIERUNG AN `.claude/`: eine Datei je Flow, der Auftrag im Rumpf, die
 * Werkzeuge im Kopf, Rollen als Unteragenten. Was dort ein Projekt ist, ist
 * hier eine App.
 */

const fs = require('fs').promises;
const path = require('path');

const db = require('../../database');
const logger = require('../../utils/logger');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { parseFlowFile } = require('../flows/flowFile');
const { FLOW_NAME_RE } = require('../../schemas/flows');
const flowSettings = require('../flows/flowSettings');

/** Wie viele Flows ein Paket hoechstens mitbringen darf. */
const MAX_FLOWS = 50;

/**
 * Die Flow-Dateien eines ausgepackten oder abgelegten Standes lesen und
 * pruefen.
 *
 * Ein Aufruf, zwei Benutzer: `appPaket.pruefePaketInhalt` ruft ihn gegen den
 * Eingang, BEVOR gebaut wird (ein Paket, dessen Flow nicht parst, soll gar
 * nicht erst ankommen), und `registriere` gegen den fertigen Versionsordner.
 * Zwei Pruefungen mit unterschiedlicher Strenge waeren zwei Meinungen darueber,
 * was ein gueltiger Flow ist.
 *
 * @param {object} manifest das gepruefte `app.json`
 * @param {string} ordner der Ordner, in dem `manifest.flows.verzeichnis` liegt
 * @returns {Promise<{name: string, definition: object}[]>} leer, wenn das
 *   Manifest keine Flows ankuendigt
 */
async function leseAusPaket(manifest, ordner) {
  if (!manifest.flows) {
    return [];
  }
  const flowOrdner = path.join(ordner, manifest.flows.verzeichnis);

  let eintraege;
  try {
    eintraege = await fs.readdir(flowOrdner, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new ValidationError(
        `Das Manifest verspricht Flows in ${manifest.flows.verzeichnis}/, im Paket gibt es den Ordner nicht.`
      );
    }
    throw err;
  }

  const dateien = eintraege
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map(e => e.name)
    .sort();

  if (dateien.length === 0) {
    throw new ValidationError(
      `${manifest.flows.verzeichnis}/ enthaelt keine einzige .md-Datei. ` +
        'Ein Manifest, das Flows ankuendigt, soll welche mitbringen -- sonst gehoert `flows` nicht hinein.'
    );
  }
  if (dateien.length > MAX_FLOWS) {
    throw new ValidationError(`${dateien.length} Flows im Paket, erlaubt sind ${MAX_FLOWS}.`);
  }

  const gelesen = [];
  for (const datei of dateien) {
    const name = datei.slice(0, -3);
    if (!FLOW_NAME_RE.test(name)) {
      throw new ValidationError(
        `Der Dateiname ${datei} ist kein Flow-Name: Kleinbuchstaben, Ziffern und Bindestriche.`
      );
    }
    const text = await fs.readFile(path.join(flowOrdner, datei), 'utf8');
    // `parseFlowFile` wirft einen ValidationError mit der Stelle im Kopf. Der
    // Dateiname geht als Vorgabe mit, damit ein Kopf ohne `name:` ladbar
    // bleibt -- genauso, wie es die Flows der Plattform halten.
    const definition = parseFlowFile(text, { name });

    // Der Dateiname gewinnt nicht ueber den Kopf, aber er muss zu ihm passen.
    // Dieselbe Regel wie beim Manifest (`id`/`version` gegen den Ordner): ein
    // Flow mit zwei Namen ist einer, den man beim naechsten Mal nicht
    // wiederfindet -- die Datenbank kennt ihn unter dem einen, der Partner
    // sucht ihn unter dem anderen.
    if (definition.name !== name) {
      throw new ValidationError(
        `${datei} nennt sich im Kopf "${definition.name}". Dateiname und "name" muessen dasselbe sagen.`
      );
    }

    // KEINE ORDNER FUER APP-FLOWS (C6). `ordner` sind absolute Pfade am
    // Geraet, und ein Flow aus einem Paket koennte damit `/arasul/config`
    // deklarieren und mit `dateien_lesen` die Umgebungsdatei ausliefern. Eine
    // App bekommt einen eigenen, abgeschirmten Datenordner -- aber der ist ein
    // eigener Beschluss mit Sicherung und Werksreset und gehoert in die
    // D-Phasen, nicht nebenbei hierher. Bis dahin ist die ehrliche Antwort
    // eine Abweisung mit Begruendung und kein halb gesperrter Pfad.
    //
    // Praktisch trifft das nur Flows mit Datei-Werkzeugen: `schemas/flows.js`
    // verlangt fuer die ohnehin einen Ordner, und wer keine benutzt, nennt
    // auch keinen.
    if (definition.ordner.length > 0) {
      throw new ValidationError(
        `${datei} deklariert Ordner (${definition.ordner.join(', ')}). Ein Flow aus einem ` +
          'App-Paket arbeitet ohne Ordner am Geraet; die Datei-Werkzeuge kommen mit den D-Phasen.'
      );
    }

    gelesen.push({ name, definition });
  }
  return gelesen;
}

/**
 * Die Flows eines Standes registrieren.
 *
 * ERSETZEN, NICHT ERGAENZEN: was der Stand hat, sagt das Paket, das gerade
 * eingespielt wird. Ein Flow, den die neue Version nicht mehr mitbringt, ist
 * weg -- stehen zu lassen hiesse, einen Flow anzubieten, den niemand mehr
 * pflegt und den kein Paket je wieder aktualisiert.
 *
 * Die Ueberschreibungen des Administrators (`flow_settings`) fasst dieser
 * Aufruf NICHT an. Genau das ist ihr Zweck: sie ueberleben ein App-Update.
 *
 * @param {{appId: string, stand: 'test'|'live', version: string, manifest: object, versionsPfad: string}} was
 * @returns {Promise<string[]>} die Namen der registrierten Flows
 */
async function registriere({ appId, stand, version, manifest, versionsPfad }) {
  const gelesen = await leseAusPaket(manifest, versionsPfad);

  await db.query('DELETE FROM public.app_flows WHERE app_id = $1 AND stand = $2', [appId, stand]);
  for (const { name, definition } of gelesen) {
    await db.query(
      `INSERT INTO public.app_flows (app_id, stand, name, version, definition)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [appId, stand, name, version, JSON.stringify(definition)]
    );
  }
  if (gelesen.length > 0) {
    logger.info(
      `App-Flows registriert: ${appId}/${stand} ${version} -> ${gelesen.map(f => f.name).join(', ')}`
    );
  }
  return gelesen.map(f => f.name);
}

/**
 * Die Flows eines Standes, wie ein Aufrufer sie sehen soll: Name, Beschreibung,
 * Argumente und das Modell, das sie WIRKLICH treibt (Ueberschreibung
 * eingerechnet).
 *
 * Der Prompt steht nicht darin. Er ist der Auftrag des Partners an das Modell
 * und geht den Aufrufer nichts an; wer ihn braucht, hat das Paket.
 */
async function liste({ appId, stand }) {
  const { rows } = await db.query(
    `SELECT name, version, definition, registriert_am
       FROM public.app_flows
      WHERE app_id = $1 AND stand = $2
      ORDER BY name`,
    [appId, stand]
  );
  const einstellungen = await flowSettings.listeFuer(appId);
  return rows.map(z => ({
    name: z.name,
    beschreibung: z.definition.beschreibung || '',
    argumente: (z.definition.argumente || []).map(a => ({
      name: a.name,
      typ: a.typ,
      pflicht: a.pflicht === true,
      beschreibung: a.beschreibung || '',
      optionen: a.optionen || undefined,
    })),
    modell: einstellungen.get(z.name)?.modell || z.definition.modell || null,
    modell_ueberschrieben: Boolean(einstellungen.get(z.name)?.modell),
    version: z.version,
    registriert_am: z.registriert_am,
  }));
}

/**
 * Einen Flow einer App laden, fertig fuer den Runner.
 *
 * Hier faellt die Ueberschreibung ein: steht in `flow_settings` ein Modell,
 * gilt es, sonst das aus dem Frontmatter. Der Runner bekommt eine Definition
 * und muss nicht wissen, aus welchen zwei Quellen sie zusammengesetzt ist.
 *
 * NotFound und nicht Forbidden, wenn es den Flow in diesem Stand nicht gibt:
 * derselbe Schnitt wie ueberall am Geraet -- wer nicht darf, erfaehrt nicht,
 * was es gibt.
 */
async function lade({ appId, stand, name }) {
  const { rows } = await db.query(
    `SELECT name, version, definition
       FROM public.app_flows
      WHERE app_id = $1 AND stand = $2 AND name = $3`,
    [appId, stand, name]
  );
  if (rows.length === 0) {
    throw new NotFoundError(`App ${appId} hat im ${stand}-Stand keinen Flow "${name}"`);
  }
  const einstellung = await flowSettings.hole({ appId, flowName: name });
  const definition = rows[0].definition;
  return {
    ...definition,
    ...(einstellung?.modell ? { modell: einstellung.modell } : {}),
  };
}

module.exports = {
  MAX_FLOWS,
  leseAusPaket,
  registriere,
  liste,
  lade,
};
