/**
 * Freigabe-Anfragen aus einem Flow (Phase C7 des Umbaus vom 26.08.2026).
 *
 * Ein Flow haelt an und wartet auf einen Menschen. Er nennt dabei KEINE Person:
 * entscheiden darf jeder, dem die App freigegeben ist (`app_members`, Phase
 * C2) -- „ein Rollenmodell je Flow gibt es nicht" (Entscheidung Kolja vom
 * 27.08.2026). Der Flow beschreibt die Sache, nicht die Zustaendigkeit.
 *
 * ZWEI DINGE HEISSEN HIER „FREIGABE", und sie sind nicht dasselbe:
 *
 *   app_members   diese App ist fuer diesen Menschen freigegeben (C2)
 *   approvals     dieser Lauf haelt an, bis ein Mensch ihn freigibt (hier)
 *
 * Das eine ist die Voraussetzung fuer das andere: wer die App freigegeben hat,
 * darf ihre Freigabe-Anfragen entscheiden.
 *
 * VIER AUGEN (J35, 25.09.2026). Innerhalb dieses Kreises kann der LAUF den
 * Kreis enger ziehen, nie weiter -- gesetzt von der App beim Start, nicht vom
 * Modell und nicht vom Flow (Migration 185, `pruefeRegel` unten):
 *
 *   ohne_einreicher   wer den Lauf ausgeloest hat, entscheidet nicht
 *   entscheider       nur die Rolle `admin` ODER nur diese Konten
 *
 * Wer danach nicht im Kreis steht, sieht die Anfrage nicht und bekommt beim
 * Entscheiden 403. Die Regel steht an EINER Stelle (`KREIS`), und Liste,
 * Entscheidung und Fehlererklaerung lesen sie alle drei von dort.
 *
 * WARUM IN DER DATENBANK, im Unterschied zur Rueckfrage (`frageStore.js`)?
 * Eine Rueckfrage richtet sich an den, der gerade zusieht, und ist nach einer
 * halben Stunde gegenstandslos. Eine Freigabe ist eine AUFGABE: sie hat einen
 * Kreis von Adressaten, eine Frist, eine Entscheidung und die Frage „wer war
 * es". Nichts davon ueberlebt in einer Map, und die Antwort auf die letzte
 * Frage will man auch noch in einem halben Jahr geben koennen.
 *
 * WAS TROTZDEM IM SPEICHER LIEGT: der wartende Lauf selbst. Die Zeile in
 * `approvals` sagt, WAS entschieden wurde; der Eintrag in `wartende` unten ist
 * der Faden zurueck in den laufenden Prozess. Stirbt das Backend, stirbt der
 * Lauf mit -- wie jeder Flow-Lauf (`flowRunner.verwaisteAufraeumen`). Die
 * offenen Anfragen der toten Laeufe werden dann beim Hochfahren als
 * `verfallen` geschlossen, statt einen Mitarbeiter etwas bestaetigen zu
 * lassen, das niemand mehr weiterfuehrt.
 *
 * WARUM DAS WARTEN GEFAHRLOS IST: dieselbe Begruendung wie bei der Rueckfrage.
 * `withGpuLock` umschliesst einen einzelnen Ollama-Aufruf, nicht den ganzen
 * Lauf (`llmOllamaStream`, `toolLoop`). Ein Lauf, der zwischen zwei Schritten
 * auf eine Freigabe wartet, haelt keine GPU-Sperre -- sonst blockierte eine
 * unbeantwortete Freigabe das ganze Geraet, tagelang.
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const {
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} = require('../../utils/errors');

/**
 * Die Frist, wenn der Flow keine nennt. Aus der Konfiguration, wie beschlossen
 * ("Frist ... im Flow-Frontmatter des Werkzeugs, Vorgabe aus der
 * Konfiguration"). 1440 Minuten sind ein Tag: lange genug, dass jemand einmal
 * ins Buero kommt, kurz genug, dass ein vergessener Lauf nicht ewig steht.
 */
const VORGABE_FRIST_MINUTEN = Number(process.env.FLOW_FREIGABE_FRIST_MINUTEN || '1440');

/**
 * Die Grenzen einer Frist.
 *
 * Die untere ist bewusst klein: eine Abnahme muss den Ablauf messen koennen,
 * ohne eine Viertelstunde zu warten (0,1 Minuten sind sechs Sekunden).
 *
 * Die obere sind ZWEI WOCHEN, und die Zahl kommt nicht aus dem Gefuehl.
 * `setTimeout` in Node nimmt eine 32-Bit-Zahl von Millisekunden; alles ueber
 * 2147483647 (rund 24,8 Tage) wird nicht etwa abgewiesen, sondern auf **1 ms**
 * gekuerzt -- der Zeitgeber feuert dann SOFORT. Eine Frist von 30 Tagen haette
 * die Freigabe also in derselben Sekunde ablaufen lassen, in der sie gestellt
 * wurde, und der Lauf endete mit "nicht innerhalb der Frist erteilt". Gefunden
 * an Nodes `TimeoutOverflowWarning` im Test zur Obergrenze.
 *
 * Zwei Wochen sind mit Abstand darunter und trotzdem laenger, als eine
 * Freigabe je sinnvoll offen steht: was niemand in zwei Wochen entscheidet,
 * entscheidet auch in vier niemand.
 */
const MIN_FRIST_MINUTEN = 0.1;
const MAX_FRIST_MINUTEN = 14 * 24 * 60;

/**
 * Wer eine Anfrage `a` entscheiden darf, als SQL -- `$n` ist der Mensch.
 *
 * Vier Bedingungen, und alle muessen gelten: die App ist ihm freigegeben (C7),
 * er ist nicht der gesperrte Einreicher, er steht auf der Liste (falls es eine
 * gibt), er hat die Rolle (falls eine verlangt ist). Eine Funktion und kein
 * fester Text, weil die drei Aufrufer den Menschen an verschiedenen Stellen
 * ihrer Parameter fuehren.
 */
