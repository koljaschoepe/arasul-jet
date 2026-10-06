/**
 * Das Original eines erkennenden Schritts holen und als Bilder fuer das
 * Bildmodell vorbereiten (M5, 06.10.2026, Kontrakt 14).
 *
 * Bis hierher war `original` nur die Anzeige links in der Freigabe. Das Modell
 * bekam den Auftrag als Text und sonst nichts; im Fremdtest vom 06.10.2026
 * antwortete es „Fehlt Beleg". Jetzt holt das Geraet die Datei, die der Pfad
 * nennt, und gibt sie dem Modell als `images` mit.
 *
 * WO DIE DATEI LIEGT, sagt der Pfad, genau wie im Browser: er ist relativ zur
 * Adresse der App in ihrem Stand (`/apps/<id>/` oder `/apps/<id>/test/`).
 *
 *   `api/…`   das Backend der App. Gerufen wird ihr Container im Netz
 *             `arasul-apps` mit GET, im Namen des Menschen des Laufs
 *             (`X-Arasul-User`, `X-Arasul-Role`) und nur, wenn er die App in
 *             diesem Stand benutzen darf -- dieselben Fragen wie bei
 *             `route_aufrufen` und wie Traefik vor jedem Aufruf aus dem
 *             Browser. Kein Geheimnis geht mit.
 *   sonst     eine Datei des Frontends, aus dem Ordner, den Arasul selbst
 *             ausliefert, mit derselben Sperre gegen Ausbrueche.
 *
 * WAS DARAUS WIRD. PNG und JPEG gehen unveraendert ans Modell. Ein PDF rendert
 * der Document-Indexer (PyMuPDF liegt dort schon) in die ersten
 * `MAX_SEITEN` Seiten als PNG. Alles andere ist ein Grund, keine Vermutung.
 *
 * JEDES SCHEITERN IST EIN GRUND FUER EINEN MENSCHEN: `OriginalFehler` traegt
 * einen Satz, der in der Freigabe steht. Der Executor legt daraus eine
 * Freigabe an, statt das Modell ohne Bild raten zu lassen.
 */

const fs = require('fs/promises');
const http = require('http');
const path = require('path');
const axios = require('axios');
const db = require('../../database');
const services = require('../../config/services');
const logger = require('../../utils/logger');
const appZugang = require('../app/appZugang');
const { imOrdnerHalten } = require('../app/appPfad');
const { containerName } = require('../app/appContainer');
const { portVon } = require('../app/appAbschluss');
const { personDesLaufs } = require('./tools/route');
const { ValidationError, ApiError } = require('../../utils/errors');

/** Hoechstens so gross darf ein Original sein (Kontrakt 14). */
const MAX_BYTES = 10 * 1024 * 1024;
/** Von einem PDF bekommt das Modell hoechstens so viele Seiten (Kontrakt 14). */
const MAX_SEITEN = 3;
/** Wie lange das Geraet auf die App und auf das Rendern wartet. */
const TIMEOUT_MS = 30000;

/**
 * Ein Original, das sich nicht lesen laesst. `grund` ist ein kurzes Wort fuer
 * Programme (`fehlt`, `zu_gross`, `format`, `pdf`, `zugang`), `message` der
 * Satz fuer den Menschen in der Freigabe.
 */
function originalFehler(grund, satz) {
  const fehler = new ValidationError(satz);
  fehler.originalGrund = grund;
  return fehler;
}

/** Die Art einer Datei an ihren ersten Bytes, nicht am Namen. */
function artVon(puffer) {
  if (puffer.length >= 8 && puffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
    return 'png';
  }
  if (puffer.length >= 3 && puffer[0] === 0xff && puffer[1] === 0xd8 && puffer[2] === 0xff) {
    return 'jpeg';
  }
  if (puffer.subarray(0, 1024).includes('%PDF-')) {
    return 'pdf';
  }
  return null;
}

