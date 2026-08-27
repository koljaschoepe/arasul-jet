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

  const { rows } = await datenbank.query(
    `INSERT INTO public.approvals (run_id, app_id, stand, flow_name, titel, zusammenhang, frist)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 || ' minutes')::interval)
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
        AND EXISTS (SELECT 1 FROM public.app_members m
                     WHERE m.app_id = a.app_id AND m.user_id = $2)
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
                     WHERE m.app_id = a.app_id AND m.user_id = $2) AS darf
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
 * Der JOIN auf `app_members` IST die Berechtigung. Eine Liste, die erst alles
 * holt und dann siebt, waere zwei Stellen, an denen dieselbe Regel steht.
 * Abgelaufene stehen nicht darin, auch wenn ihre Zeile noch `offen` sagt: der
 * Zeitgeber schreibt sie erst, wenn der Lauf sie braucht.
 */
async function listeOffeneFuer(benutzerId, { datenbank = db } = {}) {
  const { rows } = await datenbank.query(
    `SELECT a.id, a.run_id, a.app_id, a.stand, a.flow_name, a.titel, a.zusammenhang,
            a.frist, a.angefragt_am
       FROM public.approvals a
       JOIN public.app_members m ON m.app_id = a.app_id AND m.user_id = $1
      WHERE a.status = 'offen'
        AND a.frist > NOW()
      ORDER BY a.frist ASC`,
    [benutzerId]
  );
  return rows;
}

/**
 * Die Freigaben EINER App, fuer die App selbst (externe Schnittstelle).
 *
 * Der Namensraum ist Pflicht und kommt aus dem Schluessel, nicht aus der
 * Anfrage -- dieselbe Regel wie bei den Flows (C6): eine App kann die
 * Freigaben einer anderen nicht einmal benennen.
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
    `SELECT a.id, a.run_id, a.flow_name, a.titel, a.status, a.frist, a.angefragt_am,
            a.entschieden_am, a.begruendung, b.username AS entschieden_von
       FROM public.approvals a
       LEFT JOIN public.admin_users b ON b.id = a.entschieden_von
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
  entscheide,
  listeOffeneFuer,
  listeFuerApp,
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