function kreis(n) {
  return kreisFuer(`$${n}::bigint`);
}

/** Dieselbe Regel fuer einen beliebigen SQL-Ausdruck, der einen Menschen nennt. */
function kreisFuer(wer) {
  return `(
        EXISTS (SELECT 1 FROM public.app_members m
                 WHERE m.app_id = a.app_id AND m.user_id = ${wer})
    AND NOT (a.ohne_einreicher AND a.einreicher_id IS NOT DISTINCT FROM ${wer})
    AND (a.entscheider_ids IS NULL OR ${wer} = ANY (a.entscheider_ids))
    AND (a.entscheider_rolle IS NULL
         OR EXISTS (SELECT 1 FROM public.admin_users u
                     WHERE u.id = ${wer} AND u.role = a.entscheider_rolle)))`;
}

/** Die Rolle, die als Entscheider-Kreis taugt. Mehr gibt es an diesem Geraet nicht zu verlangen. */
const ENTSCHEIDER_ROLLEN = Object.freeze(['admin']);

/**
 * Wer die Anfrage `a` JETZT entscheiden kann, als JSON-Liste von
 * Benutzernamen -- dieselbe Regel (`kreisFuer`), einmal ueber alle aktiven
 * Mitglieder der App gezogen.
 *
 * WARUM DIE NAMEN UND NICHT NUR DIE REGEL (J35, 26.09.2026): „ohne Einreicher"
 * und „alle, denen die App freigegeben ist" sind fuer den, der eingereicht hat,
 * keine Antwort auf die Frage „bei wem liegt das jetzt". Die Regel steht
 * daneben (`ohne_einreicher`, `entscheider`); die Namen sind das, was ein
 * Mensch weitersagen kann.
 */
const KREIS_NAMEN_SQL = `(
  SELECT COALESCE(jsonb_agg(k.username ORDER BY k.username), '[]'::jsonb)
    FROM public.app_members km
    JOIN public.admin_users k ON k.id = km.user_id
   WHERE km.app_id = a.app_id
     AND k.is_active = TRUE
     AND ${kreisFuer('k.id')})`;

/** Die Regel einer Anfrage `a` so, wie eine App sie liest: Rolle, Konten oder nichts. */
const ENTSCHEIDER_SQL = `CASE
    WHEN a.entscheider_rolle IS NOT NULL
      THEN jsonb_build_object('rolle', a.entscheider_rolle)
    WHEN a.entscheider_ids IS NOT NULL
      THEN jsonb_build_object('konten',
             (SELECT COALESCE(jsonb_agg(u.username ORDER BY u.username), '[]'::jsonb)
                FROM public.admin_users u WHERE u.id = ANY (a.entscheider_ids)))
  END`;

/**
 * Wo ein Mensch eine Freigabe entscheidet. Eine Stelle am Geraet und keine
 * App: entschieden wird mit einer Sitzung, nie mit dem Schluessel der App.
 */
const ENTSCHEIDUNGSORT = Object.freeze({
  wo: 'In Arasul auf der Übersicht, unter „Freigaben“',
  adresse: '/workspace',
});

/**
 * Der Kreis aus einer Mitgliederliste, in JavaScript -- fuer die Stellen, an
 * denen es noch keine Zeile in `approvals` gibt (der Start eines Laufs und
 * der Lauf, bevor er anhaelt). Die Regel ist dieselbe wie in `kreisFuer`:
 * Rolle, Liste, Einreicher.
 */
function kreisAus(
  mitglieder,
  { einreicherId = null, ohneEinreicher = false, rolle = null, ids = null }
) {
  return mitglieder.filter(
    u =>
      (rolle == null || u.role === rolle) &&
      (ids == null || ids.map(Number).includes(Number(u.id))) &&
      !(ohneEinreicher && einreicherId != null && Number(u.id) === Number(einreicherId))
  );
}

/** Namen in einem Satz: „a", „a oder b", „a, b oder c". */
function oderListe(namen) {
  if (namen.length <= 1) {
    return namen.join('');
  }
  return `${namen.slice(0, -1).join(', ')} oder ${namen[namen.length - 1]}`;
}

/**
 * Der Satz, den eine App ihrem Menschen zeigen kann, ohne selbst zu
 * formulieren. Ein Satz aus dem Geraet und nicht aus dem Kit: die Regel
 * steht hier, und wer sie aendert, aendert den Satz mit.
 */
function satzZumKreis({ kreis, einreicher, ohneEinreicher, rolle }) {
  const teile = [];
  if (kreis.length === 0) {
    teile.push('Niemand kann diese Freigabe mehr entscheiden: der Kreis ist leer.');
  } else {
    const wer = rolle === 'admin' ? `ein Administrator (${oderListe(kreis)})` : oderListe(kreis);
    teile.push(`Entscheidet: ${wer}, ${ENTSCHEIDUNGSORT.wo.replace(/^In/, 'in')}.`);
  }
  if (ohneEinreicher && einreicher) {
    teile.push(`${einreicher} hat eingereicht und entscheidet nicht mit (Vier-Augen-Prinzip).`);
  }
  return teile.join(' ');
}

/**
 * Die Regel eines Laufs pruefen und in die Form bringen, in der sie am Lauf
 * steht -- BEIM START, solange die App noch eine Antwort lesen kann.
 *
 * Alles, was hier scheitert, ist ein 400 an die App und kein toter Lauf: eine
 * Freigabe, die niemand entscheiden kann, laeuft sonst stumm in ihre Frist, und
 * der Mensch, der eingereicht hat, wartet einen Tag auf nichts.
 *
 * @param {object} was
 * @param {string} was.appId
 * @param {string|null} [was.einreicher]  Benutzername, wie die App ihn aus `X-Arasul-User` kennt
 * @param {{ohne_einreicher?: boolean, entscheider?: {rolle?: string, konten?: string[]}}|null} [was.freigabe]
 * @returns {Promise<{einreicherId: number|null, regel: object|null}>}
 */
