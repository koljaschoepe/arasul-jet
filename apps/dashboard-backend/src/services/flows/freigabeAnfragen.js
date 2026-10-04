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
 * WER EINGEREICHT HAT, ENTSCHEIDET NIE SELBST (M5, 04.10.2026). Bis dahin nur,
 * wenn die App `ohne_einreicher` setzte; das Zielbild (frontend.md, Stufen)
 * sagt „nie", und ein Schalter, den eine App vergessen kann, ist keine Regel.
 * Kennt der Lauf seinen Einreicher, steht er ausserhalb des Kreises.
 *
 * BEI WEM SIE LIEGT (M5, Migration 195). Innerhalb des Kreises liegt eine
 * Anfrage bei EINEM Menschen (`liegt_bei`) oder bei allen (NULL): neu angelegt
 * bei der Standardperson ihrer Stufe (`app_stufen_personen`, gesetzt vom Admin
 * in der Verwaltung), ohne Standardperson bei allen. Jeder im Kreis kann sie
 * uebernehmen oder an einen anderen im Kreis weitergeben; entscheiden kann
 * nur, bei dem sie liegt. Die Liste „bei mir" zeigt genau diese Anfragen, und
 * die Zahl am Haus der Aktivitaetsleiste zaehlt dieselbe Liste.
 *
 * WARUM IN DER DATENBANK, im Unterschied zur Rueckfrage (`frageStore.js`)?
 * Eine Rueckfrage richtet sich an den, der gerade zusieht, und ist nach einer
 * halben Stunde gegenstandslos. Eine Freigabe ist eine AUFGABE: sie hat einen
 * Kreis von Adressaten, eine Frist, eine Entscheidung und die Frage „wer war
 * es". Nichts davon ueberlebt in einer Map, und die Antwort auf die letzte
 * Frage will man auch noch in einem halben Jahr geben koennen.
 *
 * WAS IM SPEICHER LIEGT, und was nicht (M5, 03.10.2026): der Faden zurueck in den
 * laufenden Prozess (`wartende`) ist nur die Abkuerzung fuer den Normalfall. Der
 * Lauf selbst steht in der Datenbank: `flow_runs.fortsetzung` sagt, an welchem
 * Schritt der deklarierten Kette er haelt, die Ausgaben der Schritte davor
 * stehen in `flow_run_steps`. Stirbt das Backend (Neustart, Update), bleibt der
 * Lauf `wartend`; `wiederaufnehmen` stellt beim Hochfahren die Zeitgeber neu und
 * setzt bereits entschiedene Laeufe fort, und `entscheide` setzt einen Lauf ohne
 * Faden ueber `flowRunner.fortsetzen` ab dem angehaltenen Schritt fort.
 *
 * Nicht fortsetzbar ist, was keinen Pruefpunkt hat: eine Freigabe aus der
 * modellgetriebenen Werkzeug-Schleife, aus einer Rolle oder aus einer
 * Wiederholung. Dort schreibt `anfordern` `fortsetzung = NULL`, und der Neustart
 * setzt den Lauf wie bisher auf `fehler` (`flowRunner.verwaisteAufraeumen`).
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
 * Die Frist, wenn weder der Schritt noch seine Stufe eine nennt. Aus der
 * Konfiguration, wie beschlossen. 10080 Minuten sind sieben Tage (M5): seit der
 * Lauf einen Neustart ueberlebt, darf eine Freigabe ueber ein Wochenende und
 * einen Urlaubstag stehen, ohne dass ein Update sie vorzeitig beendet.
 */
const VORGABE_FRIST_MINUTEN = Number(process.env.FLOW_FREIGABE_FRIST_MINUTEN || '10080');

/**
 * Die Grenzen einer Frist.
 *
 * Die untere ist bewusst klein: eine Abnahme muss den Ablauf messen koennen,
 * ohne eine Viertelstunde zu warten (0,1 Minuten sind sechs Sekunden).
 *
 * Die obere ist ein Jahr -- dieselbe Grenze, die der Flow-Kopf je Stufe zulaesst
 * (`schemas/flows.js`, `FlowStufe`). Bis M5 waren es zwei Wochen, wegen Nodes
 * `setTimeout`: es nimmt eine 32-Bit-Zahl von Millisekunden (rund 24,8 Tage) und
 * feuert bei mehr SOFORT. `fristUhr` unten zerlegt deshalb jede Frist in Stuecke
 * unterhalb dieser Grenze.
 */
const MIN_FRIST_MINUTEN = 0.1;
const MAX_FRIST_MINUTEN = 525600;

/** Das Maximum von `setTimeout` in Millisekunden. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Ein Zeitgeber fuer einen beliebig fernen Zeitpunkt.
 *
 * Wartet in Stuecken von hoechstens `MAX_TIMER_MS` und rechnet jedes Mal gegen
 * die Uhr nach, statt Stuecke zu addieren: so bleibt die Frist auch dann
 * richtig, wenn der Prozess schlief. `abstellen` haelt den naechsten Schlag an.
 *
 * @param {Date|string|number} bis
 * @param {() => void} beiAblauf
 * @returns {{abstellen: () => void}}
 */
function fristUhr(bis, beiAblauf) {
  const ziel = new Date(bis).getTime();
  let uhr = null;
  const stellen = () => {
    const rest = ziel - Date.now();
    if (rest <= 0) {
      beiAblauf();
      return;
    }
    uhr = setTimeout(stellen, Math.min(rest, MAX_TIMER_MS));
    uhr.unref?.();
  };
  stellen();
  return {
    abstellen() {
      if (uhr) {
        clearTimeout(uhr);
        uhr = null;
      }
    },
  };
}

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
  // Der Einreicher steht nie im Kreis (M5), auch ohne `ohne_einreicher`.
  return `(
        EXISTS (SELECT 1 FROM public.app_members m
                 WHERE m.app_id = a.app_id AND m.user_id = ${wer})
    AND a.einreicher_id IS DISTINCT FROM ${wer}
    AND (a.entscheider_ids IS NULL OR ${wer} = ANY (a.entscheider_ids))
    AND (a.entscheider_rolle IS NULL
         OR EXISTS (SELECT 1 FROM public.admin_users u
                     WHERE u.id = ${wer} AND u.role = a.entscheider_rolle)))`;
}

/**
 * Liegt die Anfrage `a` bei einem bestimmten Menschen -- und gilt das noch?
 *
 * `liegt_bei` zeigt auf jemanden, der stillgelegt wurde oder den Zugang zur App
 * verlor: dann liegt sie wieder bei allen im Kreis, statt bei niemandem. Die
 * Pruefung steht hier und nicht in einem Trigger, weil der Kreis an
 * `app_members` und an der Regel des Laufs haengt.
 */
const LIEGT_GILT = `(
  a.liegt_bei IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.admin_users lu
               WHERE lu.id = a.liegt_bei AND lu.is_active = TRUE)
  AND ${kreisFuer('a.liegt_bei')})`;

/** Liegt die Anfrage `a` bei dem Menschen `$n` (oder bei allen)? */
function beiIhm(n) {
  return `(NOT ${LIEGT_GILT} OR a.liegt_bei = $${n}::bigint)`;
}

