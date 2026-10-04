/**
 * Live schalten mit Sicherung und Rueckfall (M5, Auftrag
 * live-schalten-mit-sicherung, 04.10.2026).
 *
 * Das Zielbild (frontend.md, Flows und Freigaben, Punkt Test und Live): der
 * Admin schaltet live. Vorher sichert Arasul die Datenbank der App; scheitert
 * die Strukturaenderung, schaltet es selbst zurueck. Der Test hat eigene Daten
 * und bekommt nie eine Kopie von Live.
 *
 * DER ABLAUF, in dieser Reihenfolge:
 *
 *   1. Der Livestand haelt an. Was er zwischen Sicherung und Umschalten noch
 *      schriebe, waere nach einem Rueckfall verloren; eine Minute Pause ist
 *      ehrlicher als eine Luecke, die niemand sieht.
 *   2. Ein Stand der Sicherung entsteht (restic, `sicherungsdienst.sichereVorLive`,
 *      Tag `vorher` und `fuer:live:<id>`). Misslingt er, wird NICHT geschaltet,
 *      und der alte Livestand laeuft weiter.
 *   3. `appStore.schalte` spielt die Fassung aus dem Teststand in den
 *      Livestand ein. Die App fuehrt ihre Strukturaenderung selbst beim Start
 *      aus (Kontrakt, `daten`).
 *   4. Der neue Container muss gesund werden und bleiben
 *      (`appContainer.bleibtGesund`): ein Absturz, ein Neustart, `unhealthy`
 *      oder die Frist heissen gescheitert.
 *   5. Gescheitert: der neue Container geht, die Live-Datenbank kommt aus dem
 *      Stand von Schritt 2 zurueck (verworfen und neu eingespielt, samt allem,
 *      was die halbe Strukturaenderung angelegt hatte), und die Fassung von
 *      vorher laeuft wieder -- mit ihrer `vorige_version` und ihrem
 *      Aenderungstext, als waere nichts gewesen.
 *
 * Der Teststand wird an keiner Stelle angefasst: weder sein Container noch
 * seine Datenbank. Kopiert wird nie, in keine Richtung.
 *
 * Jeder Versuch steht in `app_schaltungen` (Migration 199), mit einem Satz fuer
 * den Admin, einem zweiten, was er tun kann, und der Technik zum Aufklappen.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const { ConflictError, LiveSchaltenError } = require('../../utils/errors');
const appStore = require('./appStore');
const appContainer = require('./appContainer');
const appDatenbank = require('./appDatenbank');
const appFlows = require('./appFlows');
const sicherungsdienst = require('../betrieb/sicherungsdienst');

/** Apps, die gerade geschaltet werden. Zwei Versuche zugleich saehen einander zu. */
const laufend = new Set();

const HILFE_ENTWICKLER =
  'Geben Sie die technischen Angaben an den Entwickler weiter; sobald eine korrigierte Fassung im Test liegt, können Sie erneut live schalten.';