async function pruefeRegel({ appId, einreicher = null, freigabe = null }, { datenbank = db } = {}) {
  const ohneEinreicher = freigabe?.ohne_einreicher === true;
  const entscheider = freigabe?.entscheider ?? null;

  if (!einreicher && !freigabe) {
    return { einreicherId: null, regel: null };
  }
  if (!appId) {
    throw new ValidationError(
      '`einreicher` und `freigabe` gelten fuer den Lauf einer App. Dieser Schluessel gehoert keiner.'
    );
  }

  // Wer darf die App ueberhaupt -- der Kreis, den die Regel nur enger ziehen kann.
  const { rows: mitglieder } = await datenbank.query(
    `SELECT u.id, u.username, u.role
       FROM public.app_members m
       JOIN public.admin_users u ON u.id = m.user_id
      WHERE m.app_id = $1 AND u.is_active = TRUE`,
    [appId]
  );
  const nachName = new Map(mitglieder.map(u => [u.username, u]));

  let einreicherId = null;
  if (einreicher) {
    const wer = nachName.get(einreicher);
    if (!wer) {
      throw new ValidationError(
        `Einreicher "${einreicher}": kein aktives Konto, dem die App ${appId} freigegeben ist. ` +
          'Gemeint ist der Benutzername aus der Kopfzeile X-Arasul-User.'
      );
    }
    einreicherId = Number(wer.id);
  }
  if (ohneEinreicher && einreicherId == null) {
    throw new ValidationError(
      '`freigabe.ohne_einreicher` braucht `einreicher`: wer ausgeschlossen werden soll, muss genannt sein.'
    );
  }

  let entscheiderRolle = null;
  let entscheiderIds = null;
  if (entscheider) {
    const { rolle, konten } = entscheider;
    if ((rolle == null) === (konten == null)) {
      throw new ValidationError(
        '`freigabe.entscheider` nennt ENTWEDER `rolle` ODER `konten`, genau eines von beiden.'
      );
    }
    if (rolle != null) {
      if (!ENTSCHEIDER_ROLLEN.includes(rolle)) {
        throw new ValidationError(
          `Entscheider-Rolle "${rolle}" gibt es nicht. Erlaubt: ${ENTSCHEIDER_ROLLEN.join(', ')}.`
        );
      }
      entscheiderRolle = rolle;
    } else {
      const fehlend = konten.filter(k => !nachName.has(k));
      if (fehlend.length > 0) {
        throw new ValidationError(
          `Entscheider ohne Zugang zur App ${appId}: ${fehlend.join(', ')}. ` +
            'Entscheiden kann nur, wem die App freigegeben ist.'
        );
      }
      entscheiderIds = [...new Set(konten.map(k => Number(nachName.get(k).id)))];
    }
  }
  const kandidaten = kreisAus(mitglieder, {
    einreicherId,
    ohneEinreicher,
    rolle: entscheiderRolle,
    ids: entscheiderIds,
  });
  if (kandidaten.length === 0) {
    throw new ValidationError(
      'Nach dieser Regel koennte niemand die Freigabe entscheiden: der Kreis ist leer. ' +
        'Einem weiteren Menschen die App freigeben oder die Regel lockern.'
    );
  }

  const regel =
    ohneEinreicher || entscheiderRolle || entscheiderIds
      ? {
          ohne_einreicher: ohneEinreicher,
          entscheider_rolle: entscheiderRolle,
          entscheider_ids: entscheiderIds,
        }
      : null;
  return { einreicherId, regel };
}

/** Die Zustaende einer Anfrage. `offen` ist der einzige, aus dem heraus entschieden wird. */
const ZUSTAENDE = Object.freeze(['offen', 'bestaetigt', 'abgelehnt', 'abgelaufen', 'verfallen']);

/**
 * Der Fehler, mit dem ein Lauf ENDET statt zu scheitern.
 *
 * Eine Ablehnung ist kein Fehler des Geraets, und ein Zeitablauf auch nicht --
 * beide beenden den Lauf, und beide haben einen Grund, den ein Mensch lesen
 * will. Der Status des Laufs steht zu diesem Zeitpunkt schon in der Datenbank
 * (siehe `beendeLauf`); dieser Fehler ist nur noch das Signal an die
 * Werkzeug-Schleife, dass hier Schluss ist.
 *
 * `laufBeendet` traegt die Schleife (`toolLoop.js`) nach oben durch, statt
 * daraus -- wie bei jedem anderen Werkzeugfehler -- eine Nachricht ans Modell
 * zu machen. Ein Modell, das „Freigabe abgelehnt" als Werkzeugantwort liest,
 * macht naemlich genau das Falsche: es sucht sich einen anderen Weg.
 */
class LaufBeendet extends Error {
  constructor(grund, laufStatus) {
    super(grund);
    this.name = 'LaufBeendet';
    this.laufBeendet = true;
    this.laufStatus = laufStatus;
  }
}

/**
 * Wartende Laeufe: Anfrage-Nummer -> { aufloesen, uhr, runId }.
 *
 * Der Faden zurueck in den Prozess. Wer entscheidet, schreibt die Zeile und
 * zieht dann hier -- ohne das liefe der Lauf erst weiter, wenn jemand ihn
 * abfragt, und niemand fragt ihn ab.
 */
const wartende = new Map();