function megabyte(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

const ZU_GROSS = bytes =>
  `Das Original ist größer als ${megabyte(MAX_BYTES)}${bytes ? ` (${megabyte(bytes)})` : ''}. ` +
  'Die App verkleinert es, oder ein Mensch trägt die Felder selbst ein.';

/**
 * GET an den Container der App. Liest hoechstens `MAX_BYTES`; was darueber
 * hinausgeht, bricht ab, statt den Speicher zu fuellen.
 */
function holeVomBackend({ host, port, pfad, koepfe }, anfrage = http.request) {
  // Ein Zeichen, das `http.request` nicht in einen Pfad schreibt (ueber U+00FF),
  // laesst es werfen; der Pfad wird darum vorher kodiert.
  const weg = encodeURI(pfad);
  return new Promise((fertig, scheitert) => {
    let erledigt = false;
    const ende = (fn, wert) => {
      if (!erledigt) {
        erledigt = true;
        clearTimeout(frist);
        fn(wert);
      }
    };
    const req = anfrage(
      { host, port, path: weg, method: 'GET', timeout: TIMEOUT_MS, headers: koepfe },
      res => {
        const stuecke = [];
        let laenge = 0;
        res.on('data', c => {
          laenge += c.length;
          if (laenge > MAX_BYTES) {
            res.destroy();
            ende(scheitert, originalFehler('zu_gross', ZU_GROSS(null)));
            return;
          }
          stuecke.push(c);
        });
        res.on('end', () =>
          ende(fertig, {
            code: res.statusCode,
            typ: String(res.headers?.['content-type'] || ''),
            puffer: Buffer.concat(stuecke),
          })
        );
        // Bricht die App mitten im Koerper ab, ist das Original nicht da --
        // ein Grund fuer die Freigabe, kein Absturz des Laufs.
        res.on('error', err =>
          ende(
            scheitert,
            originalFehler(
              'fehlt',
              `Die App brach beim Senden des Originals ab (${err.code || err.message}).`
            )
          )
        );
      }
    );
    const zuLange = () =>
      originalFehler(
        'fehlt',
        `Die App hat das Original nicht innerhalb von ${TIMEOUT_MS / 1000} Sekunden geliefert.`
      );
    const frist = setTimeout(() => {
      req.destroy();
      ende(scheitert, zuLange());
    }, TIMEOUT_MS);
    req.on('timeout', () => {
      req.destroy();
      ende(scheitert, zuLange());
    });
    req.on('error', err =>
      ende(
        scheitert,
        originalFehler('fehlt', `Die App ist nicht erreichbar (${err.code || err.message}).`)
      )
    );
    req.end();
  });
}

/** Das Original aus dem Backend der App, im Namen des Menschen des Laufs. */
async function ausDemBackend({ pfad, context }, deps) {
  const { datenbank = db, zugang = appZugang.pruefe, port: portLesen = portVon, anfrage } = deps;
  const vorsatz = 'Das Original darf das Gerät nicht holen';
  let wer;
  try {
    wer = await personDesLaufs(context, datenbank, vorsatz);
    await zugang({ benutzerId: wer.id, appId: context.appId, stand: context.stand });
  } catch (err) {
    // Nur eine Abweisung ist ein Grund fuer die Freigabe. Eine Stoerung (die
    // Datenbank antwortet nicht) ist ein Fehler des Laufs und keine fehlende
    // Berechtigung.
    if (!(err instanceof ApiError) || err.statusCode >= 500) {
      throw err;
    }
    throw originalFehler(
      'zugang',
      wer ? `${vorsatz}: ${wer.username} hat keinen Zugang zur App (${err.message}).` : err.message
    );
  }
  const port = await portLesen(context.appId, context.stand);
  if (!port) {
    throw originalFehler(
      'fehlt',
      `Das Original liegt unter api/, aber die App hat im ${context.stand}-Stand kein Backend.`
    );
  }
  const antwort = await holeVomBackend(
    {
      host: containerName(context.appId, context.stand),
      port,
      pfad: `/${pfad.slice('api/'.length)}`,
      koepfe: {
        [appZugang.KOPF_BENUTZER]: appZugang.kopfWert(wer.username),
        [appZugang.KOPF_ROLLE]: appZugang.kopfWert(wer.role),
        'X-Arasul-Lauf': String(context.runId ?? ''),
        'X-Arasul-App': context.appId,
      },
    },
    anfrage
  );
  if (antwort.code === 404) {
    throw originalFehler('fehlt', `Die App kennt das Original ${pfad} nicht (404).`);
  }
  if (antwort.code < 200 || antwort.code >= 300) {
    throw originalFehler(
      'fehlt',
      `Die App antwortete auf das Original ${pfad} mit ${antwort.code}.`
    );
  }
  return { puffer: antwort.puffer, typ: antwort.typ };
}

/** Das Original aus den Dateien des Frontends, die Arasul selbst ausliefert. */
async function ausDemFrontend({ pfad, context }, deps) {
  // Erst hier geladen: `appStore` zieht die halbe App-Verwaltung nach sich, und
  // die braucht diesen Pfad nur, wenn ein Original im Frontend liegt.
  const { ausliefern = (...a) => require('../app/appStore').ausliefernAus(...a) } = deps;
  const ziel = await ausliefern(context.appId, context.stand);
  if (!ziel) {
    throw originalFehler(
      'fehlt',
      `Das Original ${pfad} wäre eine Datei des Frontends, aber die App hat im ${context.stand}-Stand keines.`
    );
  }
  try {
    imOrdnerHalten(ziel.verzeichnis, pfad, pfad);
  } catch {
    throw originalFehler('fehlt', `Das Original ${pfad} gibt es in der App nicht.`);
  }
  const datei = path.join(ziel.verzeichnis, pfad);
  let groesse;
  try {
    groesse = (await fs.stat(datei)).size;
  } catch {
    throw originalFehler('fehlt', `Das Original ${pfad} gibt es in der App nicht.`);
  }
  if (groesse > MAX_BYTES) {
    throw originalFehler('zu_gross', ZU_GROSS(groesse));
  }
  try {
    return { puffer: await fs.readFile(datei), typ: '' };
  } catch {
    // Ein Ordner statt einer Datei, keine Leserechte: fuer den Menschen dasselbe.
    throw originalFehler('fehlt', `Das Original ${pfad} lässt sich in der App nicht lesen.`);
  }
}

/** Die ersten Seiten eines PDF als PNG, gerendert vom Document-Indexer. */
async function pdfSeiten(puffer, { post = axios.post } = {}) {
  const form = new FormData();
  form.append('file', new Blob([puffer]), 'original.pdf');
  form.append('seiten', String(MAX_SEITEN));
  let antwort;
  try {
    antwort = await post(`${services.documentIndexer.url}/pdf-seiten`, form, {
      timeout: TIMEOUT_MS * 2,
      maxBodyLength: Infinity,
    });
  } catch (err) {
    const status = err.response?.status;
    // Ein gueltiges PDF ueber einer Grenze des Indexers (Pixel, Zeit,
    // Speicher) ist nicht kaputt und soll auch nicht so heissen.
    const grund = err.response?.data?.grund;
    throw originalFehler(
      'pdf',
      grund === 'zu_gross'
        ? 'Das PDF ist zu groß, um es als Bild zu lesen (zu große Bilder oder zu viel Speicher).'
        : grund === 'zu_langsam'
          ? 'Das PDF braucht zu lange, um es als Bild zu lesen.'
          : status === 400 || status === 422
            ? 'Das PDF lässt sich nicht öffnen (beschädigt oder verschlüsselt).'
            : `Das PDF ließ sich nicht in Bilder umwandeln (${status ? `HTTP ${status}` : err.code || err.message}).`
    );
  }
  const seiten = Array.isArray(antwort.data?.seiten) ? antwort.data.seiten : [];
  if (seiten.length === 0) {
    throw originalFehler('pdf', 'Das PDF hat keine Seite, die sich als Bild zeigen ließe.');
  }
  return {
    bilder: seiten.slice(0, MAX_SEITEN),
    gesamt: Number(antwort.data.gesamt) || seiten.length,
  };
}

/**
 * Das Original holen und als Bilder zurueckgeben.
 *
 * @param {{pfad: string, context: {appId:string, stand:string, runId?:number,
 *          einreicherId?:number|null, userId?:number}}} p
 * @returns {Promise<{bilder: string[], art: 'png'|'jpeg'|'pdf', seiten: number,
 *          gesamt: number, bytes: number, pfad: string}>} Bilder als Base64
 * @throws {ValidationError} mit `originalGrund` und einem Satz fuer den Menschen
 */
async function hole({ pfad, context }, deps = {}) {
  if (!context?.appId || !context?.stand) {
    throw originalFehler('fehlt', 'Nur ein Flow einer App hat ein Original.');
  }
  const geholt = pfad.startsWith('api/')
    ? await ausDemBackend({ pfad, context }, deps)
    : await ausDemFrontend({ pfad, context }, deps);
  const { puffer } = geholt;
  if (puffer.length === 0) {
    throw originalFehler('fehlt', `Das Original ${pfad} ist leer.`);
  }
  if (puffer.length > MAX_BYTES) {
    throw originalFehler('zu_gross', ZU_GROSS(puffer.length));
  }
  const art = artVon(puffer);
  if (!art) {
    const typ = geholt.typ.split(';')[0].trim();
    throw originalFehler(
      'format',
      `Das Original ${pfad} ist kein PNG, JPEG oder PDF${typ ? ` (${typ})` : ''}. ` +
        'Ein Bildmodell liest nur diese drei.'
    );
  }
  if (art === 'pdf') {
    const { bilder, gesamt } = await pdfSeiten(puffer, deps);
    logger.info(
      `Original ${pfad} (Lauf ${context.runId}): PDF, ${bilder.length} von ${gesamt} Seiten als Bild`
    );
    return { bilder, art, seiten: bilder.length, gesamt, bytes: puffer.length, pfad };
  }
  logger.info(`Original ${pfad} (Lauf ${context.runId}): ${art}, ${puffer.length} Bytes`);
  return {
    bilder: [puffer.toString('base64')],
    art,
    seiten: 1,
    gesamt: 1,
    bytes: puffer.length,
    pfad,
  };
}

/**
 * Das Modell, das die Bilder bekommt: das des Schritts, wenn es Bilder liest,
 * sonst das Bildmodell des Geraets (`bildvorgabe`, Migration 188, am Orin
 * `gemma4:e4b`). Ein Textmodell bekommt nie ein Bild: es liesse es still
 * fallen und erfaende die Felder aus dem Auftrag.
 *
 * @returns {Promise<{modell: string, gewechselt: boolean}>}
 * @throws {ValidationError} mit `originalGrund: 'kein_bildmodell'`
 */
async function modellMitBild(kandidat, deps = {}) {
  const { datenbank = db, bildmodelle = require('../llm/bildmodell').bildmodelleAmGeraet } = deps;
  if (kandidat) {
    const { rows } = await datenbank.query(
      `SELECT 1 FROM llm_model_catalog
        WHERE (id = $1 OR ollama_name = $1) AND supports_vision_input = true
        LIMIT 1`,
      [kandidat]
    );
    if (rows.length > 0) {
      return { modell: kandidat, gewechselt: false };
    }
  }
  const vorhanden = await bildmodelle();
  if (vorhanden.length === 0) {
    throw originalFehler(
      'kein_bildmodell',
      'An diesem Gerät liegt kein Modell, das Bilder liest. Ein Administrator lädt eines unter Modelle (gemma4:e4b).'
    );
  }
  logger.info(
    `Erkennender Schritt: ${kandidat || 'kein Modell'} liest keine Bilder, nimmt ${vorhanden[0]}`
  );
  return { modell: vorhanden[0], gewechselt: true };
}

/** Der Satz, der dem Modell sagt, was beiliegt. */
function hinweisFuerModell({ art, seiten, gesamt }) {
  if (art !== 'pdf') {
    return 'Das Original liegt als Bild bei. Lies die Felder aus diesem Bild, nicht aus diesem Text.';
  }
  const teil = gesamt > seiten ? ` (die ersten ${seiten} von ${gesamt} Seiten)` : '';
  return (
    `Das Original ist ein PDF und liegt als ${seiten === 1 ? 'ein Bild' : `${seiten} Bilder`} bei${teil}, ` +
    'eine Seite je Bild. Lies die Felder aus diesen Bildern, nicht aus diesem Text.'
  );
}

module.exports = {
  hole,
  modellMitBild,
  hinweisFuerModell,
  artVon,
  originalFehler,
  MAX_BYTES,
  MAX_SEITEN,
};
