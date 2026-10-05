/**
 * Der Zeitplaner des Geraets (M5, 04.10.2026, Auftrag zeitplaner-im-geraet).
 *
 * Ein Flow, dessen Kopf `ausloeser: [{typ: zeitplan, zeitplan: "0 6 * * 1-5"}]`
 * nennt, laeuft zur festgelegten Zeit von allein. Was ein Ausdruck bedeutet,
 * steht in `zeitplan.js`; hier steht, WANN ein Lauf entsteht und wann nicht.
 *
 * DIE REGELN, und jede steht auch im Admin-Handbuch und in FLOWS.md:
 *
 *   NUR DER LIVESTAND. Der Teststand ist eine Fassung, die jemand ausprobiert;
 *     liefe sein Zeitplan mit, liefe jeder Flow doppelt.
 *   GENAU EINMAL JE TERMIN. Ein Termin ist eine Zeile in
 *     `flow_zeitplan_termine`; wer sie anlegt (Primaerschluessel), startet den
 *     Lauf. Ein zweiter Takt, ein Neustart mitten im Termin findet sie vor.
 *   AUSFALL. Das Backend sieht in jedem Takt nach, was seit dem letzten Mal
 *     (`flow_zeitplaner.geprueft_bis`) faellig wurde. Waren mehrere Termine
 *     eines Flows faellig, zaehlt nur der juengste, und er auch nur, wenn er
 *     hoechstens eine Stunde zurueckliegt: dann wird er EINMAL nachgeholt
 *     (`nachgeholt`). Alles andere wird uebersprungen und steht mit Grund in
 *     der Tabelle; die Seite der App zeigt es dem Admin. Ein Termin bis fuenf
 *     Minuten zurueck gilt als puenktlich (`gestartet`): ein Neustart des
 *     Backends dauert so lange.
 *   KEIN ZWEITER LAUF. Laeuft oder wartet (auf eine Freigabe) schon ein Lauf
 *     desselben Flows im Livestand, entfaellt der Termin (`uebersprungen`).
 *     Zwei Laeufe desselben Auftrags nebeneinander schreiben sich in die Daten.
 *   PAUSE UND AUS. Ein pausierter Zeitplan (`flow_settings.zeitplan_pausiert`)
 *     und ein ausgeschalteter Flow (`aktiv`) starten nichts. Die Termine
 *     dazwischen verfallen ohne Eintrag und werden nicht nachgeholt: der
 *     Admin hat sie ausgesetzt.
 *   OHNE MENSCHEN. Der Lauf hat als Ausloeser `zeitplan` und keinen
 *     Einreicher. Besitzer ist, wem der Livestand-Schluessel der App gehoert;
 *     fehlt der (Konto geloescht oder stillgelegt), der aelteste aktive
 *     Admin -- sonst stuende
 *     ein Zeitplan nach fuenf Jahren und einem Personalwechsel still.
 *   OHNE ARGUMENTE. Ein Flow mit einem Pflichtargument ohne Vorgabe kann nicht
 *     nach Zeitplan laufen; sein Termin wird mit diesem Grund uebersprungen.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { NotFoundError } = require('../../utils/errors');
const zeitplan = require('./zeitplan');

const { MIN, ZEITZONE } = zeitplan;

const TAKT_MS = 15 * 1000;
/** Bis hierher zurueck gilt ein Termin als puenktlich. */
const PUENKTLICH_MS = 5 * MIN;
/** Bis hierher zurueck wird ein verpasster Termin noch nachgeholt. */
const NACHHOLEN_MS = 60 * MIN;
/** So weit schaut der Zeitplaner nach einem Ausfall hoechstens zurueck. */
const RUECKBLICK_MS = 7 * 24 * 60 * MIN;
const AUFBEWAHREN_TAGE = 90;

/** Die Zeitplan-Ausdruecke aus dem Kopf eines Flows, gelesen. Unlesbare fehlen. */
function ausdruecke(ausloeser) {
  return (ausloeser || []).filter(a => a?.typ === 'zeitplan' && a.zeitplan).map(a => a.zeitplan);
}

function lesePlaene(liste, wo) {
  const gelesen = [];
  for (const ausdruck of liste) {
    try {
      gelesen.push(zeitplan.lese(ausdruck));
    } catch (err) {
      logger.warn(`Zeitplaner: "${ausdruck}" bei ${wo} nicht lesbar: ${err.message}`);
    }
  }
  return gelesen;
}