/** Die Frist in Minuten, gepruefte Zahl. */
function fristMinuten(wunsch) {
  const zahl = wunsch == null || wunsch === '' ? VORGABE_FRIST_MINUTEN : Number(wunsch);
  if (!Number.isFinite(zahl) || zahl <= 0) {
    throw new ValidationError(
      `"frist_minuten": "${wunsch}" ist keine Zahl von Minuten. ` +
        `Ohne Angabe gilt die Vorgabe von ${VORGABE_FRIST_MINUTEN} Minuten.`
    );
  }
  return Math.min(Math.max(zahl, MIN_FRIST_MINUTEN), MAX_FRIST_MINUTEN);
}

/**
 * Den Lauf beenden -- mit dem Status, der zu dem passt, was gerade geschehen
 * ist.
 *
 * `abgebrochen` bei einer Ablehnung: ein Mensch hat den Lauf beendet, und
 * genau das heisst dieses Wort seit Migration 112. `abgelaufen` beim
 * Zeitablauf: niemand hat entschieden. Beides bewusst NICHT `fehler` -- wer
 * die zusammenwirft, sucht spaeter in den Protokollen nach einem Fehler, den
 * es nie gab.
 *
 * Geschrieben wird hier und nicht ueber `runStore.finishRun`, weil der Lauf im
 * Zustand `wartend` steht und der Grund aus dieser Datei kommt. `finishRun`
 * laeuft danach trotzdem noch einmal (der Runner schliesst jeden Lauf ab) und
 * greift ins Leere: seine Bedingung trifft keinen Lauf mehr, der schon
 * terminal ist. Dieselbe Idempotenz, mit der ein Abbruch ein spaetes „fertig"
 * ueberlebt.
 */
async function beendeLauf({ runId, status, grund }, { datenbank = db } = {}) {
  const { rowCount } = await datenbank.query(
    `UPDATE flow_runs
        SET status = $2, error = $3, finished_at = NOW()
      WHERE id = $1
        AND status IN ('laeuft', 'wartend')`,
    [runId, status, grund]
  );
  if (rowCount > 0) {
    logger.info(`Flow-Lauf ${runId} beendet als ${status}: ${grund}`);
  }
}

/**
 * Eine Freigabe anfordern und darauf warten.
 *
 * Der Aufruf kehrt erst zurueck, wenn entschieden ist -- oder er wirft
 * `LaufBeendet`, wenn die Entscheidung „nein" oder „zu spaet" heisst. Ein
 * Rueckgabewert waere hier die schlechtere Form: der Aufrufer (das Werkzeug)
 * muesste ihn pruefen, und wer die Pruefung vergisst, laesst den Flow nach
 * einer Ablehnung einfach weiterlaufen.
 *
 * @param {object} was
 * @param {number} was.runId
 * @param {string} was.appId       Namensraum: ohne App keine Freigabe (s. u.)
 * @param {'test'|'live'} was.stand
 * @param {string} was.flowName
 * @param {string} was.titel       Worum es geht, in einem Satz
 * @param {string} [was.zusammenhang] Was der Flow an Kontext mitgibt
 * @param {number|string} [was.frist_minuten]
 * @param {object} [deps]
 * @param {AbortSignal} [deps.signal] Abbruch des Laufs
 * @param {(evt:object)=>void} [deps.onEvent] Live-Kanal
 * @returns {Promise<{id:number, entschieden_von:number, benutzer:string}>}
 */
async function anfordern(
  { runId, appId, stand, flowName, titel, zusammenhang = null, frist_minuten: frist },
  deps = {}
) {
  const { datenbank = db, signal, onEvent } = deps;

  const text = String(titel || '').trim();
  if (!text) {
    throw new ValidationError('Eine Freigabe braucht einen Titel: worum geht es?');
  }
  if (!runId) {
    throw new ValidationError('Eine Freigabe gehoert zu einem Lauf, und hier laeuft keiner.');
  }
  // OHNE APP KEINE FREIGABE, und das ist keine technische Huerde, sondern die
  // Frage „wer duerfte das entscheiden". Der Kreis der Entscheider ist
  // `app_members`; ein Flow der Plattform hat keinen. Ihn stattdessen
  // durchlaufen zu lassen waere das Schlimmste von beidem: eine Freigabe, die
  // niemand erteilt hat, und ein Lauf, der so tut, als haette sie jemand.
  if (!appId || !stand) {
    throw new ValidationError(
      'Eine Freigabe braucht eine App: entscheiden darf, wem sie freigegeben ist. ' +
        'Dieser Flow gehoert der Plattform, nicht einer App.'
    );
  }

  const minuten = fristMinuten(frist);

  // Die Regel des Laufs (Migration 185) kommt in DERSELBEN Anweisung mit: sie
  // steht am Lauf, und die Anfrage traegt eine Abschrift, weil sie dort
  // beantwortet und spaeter nachgelesen wird. `LEFT JOIN`, damit ein Lauf ohne
  // Regel eine Anfrage ohne Regel bekommt und nicht gar keine.
  const { rows } = await datenbank.query(
    `INSERT INTO public.approvals (run_id, app_id, stand, flow_name, titel, zusammenhang, frist,
                                   einreicher_id, ohne_einreicher, entscheider_rolle,
                                   entscheider_ids)
     SELECT $1, $2, $3, $4, $5, $6, NOW() + ($7 || ' minutes')::interval,
            r.einreicher_id,
            COALESCE((r.freigabe_regel->>'ohne_einreicher')::boolean, FALSE),
            r.freigabe_regel->>'entscheider_rolle',
            (SELECT array_agg(k::bigint)
               FROM jsonb_array_elements_text(
                      CASE WHEN jsonb_typeof(r.freigabe_regel->'entscheider_ids') = 'array'
                           THEN r.freigabe_regel->'entscheider_ids' END) AS k)
       FROM (SELECT 1) AS eins
       LEFT JOIN flow_runs r ON r.id = $1
     RETURNING id, titel, frist, angefragt_am`,
    [
      runId,
      appId,
      stand,
      flowName || '',
      text.slice(0, 500),
      zusammenhang == null ? null : String(zusammenhang).slice(0, 20000),
      String(minuten),
    ]
  );
  const anfrage = rows[0];

  // Erst jetzt haelt der Lauf an. Andersherum stuende er kurz auf `wartend`,
  // ohne dass es etwas gaebe, worauf er wartet -- und bliebe so stehen, wenn
  // der INSERT scheitert.
  await datenbank.query(
    `UPDATE flow_runs SET status = 'wartend' WHERE id = $1 AND status = 'laeuft'`,
    [runId]
  );

  logger.info(
    `Freigabe ${anfrage.id} angefordert: ${appId}/${stand} "${flowName}" (Lauf ${runId}), ` +
      `Frist ${minuten} min`
  );
  melde(onEvent, {
    type: 'freigabe',
    runId: Number(runId),
    freigabe: anfrage.id,
    titel: text,
    frist: anfrage.frist,
  });

  return warteAufEntscheidung({ anfrage, runId, minuten, datenbank, signal });
}