/** Der Benutzername dessen, bei dem `a` liegt; NULL = bei allen im Kreis. */
const LIEGT_BEI_SQL = `CASE WHEN ${LIEGT_GILT}
    THEN (SELECT lb.username FROM public.admin_users lb WHERE lb.id = a.liegt_bei) END`;

/**
 * Die Bezeichnung der Stufe von `a` aus dem Kopf ihres Flows (`Leitung` statt
 * `leitung`), sonst NULL. Gelesen aus der registrierten Kopie des Flows.
 */
const STUFE_BEZEICHNUNG_SQL = `(
  SELECT s->>'bezeichnung'
    FROM public.app_flows f,
         jsonb_array_elements(COALESCE(f.definition->'stufen', '[]'::jsonb)) s
   WHERE f.app_id = a.app_id AND f.stand = a.stand AND f.name = a.flow_name
     AND s->>'name' = a.stufe
   LIMIT 1)`;

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
  // Seit J36 (02.10.2026) entscheidet ein Mitarbeiter in der App, in der die
  // Freigabe entsteht (Baustein `Freigabe`); die Übersicht mit der Liste aller
  // Anfragen sieht nur noch der Administrator. Der Satz sagt deshalb nur das,
  // was für jeden stimmt.
  wo: 'In der App, in der die Freigabe entstanden ist',
  adresse: '/workspace',
});

/**
 * Der Kreis aus einer Mitgliederliste, in JavaScript -- fuer die Stellen, an
 * denen es noch keine Zeile in `approvals` gibt (der Start eines Laufs und
 * der Lauf, bevor er anhaelt). Die Regel ist dieselbe wie in `kreisFuer`:
 * Rolle, Liste, Einreicher.
 */