async function beginne({ appId, von, nach, durch }) {
  const { rows } = await db.query(
    `INSERT INTO public.app_schaltungen (app_id, von_version, nach_version, durch)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [appId, von ?? null, nach, Number.isInteger(durch) ? durch : null]
  );
  return rows[0].id;
}

async function beende(id, { ergebnis, sicherungId = null, satz, hilfe = null, technik = null }) {
  const { rows } = await db.query(
    `UPDATE public.app_schaltungen
        SET ergebnis = $2, sicherung_id = $3, satz = $4, hilfe = $5, technik = $6,
            beendet_am = NOW()
      WHERE id = $1
      RETURNING id, app_id, von_version, nach_version, ergebnis, sicherung_id, satz, hilfe,
                technik, begonnen_am, beendet_am`,
    [id, ergebnis, sicherungId, satz, hilfe, technik ? JSON.stringify(technik) : null]
  );
  return rows[0];
}

/** Nur das Ende einer langen Ausgabe; die Technik ist zum Lesen da, nicht zum Archivieren. */
function kurz(text, zeichen = 4000) {
  const t = String(text ?? '').trim();
  return t.length > zeichen ? `…${t.slice(-zeichen)}` : t;
}

/**
 * Ein erstes Live-Schalten ist gescheitert: es gab vorher keinen Livestand,
 * also gibt es danach auch keinen. Weg faellt, was nur dieser Versuch angelegt
 * hat -- die Zeile, die Flows, der Schluessel und, wenn sie eben erst entstand,
 * die Datenbank.
 */
async function nimmLivestandWeg(appId, { datenbankNeu }) {
  await db.query(`DELETE FROM public.app_staende WHERE app_id = $1 AND stand = 'live'`, [appId]);
  await appFlows.registriere({ appId, stand: 'live', version: '', flows: [] });
  await db.query(`DELETE FROM public.api_keys WHERE app_id = $1 AND stand = 'live'`, [appId]);
  if (datenbankNeu) {
    await appDatenbank.entferneStand(appId, 'live');
  }
}

/**
 * Zurueck auf Fassung und Daten von vorher. Wirft nicht: was misslingt, steht
 * im Ergebnis, damit der Satz an den Admin stimmt.
 */
async function fallZurueck({ appId, vorher, sicherung, datenbankNeu, durch }) {
  const rueckfall = { daten: null, fassung: null };
  await appContainer.entferne(appId, 'live').catch(fehler => {
    logger.warn(`${appId}: neuer Livestand liess sich nicht entfernen: ${fehler.message}`);
  });

  if (sicherung?.id) {
    const daten = await sicherungsdienst.holeLiveDatenZurueck(appId, sicherung.id);
    rueckfall.daten = { erfolg: daten.erfolg, ausgabe: kurz(daten.ausgabe, 2000) };
  }

  if (!vorher) {
    try {
      await nimmLivestandWeg(appId, { datenbankNeu });
      rueckfall.fassung = { erfolg: true, version: null };
    } catch (fehler) {
      rueckfall.fassung = { erfolg: false, version: null, fehler: fehler.message };
    }
    return rueckfall;
  }

  try {
    await appStore.spieleEin({
      appId,
      version: vorher.version,
      stand: 'live',
      durch,
      aenderungstext: vorher.aenderungstext ?? null,
    });
    // `spieleEin` haette sich die gescheiterte Fassung als vorige gemerkt; die
    // lief nie, und „Zurück auf" darf nicht auf sie zeigen.
    await db.query(
      `UPDATE public.app_staende SET vorige_version = $2
        WHERE app_id = $1 AND stand = 'live'`,
      [appId, vorher.vorige_version ?? null]
    );
    const gesundheit = vorher.manifest?.backend
      ? await appContainer.bleibtGesund(appId, 'live')
      : { gesund: true };
    rueckfall.fassung = {
      erfolg: gesundheit.gesund,
      version: vorher.version,
      ...(gesundheit.gesund ? {} : { fehler: gesundheit.grund }),
    };
  } catch (fehler) {
    logger.error(`${appId}: Fassung ${vorher.version} kam nicht wieder hoch: ${fehler.message}`);
    rueckfall.fassung = { erfolg: false, version: vorher.version, fehler: fehler.message };
  }
  return rueckfall;
}

async function ablauf({ appId, durch }) {
  const staende = await appStore.staendeVon(appId);
  const test = staende.test;
  const vorher = staende.live;
  // Ohne Teststand oder ohne Server-Teil gibt es keine Strukturaenderung und
  // nichts zu sichern: dann schaltet `schalte` wie bisher (und sagt, wenn es
  // nichts zu schalten gibt).
  if (!test || !test.manifest?.backend) {
    return appStore.schalte({ appId, ziel: 'live', durch });
  }
  const name = test.manifest.name || appId;
  const neu = test.version;
  const id = await beginne({ appId, von: vorher?.version, nach: neu, durch });

  // 1. und 2.: anhalten und sichern -- nur, wenn es Live-Daten gibt.
  const datenbankDa = await appDatenbank.datenbankDa(appDatenbank.namenFuer(appId, 'live'));
  let sicherung = null;
  if (datenbankDa) {
    const angehalten = await appContainer.halteAn(appId, 'live');
    try {
      sicherung = await sicherungsdienst.sichereVorLive(appId);
    } catch (fehler) {
      sicherung = { erfolg: false, id: null, ausgabe: fehler.message };
    }
    if (!sicherung.erfolg) {
      if (angehalten) {
        await appContainer.starteWieder(appId, 'live');
      }
      const schaltung = await beende(id, {
        ergebnis: 'nicht_gesichert',
        satz: `Die Daten von ${name} ließen sich vorher nicht sichern, deshalb ist ${neu} nicht live geschaltet.`,
        hilfe:
          'Sehen Sie unter Verwaltung → System → Sicherung nach, ob die Sicherung läuft, und schalten Sie danach erneut live.',
        technik: { grund: 'Sicherung misslungen', ausgabe: kurz(sicherung.ausgabe) },
      });
      throw new LiveSchaltenError(schaltung.satz, 'LIVE_NICHT_GESICHERT', {
        hilfe: schaltung.hilfe,
        schaltung,
      });
    }
  }

  // 3. und 4.: schalten und zusehen.
  let eingespielt = null;
  let gesundheit = null;
  try {
    eingespielt = await appStore.schalte({ appId, ziel: 'live', durch });
    gesundheit = await appContainer.bleibtGesund(appId, 'live');
  } catch (fehler) {
    gesundheit = { gesund: false, grund: fehler.message, exitCode: null, neustarts: 0 };
  }

  if (gesundheit.gesund) {
    const schaltung = await beende(id, {
      ergebnis: 'live',
      sicherungId: sicherung?.id ?? null,
      satz: `${name} ist live mit Fassung ${neu}${sicherung ? '; die Daten sind vorher gesichert' : ''}.`,
      technik: { sekunden: gesundheit.sekunden ?? null },
    });
    logger.info(
      `App ${appId} live mit ${neu} (Sicherung ${sicherung?.id?.slice(0, 8) ?? 'keine'})`
    );
    return { ...eingespielt, schaltung };
  }

  // 5.: zurueck.
  logger.warn(`App ${appId}: ${neu} kam nicht hoch (${gesundheit.grund}), falle zurueck`);
  const zeilen = await appContainer.letzteZeilen(appId, 'live', 40).catch(() => '');
  const rueckfall = await fallZurueck({
    appId,
    vorher,
    sicherung,
    datenbankNeu: !datenbankDa,
    durch,
  });
  const gelungen =
    rueckfall.fassung?.erfolg && (rueckfall.daten === null || rueckfall.daten.erfolg);
  const technik = {
    grund: gesundheit.grund,
    exit_code: gesundheit.exitCode ?? null,
    neustarts: gesundheit.neustarts ?? 0,
    sicherung_id: sicherung?.id ?? null,
    letzte_zeilen: kurz(zeilen),
    rueckfall,
  };
  let satz;
  let hilfe = HILFE_ENTWICKLER;
  if (!gelungen) {
    satz = vorher
      ? `Die neue Fassung ${neu} ließ sich nicht starten, und der Weg zurück auf ${vorher.version} gelang nicht vollständig.`
      : `Die Fassung ${neu} ließ sich nicht starten, und das Aufräumen danach gelang nicht vollständig.`;
    hilfe =
      'Holen Sie die App unter Verwaltung → System → Sicherung aus dem Stand „vor dem Live-Schalten“ zurück, oder rufen Sie Ihren Partner an.';
  } else if (vorher) {
    satz = `Die neue Fassung ${neu} ließ sich nicht starten, deshalb läuft ${name} wieder mit Fassung ${vorher.version} und den Daten von vorher.`;
  } else {
    satz = `Die Fassung ${neu} ließ sich nicht starten, deshalb ist ${name} noch nicht live.`;
  }
  const schaltung = await beende(id, {
    ergebnis: gelungen ? 'zurueckgeschaltet' : 'fehlgeschlagen',
    sicherungId: sicherung?.id ?? null,
    satz,
    hilfe,
    technik,
  });
  throw new LiveSchaltenError(satz, 'LIVE_ZURUECKGESCHALTET', { hilfe, schaltung });
}

/**
 * Die Fassung aus dem Teststand live schalten -- gesichert, mit Rueckfall.
 * Gibt den eingespielten Stand samt `schaltung` zurueck; scheitert es, wirft
 * es `LiveSchaltenError` (409) mit `details.hilfe` und `details.schaltung`.
 *
 * @param {{appId: string, durch: number|string|null}} was
 */
async function schalteLive({ appId, durch }) {
  if (laufend.has(appId)) {
    throw new ConflictError(
      `${appId} wird gerade live geschaltet. Warten Sie, bis das fertig ist.`
    );
  }
  laufend.add(appId);
  try {
    return await ablauf({ appId, durch });
  } finally {
    laufend.delete(appId);
  }
}

module.exports = { schalteLive };