/** Ein Live-Ereignis, das nie in den Lauf zurueckwirft. */
function melde(onEvent, evt) {
  if (typeof onEvent !== 'function') {
    return;
  }
  try {
    onEvent(evt);
  } catch (err) {
    logger.warn(`Freigabe: onEvent warf: ${err.message}`);
  }
}

/**
 * Der eigentliche Halt: ein Versprechen, das drei Dinge aufloesen koennen --
 * eine Entscheidung, der Zeitablauf, der Abbruch des Laufs.
 */
function warteAufEntscheidung({ anfrage, runId, minuten, datenbank, signal }) {
  return new Promise((erfuellen, ablehnen) => {
    const schluessel = String(anfrage.id);

    // Die Uhr steht in der Closure und NICHT nur im Eintrag der Map: bei einem
    // Lauf, der schon abgebrochen war, bevor er hier ankam, gibt es gar keinen
    // Eintrag (siehe unten, `signal.aborted`) -- und ein Zeitgeber, den
    // niemand mehr abstellt, liefe bis zu vierzehn Tage weiter.
    let uhr = null;
    const aufraeumen = () => {
      if (uhr) {
        clearTimeout(uhr);
        uhr = null;
      }
      wartende.delete(schluessel);
      if (signal) {
        signal.removeEventListener('abort', beiAbbruch);
      }
    };

    // 1. Der Zeitablauf. Er schreibt die Zeile UND beendet den Lauf; die Zeile
    //    allein waere ein Lauf, der ewig `wartend` bleibt.
    uhr = setTimeout(
      () => {
        aufraeumen();
        schliesseAb({ id: anfrage.id, status: 'abgelaufen', datenbank })
          .then(async () => {
            const grund =
              `Freigabe „${anfrage.titel}" nicht innerhalb der Frist erteilt ` +
              `(${minuten} Minuten).`;
            await beendeLauf({ runId, status: 'abgelaufen', grund }, { datenbank });
            ablehnen(new LaufBeendet(grund, 'abgelaufen'));
          })
          .catch(err => ablehnen(err));
      },
      Math.round(minuten * 60 * 1000)
    );
    uhr.unref?.();

    // 2. Der Abbruch des Laufs (ein Mensch bricht ihn ab, das Zeitlimit des
    //    Flows greift). Die Anfrage wird gegenstandslos -- offen zu lassen
    //    hiesse, jemanden etwas bestaetigen zu lassen, das nicht mehr laeuft.
    function beiAbbruch() {
      aufraeumen();
      schliesseAb({ id: anfrage.id, status: 'verfallen', datenbank })
        .catch(err => logger.warn(`Freigabe ${anfrage.id}: Abbruch nicht notiert: ${err.message}`))
        .finally(() =>
          ablehnen(
            new LaufBeendet(
              'Der Lauf wurde abgebrochen, waehrend er auf die Freigabe wartete.',
              'abgebrochen'
            )
          )
        );
    }
    if (signal) {
      if (signal.aborted) {
        // Schon vorbei, bevor es losging.
        setImmediate(beiAbbruch);
        return;
      }
      signal.addEventListener('abort', beiAbbruch, { once: true });
    }

    // 3. Die Entscheidung. `entscheide` zieht an diesem Faden.
    //
    // Die Uhr liegt HIER noch einmal, obwohl `aufraeumen` die aus der Closure
    // abstellt: `_reset` (Tests) und ein kuenftiger Aufraeumer kommen nur ueber
    // die Map an sie heran. Es ist dasselbe Objekt, zweimal abstellen schadet
    // nicht.
    wartende.set(schluessel, {
      runId: Number(runId),
      uhr,
      aufloesen: entscheidung => {
        aufraeumen();
        if (entscheidung.status === 'bestaetigt') {
          erfuellen(entscheidung);
          return;
        }
        const grund =
          `Freigabe abgelehnt von ${entscheidung.benutzer}` +
          (entscheidung.begruendung ? `: ${entscheidung.begruendung}` : '.');
        beendeLauf({ runId, status: 'abgebrochen', grund }, { datenbank })
          .catch(err =>
            logger.warn(`Freigabe ${anfrage.id}: Lauf-Ende nicht notiert: ${err.message}`)
          )
          .finally(() => ablehnen(new LaufBeendet(grund, 'abgebrochen')));
      },
    });
  });
}