function kreisAus(mitglieder, { einreicherId = null, rolle = null, ids = null }) {
  return mitglieder.filter(
    u =>
      (rolle == null || u.role === rolle) &&
      (ids == null || ids.map(Number).includes(Number(u.id))) &&
      // Seit M5 unabhaengig von `ohneEinreicher`: wer einreicht, entscheidet nie.
      !(einreicherId != null && Number(u.id) === Number(einreicherId))
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
function satzZumKreis({ kreis, einreicher, rolle, liegtBei = null }) {
  const teile = [];
  if (liegtBei) {
    teile.push(`Liegt bei ${liegtBei}, ${ENTSCHEIDUNGSORT.wo.replace(/^In/, 'in')}.`);
  } else if (kreis.length === 0) {
    teile.push('Niemand kann diese Freigabe mehr entscheiden: der Kreis ist leer.');
  } else {
    const wer = rolle === 'admin' ? `ein Administrator (${oderListe(kreis)})` : oderListe(kreis);
    teile.push(`Entscheidet: ${wer}, ${ENTSCHEIDUNGSORT.wo.replace(/^In/, 'in')}.`);
  }
  if (einreicher) {
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
  const entscheider = freigabe?.entscheider ?? null;

  if (!einreicher && !freigabe) {
    return { einreicherId: null, regel: null };
  }
  if (!appId) {
    throw new ValidationError(
      '`einreicher` und `freigabe` gelten für den Lauf einer App. Dieser Schlüssel gehört keiner.'
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
  if (freigabe?.ohne_einreicher === true && einreicherId == null) {
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
    rolle: entscheiderRolle,
    ids: entscheiderIds,
  });
  if (kandidaten.length === 0) {
    throw new ValidationError(
      'Nach dieser Regel könnte niemand die Freigabe entscheiden: der Kreis ist leer. ' +
        'Einem weiteren Menschen die App freigeben oder die Regel lockern.'
    );
  }

  // Wer eingereicht hat, entscheidet nie (M5): mit einem Einreicher steht
  // `ohne_einreicher` immer an der Regel, auch wenn die App es nicht sagte.
  const ohneEinreicher = einreicherId != null;
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
 *
 * Ein Eintrag, den `wiederaufnehmen` nach einem Neustart anlegt, hat KEIN
 * `aufloesen`: es gibt kein Versprechen mehr, das jemand aufloesen koennte. Er
 * traegt nur die Uhr, damit die Frist auch nach dem Neustart greift.
 */
const wartende = new Map();

/**
 * Die Frist in Minuten, gepruefte Zahl.
 *
 * Die Reihenfolge ist die, die der Flow-Kopf verspricht: was der Schritt selbst
 * nennt, gilt vor der Frist seiner Stufe, und die vor der Vorgabe des Geraets
 * (sieben Tage).
 */
function fristMinuten(wunsch, stufeFrist = null) {
  const gewaehlt = wunsch == null || wunsch === '' ? stufeFrist : wunsch;
  const zahl = gewaehlt == null || gewaehlt === '' ? VORGABE_FRIST_MINUTEN : Number(gewaehlt);
  if (!Number.isFinite(zahl) || zahl <= 0) {
    throw new ValidationError(
      `"frist_minuten": "${gewaehlt}" ist keine Zahl von Minuten. ` +
        `Ohne Angabe gilt die Vorgabe von ${VORGABE_FRIST_MINUTEN} Minuten.`
    );
  }
  return Math.min(Math.max(zahl, MIN_FRIST_MINUTEN), MAX_FRIST_MINUTEN);
}

/**
 * Die Stufe eines Schritts gegen die Stufen des Flows pruefen und ihre Frist
 * lesen. Nennt der Flow Stufen und der Schritt eine, die es nicht gibt, laege
 * die Freigabe spaeter bei niemandem (APP-PAKET.md, `stufen`).
 */
function stufeAufloesen(stufe, stufen) {
  const name = stufe == null || stufe === '' ? null : String(stufe);
  if (name == null) {
    return { name: null, frist: null };
  }
  const liste = Array.isArray(stufen) ? stufen : [];
  const treffer = liste.find(s => s.name === name);
  if (!treffer) {
    throw new ValidationError(
      `Stufe "${name}" steht nicht im Kopf des Flows (` +
        (liste.length > 0 ? `bekannt: ${liste.map(s => s.name).join(', ')}` : 'er nennt keine') +
        ').'
    );
  }
  return { name, frist: treffer.frist_minuten ?? null };
}

/**
 * Der Text, den der Schritt „Freigabe anfordern" als Ausgabe traegt, wenn
 * bestaetigt wurde -- mit den Feldern, die der Mensch dabei geaendert hat (M5),
 * damit das Protokoll des Laufs beides nennt: Vorschlag und Aenderung.
 */
function erteiltText(benutzer, wann, korrekturen = null) {
  const satz = `Freigabe erteilt von ${benutzer} am ${new Date(wann).toISOString()}.`;
  if (!Array.isArray(korrekturen) || korrekturen.length === 0) {
    return satz;
  }
  const zeilen = korrekturen.map(
    k => `${k.feld}: „${k.vorschlag ?? ''}" (Vorschlag) → „${k.wert ?? ''}" (${k.von ?? benutzer})`
  );
  return `${satz}\nGeändert:\n${zeilen.join('\n')}`;
}

/**
 * Die erkannten Felder einer Freigabe in der Form, in der sie an der Anfrage
 * stehen (Migration 197): je Feld der Vorschlag der KI und ob es fehlt, ob es
 * unsicher ist und ob ein Mensch es aendern darf. Unsichere und fehlende zuerst,
 * damit „pruefen" oben steht -- in der Liste und in jeder Ansicht, die sie zeigt.
 *
 * @param {{felder:Object<string,string>, fehlend?:string[], unsicher?:string[], aenderbar?:string[]}} e
 * @returns {{name:string, vorschlag:string, fehlend:boolean, unsicher:boolean, aenderbar:boolean}[]}
 */
function felderDerErkennung({ felder = {}, fehlend = [], unsicher = [], aenderbar = [] }) {
  const liste = Object.keys(felder).map(name => ({
    name,
    vorschlag: String(felder[name] ?? ''),
    fehlend: fehlend.includes(name),
    unsicher: unsicher.includes(name),
    aenderbar: aenderbar.includes(name),
  }));
  const pruefen = f => (f.fehlend || f.unsicher ? 0 : 1);
  return liste
    .map((f, i) => ({ f, i }))
    .sort((a, b) => pruefen(a.f) - pruefen(b.f) || a.i - b.i)
    .map(({ f }) => f);
}

/**
 * Was ein Mensch beim Bestaetigen an Feldern geschickt hat, gegen die Anfrage
 * geprueft: nur Felder, die sie fuehrt UND die aenderbar sind. Ein Wert, der dem
 * Vorschlag gleicht, ist keine Aenderung und wird nicht gespeichert.
 *
 * @returns {{korrekturen:{feld:string, vorschlag:string, wert:string}[], abgewiesen:string[]}}
 */
function pruefeKorrekturen(felderDerAnfrage, geschickt) {
  const nachName = new Map((felderDerAnfrage || []).map(f => [f.name, f]));
  const korrekturen = [];
  const abgewiesen = [];
  for (const [feld, wert] of Object.entries(geschickt || {})) {
    const f = nachName.get(feld);
    if (!f || f.aenderbar !== true) {
      abgewiesen.push(feld);
      continue;
    }
    if (String(wert) !== String(f.vorschlag ?? '')) {
      korrekturen.push({ feld, vorschlag: String(f.vorschlag ?? ''), wert: String(wert) });
    }
  }
  return { korrekturen, abgewiesen };
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
 * @param {number|string} [was.frist_minuten]  gilt vor der Frist der Stufe
 * @param {string} [was.stufe]                 benannte Stufe aus dem Flow-Kopf
 * @param {object[]} [was.stufen]              die Stufen des Flows (`flow.stufen`)
 * @param {{schritt:number, name:string, schritt_id:number}|null} [was.fortsetzung]
 *   Wo der Lauf nach einem Neustart weitergeht; `null` = nicht fortsetzbar.
 * @param {{felder:object[], schritt:string, original?:string|null}|null} [was.erkennung]
 *   Die erkannten Felder eines erkennenden Schritts (M5, Migration 197), gesetzt
 *   vom Executor und nie vom Modell: was die KI vorschlug, was unsicher ist und
 *   was ein Mensch aendern darf. Dazu das Original, relativ zur App.
 * @param {object} [deps]
 * @param {AbortSignal} [deps.signal] Abbruch des Laufs
 * @param {(evt:object)=>void} [deps.onEvent] Live-Kanal
 * @returns {Promise<{id:number, entschieden_von:number, benutzer:string}>}
 */
async function anfordern(
  {
    runId,
    appId,
    stand,
    flowName,
    titel,
    zusammenhang = null,
    frist_minuten: frist,
    stufe = null,
    stufen = null,
    fortsetzung = null,
    erkennung = null,
  },
  deps = {}
) {
  const { datenbank = db, signal, onEvent } = deps;

  const text = String(titel || '').trim();
  if (!text) {
    throw new ValidationError('Eine Freigabe braucht einen Titel: worum geht es?');
  }
  if (!runId) {
    throw new ValidationError('Eine Freigabe gehört zu einem Lauf, und hier läuft keiner.');
  }
  // OHNE APP KEINE FREIGABE, und das ist keine technische Huerde, sondern die
  // Frage „wer duerfte das entscheiden". Der Kreis der Entscheider ist
  // `app_members`; ein Flow der Plattform hat keinen. Ihn stattdessen
  // durchlaufen zu lassen waere das Schlimmste von beidem: eine Freigabe, die
  // niemand erteilt hat, und ein Lauf, der so tut, als haette sie jemand.
  if (!appId || !stand) {
    throw new ValidationError(
      'Eine Freigabe braucht eine App: entscheiden darf, wem sie freigegeben ist. ' +
        'Dieser Flow gehört der Plattform, nicht einer App.'
    );
  }

  const gewaehlt = stufeAufloesen(stufe, stufen);
  const minuten = fristMinuten(frist, gewaehlt.frist);

  // Die Regel des Laufs (Migration 185) kommt in DERSELBEN Anweisung mit: sie
  // steht am Lauf, und die Anfrage traegt eine Abschrift, weil sie dort
  // beantwortet und spaeter nachgelesen wird. `LEFT JOIN`, damit ein Lauf ohne
  // Regel eine Anfrage ohne Regel bekommt und nicht gar keine.
  const { rows } = await datenbank.query(
    `INSERT INTO public.approvals (run_id, app_id, stand, flow_name, titel, zusammenhang, frist,
                                   stufe, felder, felder_schritt, original,
                                   einreicher_id, ohne_einreicher, entscheider_rolle,
                                   entscheider_ids)
     SELECT $1, $2, $3, $4, $5, $6, NOW() + ($7 || ' minutes')::interval, $8,
            $9::jsonb, $10, $11,
            r.einreicher_id,
            COALESCE((r.freigabe_regel->>'ohne_einreicher')::boolean, FALSE)
              OR r.einreicher_id IS NOT NULL,
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
      gewaehlt.name,
      erkennung?.felder ? JSON.stringify(erkennung.felder) : null,
      erkennung?.felder ? erkennung.schritt || null : null,
      erkennung?.original || null,
    ]
  );
  const anfrage = rows[0];
  // Scheitert das Zuteilen, bleibt die Anfrage gueltig und liegt bei allen im
  // Kreis -- lieber das als ein Lauf, der nie anhaelt, und eine verwaiste Zeile.
  anfrage.liegt_bei = await zurStandardperson({ id: anfrage.id, datenbank }).catch(err => {
    logger.warn(`Freigabe ${anfrage.id}: Standardperson nicht zugeteilt: ${err.message}`);
    return null;
  });

  // Erst jetzt haelt der Lauf an. Andersherum stuende er kurz auf `wartend`,
  // ohne dass es etwas gaebe, worauf er wartet -- und bliebe so stehen, wenn
  // der INSERT scheitert.
  //
  // Mit dem Pruefpunkt in DERSELBEN Anweisung: ein Lauf, der `wartend` ist, aber
  // nicht weiss, wo er weitergeht, waere nach einem Neustart nicht fortsetzbar
  // und stuende doch nicht als solcher da.
  await datenbank.query(
    `UPDATE flow_runs SET status = 'wartend', fortsetzung = $2::jsonb
      WHERE id = $1 AND status = 'laeuft'`,
    [runId, fortsetzung ? JSON.stringify(fortsetzung) : null]
  );

  logger.info(
    `Freigabe ${anfrage.id} angefordert: ${appId}/${stand} "${flowName}" (Lauf ${runId}), ` +
      `Frist ${minuten} min, liegt bei ${anfrage.liegt_bei || 'allen mit Zugang'}`
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

/**
 * Eine neue Anfrage zur Standardperson ihrer Stufe legen (M5, Migration 195).
 *
 * Nur, wenn diese Person die Anfrage auch entscheiden darf: aktiv, im Kreis
 * (Zugang zur App, Regel des Laufs) und nicht der Einreicher. Sonst bleibt
 * `liegt_bei` NULL, und die Anfrage liegt bei allen im Kreis -- lieber bei
 * allen als bei niemandem. Eine Anfrage ohne Stufe hat keine Standardperson.
 *
 * @returns {Promise<string|null>} der Benutzername, bei dem sie liegt
 */
async function zurStandardperson({ id, datenbank = db }) {
  const { rows } = await datenbank.query(
    `UPDATE public.approvals a
        SET liegt_bei = sp.user_id, liegt_seit = NOW()
       FROM public.app_stufen_personen sp
       JOIN public.admin_users su ON su.id = sp.user_id AND su.is_active = TRUE
      WHERE a.id = $1
        AND sp.app_id = a.app_id
        AND sp.stufe = a.stufe
        AND ${kreisFuer('sp.user_id')}
      RETURNING su.username`,
    [id]
  );
  return rows[0]?.username ?? null;
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
    // niemand mehr abstellt, liefe bis zu einem Jahr weiter.
    let uhr = null;
    const aufraeumen = () => {
      if (uhr) {
        uhr.abstellen();
        uhr = null;
      }
      wartende.delete(schluessel);
      if (signal) {
        signal.removeEventListener('abort', beiAbbruch);
      }
    };

    // 1. Der Zeitablauf. Er schreibt die Zeile UND beendet den Lauf; die Zeile
    //    allein waere ein Lauf, der ewig `wartend` bleibt.
    uhr = fristUhr(anfrage.frist, () => {
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
    });

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
async function entscheide(
  { id, benutzerId, status, begruendung = null, felder = null },
  deps = {}
) {
  const { datenbank = db } = deps;
  if (status !== 'bestaetigt' && status !== 'abgelehnt') {
    throw new ValidationError(`"${status}" ist keine Entscheidung über eine Freigabe`);
  }
  const grund = begruendung == null ? null : String(begruendung).trim().slice(0, 2000);

  // Korrigierte Felder (M5): nur beim Bestaetigen, und nur, was die App als
  // aenderbar erklaert hat. Die Felder der Anfrage aendern sich nach dem Anlegen
  // nie, deshalb darf die Pruefung vor der schreibenden Anweisung stehen.
  let korrekturen = [];
  if (felder && Object.keys(felder).length > 0) {
    if (status !== 'bestaetigt') {
      throw new ValidationError('Felder ändert, wer bestätigt. Eine Ablehnung trägt keine.');
    }
    const { rows: vorlage } = await datenbank.query(
      'SELECT a.felder FROM public.approvals a WHERE a.id = $1',
      [id]
    );
    if (vorlage.length === 0) {
      throw new NotFoundError(`Keine Freigabe-Anfrage mit der Nummer ${id}`);
    }
    const geprueft = pruefeKorrekturen(vorlage[0].felder, felder);
    if (geprueft.abgewiesen.length > 0) {
      // Erst, ob er ueberhaupt entscheiden darf: wer das nicht darf, erfaehrt
      // auch nicht, welche Felder die Anfrage fuehrt.
      await pruefeEntscheidbar({ id, benutzerId, datenbank });
      const namen = geprueft.abgewiesen.map(f => `"${f}"`).join(', ');
      throw new ValidationError(
        `${geprueft.abgewiesen.length === 1 ? 'Das Feld' : 'Die Felder'} ${namen} ` +
          `${geprueft.abgewiesen.length === 1 ? 'ist' : 'sind'} in dieser Freigabe nicht änderbar. ` +
          'Ändern lässt sich nur, was die App dafür freigibt.'
      );
    }
    korrekturen = geprueft.korrekturen;
  }

  // Die Korrekturen stehen in DERSELBEN Anweisung wie die Entscheidung, mit
  // wer und wann aus der Zeile selbst: es gibt keinen Augenblick, in dem die
  // Freigabe bestaetigt ist und ihre Aenderung noch fehlt.
  const { rows } = await datenbank.query(
    `UPDATE public.approvals a
        SET status = $3,
            entschieden_von = $2,
            entschieden_am = NOW(),
            begruendung = $4,
            korrekturen = CASE WHEN jsonb_array_length($5::jsonb) = 0 THEN NULL ELSE (
              SELECT jsonb_agg(k || jsonb_build_object(
                       'von', (SELECT u.username FROM public.admin_users u WHERE u.id = $2::bigint),
                       'von_id', $2::bigint,
                       'am', NOW()))
                FROM jsonb_array_elements($5::jsonb) k) END
      WHERE a.id = $1
        AND a.status = 'offen'
        AND a.frist > NOW()
        AND ${kreis(2)}
        AND ${beiIhm(2)}
      RETURNING a.id, a.run_id, a.app_id, a.stand, a.flow_name, a.titel, a.status,
                a.frist, a.entschieden_am, a.korrekturen`,
    [id, benutzerId, status, grund, JSON.stringify(korrekturen)]
  );

  if (rows.length === 0) {
    await erklaereFehlschlag({ id, benutzerId, datenbank });
  }
  const zeile = rows[0];

  const benutzer = await nameVon(benutzerId, datenbank);
  logger.info(
    `Freigabe ${zeile.id} ${status} von ${benutzer} (${zeile.app_id}/${zeile.stand}, Lauf ${zeile.run_id})`
  );

  // Den wartenden Lauf wecken. Gibt es den Faden im Speicher, zieht die
  // Entscheidung daran. Gibt es ihn nicht (das Backend wurde seither neu
  // gestartet, M5), steht der Lauf trotzdem noch `wartend` in der Datenbank, und
  // dann setzt `fortsetzen` ihn ab dem angehaltenen Schritt neu auf -- oder, bei
  // einer Ablehnung, beendet ihn. Nur ein Lauf ohne Pruefpunkt bleibt ohne
  // Fortsetzung; der Aufrufer sieht das an `fortgesetzt`.
  //
  // Ein Eintrag OHNE `aufloesen` ist kein Faden, sondern nur die Uhr, die
  // `wiederaufnehmen` nach dem Neustart gestellt hat (an der Orin-Abnahme am
  // 03.10.2026 gefunden: `wartet.aufloesen is not a function`, HTTP 500).
  const eintrag = wartende.get(String(zeile.id));
  const wartet = eintrag && typeof eintrag.aufloesen === 'function' ? eintrag : null;
  let fortgesetzt = Boolean(wartet);
  if (wartet) {
    if (status === 'bestaetigt') {
      await datenbank.query(
        `UPDATE flow_runs SET status = 'laeuft' WHERE id = $1 AND status = 'wartend'`,
        [zeile.run_id]
      );
    }
    wartet.aufloesen({ ...zeile, benutzer, begruendung: grund });
  } else {
    fortgesetzt = await ohneFaden({ zeile, benutzer, grund, datenbank });
  }

  return { ...zeile, begruendung: grund, benutzer, fortgesetzt };
}

/**
 * Eine Entscheidung ueber einen Lauf, dessen Faden nicht mehr im Speicher liegt.
 *
 * @returns {Promise<boolean>} Ob der Lauf dadurch weitergeht (oder, bei einer
 *   Ablehnung, ordentlich endet).
 */
async function ohneFaden({ zeile, benutzer, grund, datenbank }) {
  const { rows } = await datenbank.query(
    `SELECT fortsetzung IS NOT NULL AS fortsetzbar
       FROM flow_runs WHERE id = $1 AND status = 'wartend'`,
    [zeile.run_id]
  );
  if (rows.length === 0 || !rows[0].fortsetzbar) {
    return false;
  }
  // Eine Uhr, die `wiederaufnehmen` nach dem Neustart gestellt hat, hat jetzt
  // nichts mehr zu tun.
  const uhr = wartende.get(String(zeile.id));
  if (uhr) {
    uhr.uhr?.abstellen();
    wartende.delete(String(zeile.id));
  }
  if (zeile.status === 'bestaetigt') {
    // Lazy: `flowRunner` haengt ueber `runFlow` an den Werkzeugen und damit an
    // dieser Datei.
    const flowRunner = require('./flowRunner');
    await flowRunner.fortsetzen({ runId: zeile.run_id });
    return true;
  }
  const text = `Freigabe abgelehnt von ${benutzer}` + (grund ? `: ${grund}` : '.');
  await beendeLauf({ runId: zeile.run_id, status: 'abgebrochen', grund: text }, { datenbank });
  await schliesseOffeneSchritte({ runId: zeile.run_id, text, datenbank });
  return true;
}

/** Die offenen Protokoll-Schritte eines beendeten Laufs schliessen -- wie `runFlow` es im Prozess taete. */
async function schliesseOffeneSchritte({ runId, text, datenbank = db }) {
  await datenbank.query(
    `UPDATE flow_run_steps
        SET status = 'abgebrochen', output = $2, finished_at = NOW()
      WHERE run_id = $1 AND status = 'laeuft'`,
    [runId, text]
  );
}

/**
 * Warum hat die Anweisung oben keine Zeile getroffen? Wirft immer.
 *
 * Vier Gruende, vier Meldungen. Ein einziges „geht nicht" waere hier besonders
 * teuer: der Mensch am anderen Ende hat gerade auf „Bestaetigen" gedrueckt und
 * muss wissen, ob er zu spaet war, ob ein anderer schneller war oder ob ihm
 * die App gar nicht freigegeben ist.
 */
async function erklaereFehlschlag({ id, benutzerId, datenbank, liegtEgal = false }) {
  const { rows } = await datenbank.query(
    `SELECT a.status, a.app_id, a.frist < NOW() AS abgelaufen,
            EXISTS (SELECT 1 FROM public.app_members m
                     WHERE m.app_id = a.app_id AND m.user_id = $2) AS darf,
            (a.einreicher_id IS NOT DISTINCT FROM $2::bigint) AS eingereicht,
            ${kreis(2)} AS im_kreis,
            ${beiIhm(2)} AS bei_ihm,
            ${LIEGT_BEI_SQL} AS liegt_bei
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
      'Diese Freigabe ist benannten Entscheidern vorbehalten, und Sie gehören nicht dazu.'
    );
  }
  if (a.status !== 'offen') {
    throw new ConflictError(`Diese Freigabe ist nicht mehr offen (${a.status})`);
  }
  if (a.abgelaufen) {
    throw new ConflictError('Die Frist dieser Freigabe ist abgelaufen');
  }
  // Bei wem sie liegt (M5): kein Verbot, sondern ein Schritt davor. Wer im
  // Kreis steht, kann sie uebernehmen und dann entscheiden.
  if (!liegtEgal && a.bei_ihm === false) {
    throw new ConflictError(
      `Diese Freigabe liegt bei ${a.liegt_bei}. Übernehmen Sie sie zuerst, wenn Sie entscheiden wollen.`
    );
  }
  // Kein bekannter Grund: dann ist es einer, den dieser Code noch nicht kennt.
  throw new ConflictError('Diese Freigabe ließ sich nicht entscheiden');
}

/**
 * Darf dieser Mensch die Anfrage jetzt entscheiden? Kehrt still zurueck, wenn
 * ja; sonst wirft `erklaereFehlschlag` den Grund. Dieselbe Regel wie in
 * `entscheide`, nur lesend.
 */
async function pruefeEntscheidbar({ id, benutzerId, datenbank = db }) {
  const { rows } = await datenbank.query(
    `SELECT 1 FROM public.approvals a
      WHERE a.id = $1
        AND a.status = 'offen'
        AND a.frist > NOW()
        AND ${kreis(2)}
        AND ${beiIhm(2)}`,
    [id, benutzerId]
  );
  if (rows.length === 0) {
    await erklaereFehlschlag({ id, benutzerId, datenbank });
  }
}

/**
 * Die Felder eines Schritts nach seiner Freigabe (M5): der Vorschlag der KI,
 * ueberschrieben mit dem, was der Mensch beim Bestaetigen geaendert hat. Damit
 * arbeitet der weitere Lauf -- im Prozess gleich nach der Entscheidung und nach
 * einem Neustart aus derselben Zeile (`runFlow`, Wiederaufnahme).
 *
 * @param {{runId:number, schritt:string}} was
 * @returns {Promise<{felder:Object<string,string>, korrekturen:object[]}|null>}
 *   null, wenn es zu diesem Schritt keine bestaetigte Freigabe mit Feldern gibt
 */
async function felderNachFreigabe({ runId, schritt }, { datenbank = db } = {}) {
  const { rows } = await datenbank.query(
    `SELECT a.felder, a.korrekturen
       FROM public.approvals a
      WHERE a.run_id = $1 AND a.felder_schritt = $2
        AND a.status = 'bestaetigt' AND a.felder IS NOT NULL
      ORDER BY a.id DESC
      LIMIT 1`,
    [runId, schritt]
  );
  if (rows.length === 0) {
    return null;
  }
  const felder = {};
  for (const f of rows[0].felder || []) {
    felder[f.name] = String(f.vorschlag ?? '');
  }
  const korrekturen = Array.isArray(rows[0].korrekturen) ? rows[0].korrekturen : [];
  for (const k of korrekturen) {
    if (Object.prototype.hasOwnProperty.call(felder, k.feld)) {
      felder[k.feld] = String(k.wert ?? '');
    }
  }
  return { felder, korrekturen };
}

async function nameVon(benutzerId, datenbank = db) {
  const { rows } = await datenbank.query('SELECT username FROM public.admin_users WHERE id = $1', [
    benutzerId,
  ]);
  return rows[0]?.username || `Benutzer ${benutzerId}`;
}

/**
 * Das Original einer Anfrage als Adresse gleicher Herkunft (M5): der Pfad, den
 * der Flow relativ zur App nennt, unter der Adresse ihres Standes. Ein Browser
 * mit Sitzung laedt es dort durch die Forward-Auth der App -- wer die App nicht
 * benutzen darf, bekommt es auch nicht.
 */
const ORIGINAL_URL_SQL = `CASE WHEN a.original IS NOT NULL
    THEN '/apps/' || a.app_id || CASE WHEN a.stand = 'test' THEN '/test/' ELSE '/' END || a.original
  END`;

/**
 * Was bisher geschah (M5): die frueheren Freigaben desselben Laufs, aelteste
 * zuerst, mit Titel, Stufe, Entscheidung, wer und wann. Daraus baut die
 * Ansicht den Satz oben und die aufklappbaren Stufen.
 */
const FRUEHERE_SQL = `(
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', v.id, 'titel', v.titel,
           -- Die Stufe in Worten ("Pruefung"), wie der Kopf des Flows sie nennt.
           'stufe', COALESCE((
             SELECT s->>'bezeichnung'
               FROM public.app_flows f,
                    jsonb_array_elements(COALESCE(f.definition->'stufen', '[]'::jsonb)) s
              WHERE f.app_id = v.app_id AND f.stand = v.stand AND f.name = v.flow_name
                AND s->>'name' = v.stufe
              LIMIT 1), v.stufe),
           'status', v.status,
           'entschieden_von', vu.username, 'entschieden_am', v.entschieden_am,
           'begruendung', v.begruendung, 'korrekturen', v.korrekturen)
           ORDER BY v.id), '[]'::jsonb)
    FROM public.approvals v
    LEFT JOIN public.admin_users vu ON vu.id = v.entschieden_von
   WHERE v.run_id = a.run_id AND v.id < a.id)`;

/** Die Spalten einer offenen Anfrage, wie die beiden Listen der Startseite sie zeigen. */
const OFFEN_SPALTEN = `a.id, a.run_id, a.app_id, ap.name AS app_name, a.stand, a.flow_name, a.titel,
            a.zusammenhang, a.frist, a.angefragt_am, a.stufe,
            ${STUFE_BEZEICHNUNG_SQL} AS stufe_bezeichnung,
            e.username AS einreicher, a.ohne_einreicher,
            (a.entscheider_rolle IS NOT NULL OR a.entscheider_ids IS NOT NULL) AS benannt,
            ${ENTSCHEIDER_SQL} AS entscheider,
            ${KREIS_NAMEN_SQL} AS kreis,
            ${LIEGT_BEI_SQL} AS liegt_bei, a.liegt_seit,
            a.felder, ${ORIGINAL_URL_SQL} AS original,
            ${FRUEHERE_SQL} AS frueher`;

/**
 * Die offenen Freigaben, die BEI DIESEM MENSCHEN LIEGEN („Für Sie").
 *
 * Der Kreis (`kreis`) IST die Berechtigung. Eine Liste, die erst alles holt
 * und dann siebt, waere zwei Stellen, an denen dieselbe Regel steht. Seit J35
 * sieht deshalb der Einreicher einer Vier-Augen-Freigabe sie hier nicht, und
 * wer nicht benannt ist, auch nicht.
 *
 * Seit M5 (04.10.2026) dazu: nur, was bei ihm liegt -- bei ihm persoenlich
 * oder, ohne Standardperson, bei allen im Kreis. Was bei einem anderen liegt,
 * steht in `listeBeiAnderen`. Die Zahl am Haus zaehlt diese Liste.
 *
 * Abgelaufene stehen nicht darin, auch wenn ihre Zeile noch `offen` sagt: der
 * Zeitgeber schreibt sie erst, wenn der Lauf sie braucht.
 */
async function listeOffeneFuer(benutzerId, { datenbank = db } = {}) {
  const { rows } = await datenbank.query(
    `SELECT ${OFFEN_SPALTEN}
       FROM public.approvals a
       LEFT JOIN public.admin_users e ON e.id = a.einreicher_id
       LEFT JOIN public.apps ap ON ap.id = a.app_id
      WHERE a.status = 'offen'
        AND a.frist > NOW()
        AND ${kreis(1)}
        AND ${beiIhm(1)}
      ORDER BY a.frist ASC`,
    [benutzerId]
  );
  return rows;
}

/**
 * Die offenen Freigaben, die dieser Mensch entscheiden DUERFTE, die aber bei
 * einem anderen liegen (M5). Von hier aus uebernimmt er sie.
 */
async function listeBeiAnderen(benutzerId, { datenbank = db } = {}) {
  const { rows } = await datenbank.query(
    `SELECT ${OFFEN_SPALTEN}
       FROM public.approvals a
       LEFT JOIN public.admin_users e ON e.id = a.einreicher_id
       LEFT JOIN public.apps ap ON ap.id = a.app_id
      WHERE a.status = 'offen'
        AND a.frist > NOW()
        AND ${kreis(1)}
        AND NOT ${beiIhm(1)}
      ORDER BY a.frist ASC`,
    [benutzerId]
  );
  return rows;
}

/**
 * Eine Anfrage uebernehmen: sie liegt danach bei mir (M5).
 *
 * Jeder im Kreis darf das, ohne zu fragen -- so steht es im Zielbild, und es
 * ist der Weg, auf dem eine Freigabe nicht liegen bleibt, wenn die
 * Standardperson im Urlaub ist. Wie beim Entscheiden prueft die Anweisung
 * selbst, ob er darf; kein Fenster zwischen Pruefung und Schreiben.
 */
async function uebernehmen({ id, benutzerId }, { datenbank = db } = {}) {
  const vorher = await liegtBeiVorher(id, datenbank);
  const { rows } = await datenbank.query(
    `UPDATE public.approvals a
        SET liegt_bei = $2, liegt_seit = NOW()
      WHERE a.id = $1
        AND a.status = 'offen'
        AND a.frist > NOW()
        AND ${kreis(2)}
      RETURNING a.id, a.run_id, a.app_id, a.stand, a.titel, a.liegt_seit`,
    [id, benutzerId]
  );
  if (rows.length === 0) {
    await erklaereFehlschlag({ id, benutzerId, datenbank, liegtEgal: true });
  }
  const benutzer = await nameVon(benutzerId, datenbank);
  logger.info(`Freigabe ${id} uebernommen von ${benutzer} (lag bei ${vorher || 'allen'})`);
  return { ...rows[0], liegt_bei: benutzer, vorher };
}

/** Bei wem eine Anfrage gerade liegt (Name oder null) -- fuer das Protokoll. */
async function liegtBeiVorher(id, datenbank) {
  const { rows } = await datenbank.query(
    `SELECT ${LIEGT_BEI_SQL} AS liegt_bei FROM public.approvals a WHERE a.id = $1`,
    [id]
  );
  return rows[0]?.liegt_bei ?? null;
}

/**
 * Eine Anfrage an einen anderen Menschen im Kreis weitergeben (M5).
 *
 * Wer weitergibt, muss selbst im Kreis stehen; wer sie bekommt, auch -- also
 * aktiv, mit Zugang zur App und nicht der Einreicher. Sonst laege die Anfrage
 * bei jemandem, der sie nicht entscheiden darf, und niemand saehe sie mehr.
 *
 * @param {{id:number, benutzerId:number, an:string}} was  `an` ist ein Benutzername
 */
async function weitergeben({ id, benutzerId, an }, { datenbank = db } = {}) {
  // Erst der Aufrufer: wer die Anfrage nicht entscheiden darf, erfaehrt auch
  // nicht, welche Konten es am Geraet gibt.
  const { rows: ich } = await datenbank.query(
    `SELECT ${kreis(2)} AS im_kreis, ${LIEGT_BEI_SQL} AS liegt_bei
       FROM public.approvals a WHERE a.id = $1`,
    [id, benutzerId]
  );
  if (ich.length === 0 || !ich[0].im_kreis) {
    await erklaereFehlschlag({ id, benutzerId, datenbank, liegtEgal: true });
  }
  const vorher = ich[0].liegt_bei ?? null;
  const { rows: ziel } = await datenbank.query(
    'SELECT id, username FROM public.admin_users WHERE username = $1 AND is_active = TRUE',
    [an]
  );
  if (ziel.length === 0) {
    throw new ValidationError(`"${an}" ist kein aktives Konto an diesem Gerät.`);
  }
  const zielId = Number(ziel[0].id);
  const { rows } = await datenbank.query(
    `UPDATE public.approvals a
        SET liegt_bei = $3, liegt_seit = NOW()
      WHERE a.id = $1
        AND a.status = 'offen'
        AND a.frist > NOW()
        AND ${kreis(2)}
        AND ${kreis(3)}
      RETURNING a.id, a.run_id, a.app_id, a.stand, a.titel, a.liegt_seit`,
    [id, benutzerId, zielId]
  );
  if (rows.length === 0) {
    // Erst der, der weitergibt: darf er ueberhaupt? Dann der, der bekommt.
    await erklaereFehlschlagWeitergeben({ id, benutzerId, zielId, an, datenbank });
  }
  const benutzer = await nameVon(benutzerId, datenbank);
  logger.info(`Freigabe ${id} von ${benutzer} an ${ziel[0].username} weitergegeben`);
  return { ...rows[0], liegt_bei: ziel[0].username, vorher };
}

/** Warum das Weitergeben keine Zeile traf. Wirft immer. */
async function erklaereFehlschlagWeitergeben({ id, benutzerId, zielId, an, datenbank }) {
  const { rows } = await datenbank.query(
    `SELECT ${kreis(2)} AS ich_im_kreis,
            EXISTS (SELECT 1 FROM public.app_members m
                     WHERE m.app_id = a.app_id AND m.user_id = $3) AS ziel_darf,
            (a.einreicher_id IS NOT DISTINCT FROM $3::bigint) AS ziel_eingereicht
       FROM public.approvals a
      WHERE a.id = $1`,
    [id, benutzerId, zielId]
  );
  if (rows.length === 0 || !rows[0].ich_im_kreis) {
    await erklaereFehlschlag({ id, benutzerId, datenbank, liegtEgal: true });
  }
  const r = rows[0];
  if (!r.ziel_darf) {
    throw new ValidationError(
      `${an} hat keinen Zugang zu dieser App. Weitergeben geht nur an jemanden, der sie benutzen darf.`
    );
  }
  if (r.ziel_eingereicht) {
    throw new ValidationError(
      `${an} hat diesen Vorgang eingereicht und entscheidet nicht mit (Vier-Augen-Prinzip).`
    );
  }
  // Bleibt nur die Regel des Laufs: die App hat die Entscheider benannt.
  throw new ValidationError(
    `${an} steht nicht unter den Entscheidern, die die App für diesen Vorgang benannt hat.`
  );
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
            a.frist, a.angefragt_am, a.ohne_einreicher, a.stufe,
            ${ENTSCHEIDER_SQL} AS entscheider,
            ${KREIS_NAMEN_SQL} AS kreis,
            ${LIEGT_BEI_SQL} AS liegt_bei
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
            a.stufe, e.username AS einreicher,
            ${ENTSCHEIDER_SQL} AS entscheider,
            ${KREIS_NAMEN_SQL} AS kreis,
            ${LIEGT_BEI_SQL} AS liegt_bei
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
      liegt_bei: a.liegt_bei ?? null,
      ...ENTSCHEIDUNGSORT,
      offen: {
        id: a.id,
        titel: a.titel,
        frist: a.frist,
        angefragt_am: a.angefragt_am,
        stufe: a.stufe ?? null,
      },
      satz: satzZumKreis({
        kreis,
        einreicher: a.einreicher,
        rolle: a.entscheider_rolle,
        liegtBei: a.liegt_bei,
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
  const ohneEinreicher = regel.ohne_einreicher === true || einreicherId != null;
  const kreis = kreisAus(mitglieder, { einreicherId, rolle, ids }).map(u => u.username);
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
    liegt_bei: null,
    ...ENTSCHEIDUNGSORT,
    offen: null,
    satz: satzZumKreis({ kreis, einreicher, rolle }),
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
    `SELECT a.id, a.run_id, a.flow_name, a.titel, a.zusammenhang, a.status, a.frist, a.stufe,
            a.angefragt_am, a.entschieden_am, a.begruendung, b.username AS entschieden_von,
            a.felder, a.felder_schritt, a.korrekturen, ${ORIGINAL_URL_SQL} AS original,
            e.username AS einreicher, a.ohne_einreicher,
            ${ENTSCHEIDER_SQL} AS entscheider,
            CASE WHEN a.status = 'offen' THEN ${KREIS_NAMEN_SQL} END AS kreis,
            CASE WHEN a.status = 'offen' THEN ${LIEGT_BEI_SQL} END AS liegt_bei
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

/**
 * Beim Hochfahren: wartende Laeufe wieder an ihre Anfrage haengen (M5).
 *
 * Laeuft NACH `flowRunner.verwaisteAufraeumen`, das nur die Laeufe ohne
 * Pruefpunkt auf `fehler` gesetzt hat. Fuer jeden, der `wartend` geblieben ist:
 *
 *   offen, Frist nicht um    die Uhr neu stellen; der Faden fehlt, `entscheide`
 *                            setzt den Lauf bei der Bestaetigung neu auf
 *   offen, Frist um          die Frist ist waehrend des Stillstands verstrichen:
 *                            `abgelaufen`, wie sie es mit laufendem Prozess
 *                            geworden waere
 *   bestaetigt               die Entscheidung kam, der Prozess starb davor:
 *                            jetzt fortsetzen
 *   abgelehnt                dito: den Lauf beenden
 *
 * @returns {Promise<{uhren:number, fortgesetzt:number, beendet:number}>}
 */
async function wiederaufnehmen({ datenbank = db } = {}) {
  const { rows } = await datenbank.query(
    `SELECT a.id, a.run_id, a.titel, a.status, a.frist, a.begruendung,
            u.username AS benutzer
       FROM public.approvals a
       JOIN flow_runs r ON r.id = a.run_id
       LEFT JOIN public.admin_users u ON u.id = a.entschieden_von
      WHERE r.status = 'wartend'
        AND r.fortsetzung IS NOT NULL
        AND a.status IN ('offen', 'bestaetigt', 'abgelehnt')
      ORDER BY a.id`
  );
  const bilanz = { uhren: 0, fortgesetzt: 0, beendet: 0 };
  for (const a of rows) {
    try {
      if (a.status === 'bestaetigt') {
        await require('./flowRunner').fortsetzen({ runId: a.run_id });
        bilanz.fortgesetzt += 1;
      } else if (a.status === 'abgelehnt') {
        const text =
          `Freigabe abgelehnt von ${a.benutzer || 'einem Menschen'}` +
          (a.begruendung ? `: ${a.begruendung}` : '.');
        await beendeLauf({ runId: a.run_id, status: 'abgebrochen', grund: text }, { datenbank });
        await schliesseOffeneSchritte({ runId: a.run_id, text, datenbank });
        bilanz.beendet += 1;
      } else if (new Date(a.frist).getTime() <= Date.now()) {
        await laufeAb(a, { datenbank });
        bilanz.beendet += 1;
      } else {
        const schluessel = String(a.id);
        const uhr = fristUhr(a.frist, () => {
          wartende.delete(schluessel);
          laufeAb(a, { datenbank }).catch(err =>
            logger.warn(`Freigabe ${a.id}: Ablauf nicht notiert: ${err.message}`)
          );
        });
        wartende.set(schluessel, { runId: Number(a.run_id), uhr });
        bilanz.uhren += 1;
      }
    } catch (err) {
      logger.error(`Freigabe ${a.id} (Lauf ${a.run_id}) nicht wiederaufgenommen: ${err.message}`);
    }
  }
  if (rows.length > 0) {
    logger.info(
      `Freigaben: ${rows.length} wartende(r) Lauf/Laeufe uebernommen ` +
        `(${bilanz.uhren} Uhren, ${bilanz.fortgesetzt} fortgesetzt, ${bilanz.beendet} beendet)`
    );
  }
  return bilanz;
}

/** Die Frist einer Anfrage ohne Faden ist um: Zeile und Lauf schliessen. */
async function laufeAb(a, { datenbank = db } = {}) {
  await schliesseAb({ id: a.id, status: 'abgelaufen', datenbank });
  const grund = `Freigabe „${a.titel}" nicht innerhalb der Frist erteilt.`;
  await beendeLauf({ runId: a.run_id, status: 'abgelaufen', grund }, { datenbank });
  await schliesseOffeneSchritte({ runId: a.run_id, text: grund, datenbank });
}

/**
 * Ein Mensch bricht einen wartenden Lauf ab, dessen Faden nicht im Speicher
 * liegt (nach einem Neustart): seine offene Anfrage ist gegenstandslos. Mit
 * Faden erledigt das `warteAufEntscheidung` selbst (`beiAbbruch`).
 */
async function schliesseOffeneDesLaufs({ runId, datenbank = db }) {
  const { rows } = await datenbank.query(
    `UPDATE public.approvals
        SET status = 'verfallen', entschieden_am = NOW()
      WHERE run_id = $1 AND status = 'offen'
      RETURNING id`,
    [runId]
  );
  for (const { id } of rows) {
    const eintrag = wartende.get(String(id));
    eintrag?.uhr?.abstellen();
    wartende.delete(String(id));
  }
  return rows.length;
}

/**
 * Eine App wird entfernt (Auftrag app-entfernen-raeumt-auf): ihre laufenden und
 * wartenden Laeufe enden als `abgebrochen` mit dem Grund „App entfernt", ihre
 * offenen Freigaben als `verfallen`. Ohne das zaehlen sie weiter, und wer sie
 * ablehnen will, bekommt 403, weil `app_members` die App nicht mehr kennt.
 *
 * Zuerst die Datenbank, dann das Signal: so steht der Grund des Entfernens im
 * Lauf, nicht der des Fadens („Lauf wurde abgebrochen, waehrend er wartete").
 *
 * @returns {Promise<{laeufe:number, freigaben:number}>}
 */
async function brecheLaeufeDerAppAb(appId, { datenbank = db } = {}) {
  const grund = 'App entfernt';
  // ZUERST die Freigaben: ein wartender Lauf mit Faden schliesst seine Anfrage
  // beim Abbruch selbst, und dann stuende hier eine Null, obwohl sie offen war.
  const { rows: offene } = await datenbank.query(
    `UPDATE public.approvals
        SET status = 'verfallen', entschieden_am = NOW(), begruendung = $2
      WHERE app_id = $1 AND status = 'offen'
      RETURNING id`,
    [appId, grund]
  );
  for (const { id } of offene) {
    const eintrag = wartende.get(String(id));
    eintrag?.uhr?.abstellen();
    wartende.delete(String(id));
  }
  const { rows } = await datenbank.query(
    `SELECT id FROM flow_runs WHERE app_id = $1 AND status IN ('laeuft', 'wartend')`,
    [appId]
  );
  const flowRunner = require('./flowRunner');
  for (const { id } of rows) {
    await beendeLauf({ runId: id, status: 'abgebrochen', grund }, { datenbank });
    await schliesseOffeneSchritte({ runId: id, text: grund, datenbank });
    flowRunner.signalAbbruch(id);
  }
  return { laeufe: rows.length, freigaben: offene.length };
}

/** Nur fuer Tests: alle wartenden Laeufe vergessen. */
function _reset() {
  for (const eintrag of wartende.values()) {
    eintrag.uhr?.abstellen();
  }
  wartende.clear();
}

module.exports = {
  anfordern,
  pruefeRegel,
  ENTSCHEIDER_ROLLEN,
  entscheide,
  listeOffeneFuer,
  listeBeiAnderen,
  uebernehmen,
  weitergeben,
  listeEingereichtVon,
  freigabeZumLauf,
  listeFuerApp,
  ENTSCHEIDUNGSORT,
  verwaisteSchliessen,
  wiederaufnehmen,
  schliesseOffeneDesLaufs,
  brecheLaeufeDerAppAb,
  beendeLauf,
  erteiltText,
  felderDerErkennung,
  pruefeKorrekturen,
  felderNachFreigabe,
  fristUhr,
  LaufBeendet,
  ZUSTAENDE,
  VORGABE_FRIST_MINUTEN,
  MIN_FRIST_MINUTEN,
  MAX_FRIST_MINUTEN,
  _wartende: wartende,
  _reset,
};