/** Die Uhrzeit eines Termins in Worten fuer einen Grund: "Dienstag, 06:00 Uhr". */
function terminInWorten(ms) {
  const tag = new Intl.DateTimeFormat('de-DE', {
    timeZone: ZEITZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(ms));
  const uhr = new Intl.DateTimeFormat('de-DE', {
    timeZone: ZEITZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(ms));
  return `${tag}, ${uhr} Uhr`;
}

/**
 * Alle Flows des Livestandes mit mindestens einem Zeitplan, samt Pause und
 * Schalter. Eine Abfrage fuer alle: der Takt kommt vier Mal in der Minute.
 */
async function ladePlaene({ datenbank = db } = {}) {
  const { rows } = await datenbank.query(
    `SELECT f.app_id, f.name, f.definition->'ausloeser' AS ausloeser,
            COALESCE(s.zeitplan_pausiert, false) AS pausiert,
            COALESCE(s.aktiv, true) AS aktiv
       FROM public.app_flows f
       LEFT JOIN public.flow_settings s ON s.app_id = f.app_id AND s.flow_name = f.name
      WHERE f.stand = 'live' AND f.definition->'ausloeser' IS NOT NULL`
  );
  return rows
    .map(z => ({
      appId: z.app_id,
      flowName: z.name,
      pausiert: z.pausiert,
      aktiv: z.aktiv,
      plaene: lesePlaene(ausdruecke(z.ausloeser), `${z.app_id}/${z.name}`),
    }))
    .filter(z => z.plaene.length > 0);
}

/**
 * Den Termin eintragen. Wahr, wenn DIESER Aufruf ihn angelegt hat -- nur dann
 * darf er den Lauf starten.
 */
async function beanspruche({ appId, flowName, termin, ergebnis, grund = null }, datenbank = db) {
  const { rowCount } = await datenbank.query(
    `INSERT INTO public.flow_zeitplan_termine (app_id, flow_name, termin, ergebnis, grund)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (app_id, flow_name, termin) DO NOTHING`,
    [appId, flowName, new Date(termin), ergebnis, grund]
  );
  return rowCount === 1;
}

/**
 * Wem gehoert der Lauf: der Schluessel des Livestandes, sonst ein Admin. Nur
 * ein AKTIVES Konto: ein stillgelegtes behielte sonst den Zeitplan, und jede
 * Route des Laufs wiese ihn ab (`tools/route.personDesLaufs`).
 */
async function besitzer(appId, datenbank = db) {
  const schluessel = await datenbank.query(
    `SELECT k.created_by FROM public.api_keys k
       JOIN public.admin_users u ON u.id = k.created_by AND u.is_active = TRUE
      WHERE k.app_id = $1 AND k.stand = 'live'
      ORDER BY k.id DESC LIMIT 1`,
    [appId]
  );
  if (schluessel.rows[0]) {
    return Number(schluessel.rows[0].created_by);
  }
  const admin = await datenbank.query(
    `SELECT id FROM public.admin_users
      WHERE role = 'admin' AND is_active = TRUE ORDER BY id ASC LIMIT 1`
  );
  return admin.rows[0] ? Number(admin.rows[0].id) : null;
}

/** Der Lauf, der gerade laeuft oder wartet, oder null. */
async function offenerLauf({ appId, flowName }, datenbank = db) {
  const { rows } = await datenbank.query(
    `SELECT id FROM flow_runs
      WHERE app_id = $1 AND stand = 'live' AND flow_name = $2
        AND status IN ('laeuft', 'wartend')
      ORDER BY id DESC LIMIT 1`,
    [appId, flowName]
  );
  return rows[0] ? Number(rows[0].id) : null;
}

/** Den Lauf zu einem Termin starten. Wirft, wenn er nicht startet. */
async function startLauf({ appId, flowName }, deps = {}) {
  const {
    ladeFlow = require('../app/appFlows').lade,
    argumente = require('./runFlow').resolveArguments,
    starten = require('./flowRunner').starten,
    wem = besitzer,
  } = deps;
  const userId = await wem(appId);
  if (!userId) {
    throw new NotFoundError('Es gibt kein aktives Admin-Konto, dem der Lauf gehören könnte');
  }
  const flow = await ladeFlow({ appId, stand: 'live', name: flowName });
  argumente(flow.argumente, {});
  const { runId } = await starten({
    flowName,
    args: {},
    userId,
    appId,
    stand: 'live',
    einreicherId: null,
    freigabeRegel: null,
    ausloeser: 'zeitplan',
  });
  return runId;
}

/**
 * Die faelligen Termine EINES Flows abarbeiten (siehe Kopf der Datei).
 *
 * @returns {Promise<string|null>} was getan wurde, fuer Tests und Protokoll
 */
async function bearbeite(flow, termine, jetzt, deps = {}) {
  const { datenbank = db, start = startLauf } = deps;
  if (flow.pausiert || !flow.aktiv || termine.length === 0) {
    return null;
  }
  const { appId, flowName } = flow;

  // Nur, was juenger ist als der letzte eingetragene Termin: ein Neustart
  // mitten in der Arbeit holt nichts doppelt nach.
  const { rows } = await datenbank.query(
    `SELECT MAX(termin) AS letzter FROM public.flow_zeitplan_termine
      WHERE app_id = $1 AND flow_name = $2`,
    [appId, flowName]
  );
  const letzter = rows[0]?.letzter ? new Date(rows[0].letzter).getTime() : 0;
  const neu = termine.filter(t => t > letzter);
  if (neu.length === 0) {
    return null;
  }
  const juengster = neu[neu.length - 1];
  const aelter = neu.slice(0, -1);
  const alter = jetzt - juengster;

  let ergebnis = alter <= PUENKTLICH_MS ? 'gestartet' : 'nachgeholt';
  let grund = null;
  if (alter > NACHHOLEN_MS) {
    ergebnis = 'uebersprungen';
    grund = `Verpasst: ${terminInWorten(juengster)}. Das Gerät lief zu der Zeit nicht; nach mehr als einer Stunde wird nicht mehr nachgeholt.`;
  } else {
    const offen = await offenerLauf(flow, datenbank);
    if (offen) {
      ergebnis = 'uebersprungen';
      grund = `Der Lauf Nr. ${offen} dieses Flows läuft noch oder wartet auf eine Freigabe; es startet kein zweiter.`;
    }
  }

  const angelegt = await beanspruche(
    { appId, flowName, termin: juengster, ergebnis, grund },
    datenbank
  );
  if (aelter.length > 0) {
    await beanspruche(
      {
        appId,
        flowName,
        termin: aelter[aelter.length - 1],
        ergebnis: 'uebersprungen',
        grund: `Verpasst: ${aelter.length} ${aelter.length === 1 ? 'Termin' : 'Termine'} vor dem letzten, während das Gerät nicht lief. Nachgeholt wird höchstens der letzte.`,
      },
      datenbank
    );
  }
  if (!angelegt || ergebnis === 'uebersprungen') {
    return angelegt ? 'uebersprungen' : null;
  }

  try {
    const runId = await start(flow);
    await datenbank.query(
      `UPDATE public.flow_zeitplan_termine SET run_id = $4
        WHERE app_id = $1 AND flow_name = $2 AND termin = $3`,
      [appId, flowName, new Date(juengster), runId]
    );
    logger.info(
      `Zeitplaner: ${appId}/${flowName} ${ergebnis} (Termin ${new Date(juengster).toISOString()}, Lauf ${runId})`
    );
    return ergebnis;
  } catch (err) {
    logger.warn(`Zeitplaner: ${appId}/${flowName} startet nicht: ${err.message}`);
    await datenbank.query(
      `UPDATE public.flow_zeitplan_termine SET ergebnis = 'uebersprungen', grund = $4
        WHERE app_id = $1 AND flow_name = $2 AND termin = $3`,
      [appId, flowName, new Date(juengster), `Der Lauf startete nicht: ${err.message}`]
    );
    return 'uebersprungen';
  }
}

let letzteReinigung = 0;

/**
 * Ein Takt: alles abarbeiten, was seit dem letzten Mal faellig wurde.
 *
 * @param {number} [jetzt] ms; fuer Tests
 */
async function takt(jetzt = Date.now(), deps = {}) {
  const { datenbank = db } = deps;
  const bis = Math.floor(jetzt / MIN) * MIN;

  const stand = await datenbank.query(
    'SELECT geprueft_bis FROM public.flow_zeitplaner WHERE id = 1'
  );
  if (stand.rows.length === 0) {
    // Der allererste Takt: es gibt nichts nachzuholen, nur einen Anfang.
    await datenbank.query(
      'INSERT INTO public.flow_zeitplaner (id, geprueft_bis) VALUES (1, $1) ON CONFLICT (id) DO NOTHING',
      [new Date(bis)]
    );
    return [];
  }
  let von = new Date(stand.rows[0].geprueft_bis).getTime();
  if (bis <= von) {
    return [];
  }
  if (bis - von > RUECKBLICK_MS) {
    logger.warn('Zeitplaner: länger als sieben Tage nicht gelaufen, es zählt nur die letzte Woche');
    von = bis - RUECKBLICK_MS;
  }

  const getan = [];
  let gescheitert = false;
  for (const flow of await ladePlaene({ datenbank })) {
    try {
      const termine = zeitplan.faellige(flow.plaene, von, bis);
      const was = await bearbeite(flow, termine, jetzt, deps);
      if (was) {
        getan.push({ app: flow.appId, flow: flow.flowName, ergebnis: was });
      }
    } catch (err) {
      gescheitert = true;
      logger.error(`Zeitplaner: ${flow.appId}/${flow.flowName}: ${err.message}`);
    }
  }

  // Ist ein Flow gescheitert, bevor sein Termin eingetragen war, rueckt die
  // Marke nicht vor: der naechste Takt sieht denselben Zeitraum noch einmal.
  // Fuer die anderen Flows ist das harmlos -- was schon eingetragen ist,
  // filtert `bearbeite` aus, und der Primaerschluessel haelt den Rest.
  if (gescheitert) {
    return getan;
  }
  await datenbank.query('UPDATE public.flow_zeitplaner SET geprueft_bis = $1 WHERE id = 1', [
    new Date(bis),
  ]);

  // Stuendlich alte Eintraege entfernen.
  if (bis - letzteReinigung >= 60 * MIN) {
    letzteReinigung = bis;
    await datenbank
      .query(
        `DELETE FROM public.flow_zeitplan_termine
          WHERE erfasst_am < NOW() - ($1 || ' days')::interval`,
        [String(AUFBEWAHREN_TAGE)]
      )
      .catch(err => logger.warn(`Zeitplaner: Aufräumen gescheitert: ${err.message}`));
  }
  return getan;
}

let laeuft = false;

/**
 * Den Zeitplaner starten: ein Takt alle 15 Sekunden, nie zwei zugleich.
 * Der erste Takt kommt sofort, damit nach einem Neustart das Verpasste noch
 * vor der naechsten Minute ansteht.
 *
 * @returns {NodeJS.Timeout} fuer `globalIntervals`
 */
function starten() {
  const einmal = async () => {
    if (laeuft) {
      return;
    }
    laeuft = true;
    try {
      await takt();
    } catch (err) {
      logger.error(`Zeitplaner: Takt gescheitert: ${err.message}`);
    } finally {
      laeuft = false;
    }
  };
  einmal();
  const zeitgeber = setInterval(einmal, TAKT_MS);
  zeitgeber.unref?.();
  return zeitgeber;
}

/**
 * Der letzte Termin eines Flows als Spalte `letzter_termin` einer Abfrage auf
 * `public.app_flows f`: wann, was daraus wurde, warum. Eine Spalte statt einer
 * zweiten Abfrage, weil die Liste der Flows bei jedem Blick auf die App geholt
 * wird.
 */
const LETZTER_TERMIN_SQL = `(SELECT to_jsonb(t) FROM (
       SELECT z.termin, z.ergebnis, z.grund, z.run_id
         FROM public.flow_zeitplan_termine z
        WHERE z.app_id = f.app_id AND z.flow_name = f.name
        ORDER BY z.termin DESC LIMIT 1) t) AS letzter_termin`;

/**
 * Was die Seite der App zum Zeitplan eines Flows zeigt, oder null, wenn der
 * Flow keinen hat.
 *
 * `naechster_termin` steht nur, wenn er auch eintritt: im Livestand, nicht
 * pausiert, Flow aktiv. Sonst ist es `null`, und `laeuft_nicht` sagt, warum.
 */
function angabe({ definition, stand, einstellung, letzter, jetzt = Date.now() }) {
  const liste = ausdruecke(definition.ausloeser);
  if (liste.length === 0) {
    return null;
  }
  const pausiert = einstellung?.zeitplan_pausiert === true;
  const aktiv = einstellung?.aktiv !== false;
  let laeuftNicht = null;
  if (stand !== 'live') {
    laeuftNicht = 'teststand';
  } else if (pausiert) {
    laeuftNicht = 'pausiert';
  } else if (!aktiv) {
    laeuftNicht = 'ausgeschaltet';
  }
  const naechster = laeuftNicht
    ? null
    : zeitplan.naechster(lesePlaene(liste, 'Anzeige'), Math.floor(jetzt / MIN) * MIN);
  return {
    ausdruecke: liste,
    zeitzone: ZEITZONE,
    pausiert,
    laeuft_nicht: laeuftNicht,
    naechster_termin: naechster === null ? null : new Date(naechster).toISOString(),
    letzter_termin: letzter
      ? {
          termin: new Date(letzter.termin).toISOString(),
          ergebnis: letzter.ergebnis,
          grund: letzter.grund || null,
          run_id: letzter.run_id ?? null,
        }
      : null,
  };
}

module.exports = {
  PUENKTLICH_MS,
  NACHHOLEN_MS,
  ausdruecke,
  ladePlaene,
  besitzer,
  offenerLauf,
  startLauf,
  bearbeite,
  takt,
  starten,
  LETZTER_TERMIN_SQL,
  angabe,
};