/** Eine Anfrage schliessen, ohne dass ein Mensch entschieden haette. */
async function schliesseAb({ id, status, datenbank = db }) {
  await datenbank.query(
    `UPDATE public.approvals
        SET status = $2, entschieden_am = NOW()
      WHERE id = $1 AND status = 'offen'`,
    [id, status]
  );
}

/**
 * Entscheiden: bestaetigen oder ablehnen.
 *
 * DIE BERECHTIGUNG WIRD IN DER ANWEISUNG SELBST GEPRUEFT (`EXISTS` auf
 * `app_members`) und nicht davor. Zwischen einer Pruefung und einem Schreiben
 * liegt ein Fenster, in dem ein Administrator die Freigabe zuruecknehmen kann;
 * eine Anweisung, eine Zeile, kein Fenster -- dieselbe Linie wie in
 * `freigabeService.gibFrei`.
 *
 * Wer nicht darf, bekommt `Forbidden` und nicht `NotFound`: dass es die App
 * gibt, hat er ohnehin erfahren, als er die Nummer bekam, und `appZugang`
 * antwortet an derselben Stelle genauso.
 */
async function entscheide({ id, benutzerId, status, begruendung = null }, deps = {}) {
  const { datenbank = db } = deps;
  if (status !== 'bestaetigt' && status !== 'abgelehnt') {
    throw new ValidationError(`"${status}" ist keine Entscheidung ueber eine Freigabe`);
  }
  const grund = begruendung == null ? null : String(begruendung).trim().slice(0, 2000);

  const { rows } = await datenbank.query(
    `UPDATE public.approvals a
        SET status = $3,
            entschieden_von = $2,
            entschieden_am = NOW(),
            begruendung = $4
      WHERE a.id = $1
        AND a.status = 'offen'
        AND a.frist > NOW()
        AND ${kreis(2)}
      RETURNING a.id, a.run_id, a.app_id, a.stand, a.flow_name, a.titel, a.status,
                a.frist, a.entschieden_am`,
    [id, benutzerId, status, grund]
  );

  if (rows.length === 0) {
    await erklaereFehlschlag({ id, benutzerId, datenbank });
  }
  const zeile = rows[0];

  const benutzer = await nameVon(benutzerId, datenbank);
  logger.info(
    `Freigabe ${zeile.id} ${status} von ${benutzer} (${zeile.app_id}/${zeile.stand}, Lauf ${zeile.run_id})`
  );

  // Den wartenden Lauf wecken. Ist niemand da (Backend neu gestartet, ein
  // anderer Prozess), bleibt es bei der Zeile: die Entscheidung ist getroffen
  // und festgehalten, nur fortsetzen kann sie niemand mehr. Der Aufrufer sieht
  // das an `fortgesetzt`.
  const wartet = wartende.get(String(zeile.id));
  if (wartet) {
    if (status === 'bestaetigt') {
      await datenbank.query(
        `UPDATE flow_runs SET status = 'laeuft' WHERE id = $1 AND status = 'wartend'`,
        [zeile.run_id]
      );
    }
    wartet.aufloesen({ ...zeile, benutzer, begruendung: grund });
  }

  return { ...zeile, begruendung: grund, benutzer, fortgesetzt: Boolean(wartet) };
}

/**
 * Warum hat die Anweisung oben keine Zeile getroffen? Wirft immer.
 *
 * Vier Gruende, vier Meldungen. Ein einziges „geht nicht" waere hier besonders
 * teuer: der Mensch am anderen Ende hat gerade auf „Bestaetigen" gedrueckt und
 * muss wissen, ob er zu spaet war, ob ein anderer schneller war oder ob ihm
 * die App gar nicht freigegeben ist.
 */
async function erklaereFehlschlag({ id, benutzerId, datenbank }) {
  const { rows } = await datenbank.query(
    `SELECT a.status, a.app_id, a.frist < NOW() AS abgelaufen,
            EXISTS (SELECT 1 FROM public.app_members m
                     WHERE m.app_id = a.app_id AND m.user_id = $2) AS darf,
            (a.ohne_einreicher AND a.einreicher_id IS NOT DISTINCT FROM $2::bigint) AS eingereicht,
            ${kreis(2)} AS im_kreis
       FROM public.approvals a
      WHERE a.id = $1`,
    [id, benutzerId]
  );
  if (rows.length === 0) {
    throw new NotFoundError(`Keine Freigabe-Anfrage mit der Nummer ${id}`);
  }
  const a = rows[0];
  if (!a.darf) {
    throw new ForbiddenError(
      `Die App ${a.app_id} ist Ihnen nicht freigegeben. Entscheiden darf, wer sie benutzen darf.`
    );
  }
  // Vier Augen (Migration 185). `im_kreis` fehlt in Zeilen einer Datenbank ohne
  // die Spalten nicht -- die Migration laeuft vor dem Backend --, aber ein
  // `undefined` hier heisst „nicht ausgeschlossen" und nicht „verboten".
  if (a.eingereicht) {
    throw new ForbiddenError(
      'Diesen Vorgang haben Sie selbst eingereicht. Freigeben muss ein anderer Mensch (Vier-Augen-Prinzip).'
    );
  }
  if (a.im_kreis === false) {
    throw new ForbiddenError(
      'Diese Freigabe ist benannten Entscheidern vorbehalten, und Sie gehoeren nicht dazu.'
    );
  }
  if (a.status !== 'offen') {
    throw new ConflictError(`Diese Freigabe ist nicht mehr offen (${a.status})`);
  }
  if (a.abgelaufen) {
    throw new ConflictError('Die Frist dieser Freigabe ist abgelaufen');
  }
  // Kein bekannter Grund: dann ist es einer, den dieser Code noch nicht kennt.
  throw new ConflictError('Diese Freigabe liess sich nicht entscheiden');
}

async function nameVon(benutzerId, datenbank = db) {
  const { rows } = await datenbank.query('SELECT username FROM public.admin_users WHERE id = $1', [
    benutzerId,
  ]);
  return rows[0]?.username || `Benutzer ${benutzerId}`;
}

/**
 * Die offenen Freigaben der Apps, die diesem Menschen freigegeben sind.
 *
 * Der Kreis (`kreis`) IST die Berechtigung. Eine Liste, die erst alles holt
 * und dann siebt, waere zwei Stellen, an denen dieselbe Regel steht. Seit J35
 * sieht deshalb der Einreicher einer Vier-Augen-Freigabe sie hier nicht, und
 * wer nicht benannt ist, auch nicht.
 * Abgelaufene stehen nicht darin, auch wenn ihre Zeile noch `offen` sagt: der
 * Zeitgeber schreibt sie erst, wenn der Lauf sie braucht.
 */
async function listeOffeneFuer(benutzerId, { datenbank = db } = {}) {
  const { rows } = await datenbank.query(
    `SELECT a.id, a.run_id, a.app_id, ap.name AS app_name, a.stand, a.flow_name, a.titel,
            a.zusammenhang, a.frist, a.angefragt_am,
            e.username AS einreicher, a.ohne_einreicher,
            (a.entscheider_rolle IS NOT NULL OR a.entscheider_ids IS NOT NULL) AS benannt,
            ${ENTSCHEIDER_SQL} AS entscheider,
            ${KREIS_NAMEN_SQL} AS kreis
       FROM public.approvals a
       LEFT JOIN public.admin_users e ON e.id = a.einreicher_id
       LEFT JOIN public.apps ap ON ap.id = a.app_id
      WHERE a.status = 'offen'
        AND a.frist > NOW()
        AND ${kreis(1)}
      ORDER BY a.frist ASC`,
    [benutzerId]
  );
  return rows;
}

/**
 * Die offenen Freigaben, die dieser Mensch EINGEREICHT hat (J35, 26.09.2026).
 *
 * Die Gegenseite von `listeOffeneFuer`. Bei vier Augen sieht der Einreicher
 * seine Anfrage dort gerade NICHT -- und verlor sie damit aus den Augen: sein
 * Vorgang lag irgendwo, und niemand sagte ihm, bei wem. Hier steht er mit dem
 * Kreis, der jetzt entscheiden kann. Zu entscheiden gibt es an dieser Liste
 * nichts; wer auch im Kreis steht, findet dieselbe Anfrage zusaetzlich oben.
 */
async function listeEingereichtVon(benutzerId, { datenbank = db } = {}) {
  const { rows } = await datenbank.query(
    `SELECT a.id, a.run_id, a.app_id, ap.name AS app_name, a.stand, a.flow_name, a.titel,
            a.frist, a.angefragt_am, a.ohne_einreicher,
            ${ENTSCHEIDER_SQL} AS entscheider,
            ${KREIS_NAMEN_SQL} AS kreis
       FROM public.approvals a
       LEFT JOIN public.apps ap ON ap.id = a.app_id
      WHERE a.status = 'offen'
        AND a.frist > NOW()
        AND a.einreicher_id = $1::bigint
      ORDER BY a.angefragt_am ASC`,
    [benutzerId]
  );
  return rows;
}

/**
 * Wer ueber einen LAUF entscheidet, fuer die App (J35, 26.09.2026).
 *
 * `GET /flows/runs/:id` trug bis dahin nichts davon, und eine App konnte ihrem
 * Menschen nach dem Einreichen nur „wartet" sagen -- nicht, auf wen und wo.
 * Die Antwort gibt es VOR der ersten Anfrage (aus der Regel am Lauf und den
 * Mitgliedern der App) und WAEHREND einer offenen Anfrage (aus deren Zeile,
 * die eine Abschrift der Regel traegt). Nach dem Ende steht `offen: null`; wer
 * nachlesen will, wer entschieden hat, fragt `GET /freigaben?lauf=`.
 *
 * `null` fuer einen Lauf ohne App: dort gibt es keine Freigabe (`anfordern`).
 *
 * @param {{id:number, app_id:string|null, einreicher_id?:number|null, freigabe_regel?:object|null}} lauf
 */
async function freigabeZumLauf(lauf, { datenbank = db } = {}) {
  if (!lauf || !lauf.app_id) {
    return null;
  }
  const regel = lauf.freigabe_regel || {};
  const einreicherId = lauf.einreicher_id == null ? null : Number(lauf.einreicher_id);

  const { rows: offen } = await datenbank.query(
    `SELECT a.id, a.titel, a.frist, a.angefragt_am, a.ohne_einreicher, a.entscheider_rolle,
            e.username AS einreicher,
            ${ENTSCHEIDER_SQL} AS entscheider,
            ${KREIS_NAMEN_SQL} AS kreis
       FROM public.approvals a
       LEFT JOIN public.admin_users e ON e.id = a.einreicher_id
      WHERE a.run_id = $1 AND a.status = 'offen' AND a.frist > NOW()
      ORDER BY a.id DESC
      LIMIT 1`,
    [lauf.id]
  );

  if (offen.length > 0) {
    const a = offen[0];
    const kreis = a.kreis || [];
    return {
      einreicher: a.einreicher ?? null,
      ohne_einreicher: Boolean(a.ohne_einreicher),
      entscheider: a.entscheider ?? null,
      kreis,
      ...ENTSCHEIDUNGSORT,
      offen: { id: a.id, titel: a.titel, frist: a.frist, angefragt_am: a.angefragt_am },
      satz: satzZumKreis({
        kreis,
        einreicher: a.einreicher,
        ohneEinreicher: a.ohne_einreicher,
        rolle: a.entscheider_rolle,
      }),
    };
  }

  // Noch keine (oder keine offene) Anfrage: die Regel steht am Lauf.
  const { rows: mitglieder } = await datenbank.query(
    `SELECT u.id, u.username, u.role
       FROM public.app_members m
       JOIN public.admin_users u ON u.id = m.user_id
      WHERE m.app_id = $1 AND u.is_active = TRUE
      ORDER BY u.username`,
    [lauf.app_id]
  );
  const ids = Array.isArray(regel.entscheider_ids) ? regel.entscheider_ids.map(Number) : null;
  const rolle = regel.entscheider_rolle ?? null;
  const ohneEinreicher = regel.ohne_einreicher === true;
  const kreis = kreisAus(mitglieder, { einreicherId, ohneEinreicher, rolle, ids }).map(
    u => u.username
  );
  const nachId = new Map(mitglieder.map(u => [Number(u.id), u.username]));
  let einreicher = einreicherId == null ? null : (nachId.get(einreicherId) ?? null);
  if (einreicherId != null && einreicher == null) {
    // Der Einreicher hat die App inzwischen nicht mehr -- sein Name bleibt eine Auskunft.
    einreicher = await nameVon(einreicherId, datenbank);
  }
  let entscheider = null;
  if (rolle) {
    entscheider = { rolle };
  } else if (ids) {
    entscheider = {
      konten: ids
        .map(id => nachId.get(id))
        .filter(Boolean)
        .sort(),
    };
  }
  return {
    einreicher,
    ohne_einreicher: ohneEinreicher,
    entscheider,
    kreis,
    ...ENTSCHEIDUNGSORT,
    offen: null,
    satz: satzZumKreis({ kreis, einreicher, ohneEinreicher, rolle }),
  };
}

/**
 * Die Freigaben EINER App, fuer die App selbst (externe Schnittstelle).
 *
 * Der Namensraum ist Pflicht und kommt aus dem Schluessel, nicht aus der
 * Anfrage -- dieselbe Regel wie bei den Flows (C6): eine App kann die
 * Freigaben einer anderen nicht einmal benennen.
 *
 * `zusammenhang` steht seit H7 dabei. Er fehlte, obwohl die Tabelle ihn fuehrt
 * und die Oberflaeche des Geraets ihn zeigt -- und er ist der Text, AN DEM der
 * Mensch entschieden hat. Eine App, die dokumentieren will, worauf eine Zusage
 * beruht, bekam bis dahin nur den Titel und musste die Vorlage der Entscheidung
 * erraten oder weglassen. Zurueckhalten liess er sich ohnehin nicht begruenden:
 * er stammt aus IHREM eigenen Flow, sie hat ihn selbst geschrieben.
 */
async function listeFuerApp({ appId, stand, runId = null, limit = 50 }, { datenbank = db } = {}) {
  const werte = [appId, stand];
  let filter = '';
  if (runId != null) {
    werte.push(runId);
    filter = `AND a.run_id = $${werte.length}`;
  }
  werte.push(Math.min(Math.max(1, limit), 200));
  const { rows } = await datenbank.query(
    `SELECT a.id, a.run_id, a.flow_name, a.titel, a.zusammenhang, a.status, a.frist,
            a.angefragt_am, a.entschieden_am, a.begruendung, b.username AS entschieden_von,
            e.username AS einreicher, a.ohne_einreicher,
            ${ENTSCHEIDER_SQL} AS entscheider,
            CASE WHEN a.status = 'offen' THEN ${KREIS_NAMEN_SQL} END AS kreis
       FROM public.approvals a
       LEFT JOIN public.admin_users b ON b.id = a.entschieden_von
       LEFT JOIN public.admin_users e ON e.id = a.einreicher_id
      WHERE a.app_id = $1 AND a.stand = $2 ${filter}
      ORDER BY a.id DESC
      LIMIT $${werte.length}`,
    werte
  );
  return rows;
}

/**
 * Beim Hochfahren: offene Anfragen, deren Lauf niemand mehr fortsetzt.
 *
 * Laeuft NACH `flowRunner.verwaisteAufraeumen` -- das setzt die Laeufe auf
 * `fehler`, und danach ist jede noch offene Anfrage gegenstandslos. `verfallen`
 * und nicht `abgelaufen`: die Frist war es nicht, der Neustart war es. Wer die
 * zwei zusammenwirft, sucht spaeter einen Menschen, der nicht geantwortet hat,
 * und es war die Maschine.
 */
async function verwaisteSchliessen({ datenbank = db } = {}) {
  const { rowCount } = await datenbank.query(
    `UPDATE public.approvals a
        SET status = 'verfallen', entschieden_am = NOW()
      WHERE a.status = 'offen'
        AND NOT EXISTS (SELECT 1 FROM flow_runs r
                         WHERE r.id = a.run_id AND r.status IN ('laeuft', 'wartend'))`
  );
  if (rowCount > 0) {
    logger.warn(
      `Freigaben: ${rowCount} offene Anfrage(n) ohne laufenden Lauf beim Start als verfallen geschlossen`
    );
  }
  return rowCount;
}

/** Nur fuer Tests: alle wartenden Laeufe vergessen. */
function _reset() {
  for (const eintrag of wartende.values()) {
    clearTimeout(eintrag.uhr);
  }
  wartende.clear();
}

module.exports = {
  anfordern,
  pruefeRegel,
  ENTSCHEIDER_ROLLEN,
  entscheide,
  listeOffeneFuer,
  listeEingereichtVon,
  freigabeZumLauf,
  listeFuerApp,
  ENTSCHEIDUNGSORT,
  verwaisteSchliessen,
  beendeLauf,
  LaufBeendet,
  ZUSTAENDE,
  VORGABE_FRIST_MINUTEN,
  MIN_FRIST_MINUTEN,
  MAX_FRIST_MINUTEN,
  _wartende: wartende,
  _reset,
};
