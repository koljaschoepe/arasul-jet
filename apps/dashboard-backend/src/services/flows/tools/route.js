/**
 * Das Werkzeug, mit dem ein Flow eine Route einer App ruft (M5, 04.10.2026,
 * Auftrag ereignis-und-app-routen, Kontrakt 13).
 *
 * Zielbild (`company/frontend.md`, Flows und Freigaben): „Werkzeuge wie bisher,
 * dazu die Routen der eigenen App und der Apps, die der Flow im Kit nennt,
 * geprueft gegen deren Rechte. Ins Netz nur ueber `verbindungen`, keine Shell."
 *
 * DREI PRUEFUNGEN, in dieser Reihenfolge, und jede Abweisung steht mit Grund im
 * Lauf (der Schritt endet als Fehler, `Schritt „x" fehlgeschlagen: …`):
 *
 *   1. GENANNT. Methode und Pfad muessen zu einem Eintrag unter `routen` im
 *      Kopf des Flows passen, fuer genau diese App. Das Modell kann sich keine
 *      Route ausdenken; was nicht im Kopf steht, ruft das Geraet nicht.
 *   2. ZUGANG. Gerufen wird im Namen eines Menschen: des Einreichers des Laufs,
 *      sonst des Kontos, dem der Lauf gehoert (bei einem Zeitplan oder einem
 *      Ereignis ohne Einreicher der Besitzer des Schluessels der App). Er muss
 *      die Ziel-App in diesem Stand benutzen duerfen -- dieselbe Frage, die
 *      Traefik vor jedem Aufruf aus dem Browser stellt (`appZugang.pruefe`).
 *   3. DIE APP SELBST. Die Ziel-App bekommt `X-Arasul-User` und
 *      `X-Arasul-Role` dieses Menschen, wie von Traefik, und entscheidet mit
 *      ihren eigenen Regeln. Antwortet sie nicht mit 2xx, ist der Schritt
 *      gescheitert.
 *
 * KEINE NEUE TUER. Das Geraet schickt der Ziel-App kein Geheimnis mit, weder
 * ihr `ARASUL_ABSCHLUSS_TOKEN` noch einen Schluessel: eine Route, die nur das
 * Geraet rufen darf (der Abschluss), bleibt fuer einen Flow einer anderen App
 * zu. Der Weg ist der Dienstname des Containers im Netz `arasul-apps` und
 * sonst keiner: kein Host, kein Port, keine Adresse aus den Parametern, keine
 * Weiterleitung. Ins Internet geht es weiter nur ueber `verbindungen`, und das
 * gilt fuer die App, nicht fuer den Flow.
 */

const http = require('http');
const BaseTool = require('../../../tools/baseTool');
const db = require('../../../database');
const appZugang = require('../../app/appZugang');
const { containerName } = require('../../app/appContainer');
const { portVon } = require('../../app/appAbschluss');
const {
  ValidationError,
  ForbiddenError,
  ServiceUnavailableError,
} = require('../../../utils/errors');

/** Wie lange das Geraet auf die Antwort einer App wartet. */
const TIMEOUT_MS = 30000;
/** Hoechstens so viel der Antwort geht an den Lauf weiter. */
const MAX_ANTWORT_ZEICHEN = 8000;
/** Ein Wegstueck, wie es im gerufenen Pfad stehen darf. */
const STUECK_RE = /^[A-Za-z0-9._~-]+$/;
const METHODEN = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Passt der gerufene Pfad auf den genannten (`{name}` = genau ein Wegstueck)? */
function passt(muster, pfad) {
  const soll = muster.slice(1).split('/');
  const ist = pfad.slice(1).split('/');
  return (
    soll.length === ist.length &&
    soll.every((stueck, i) => (stueck.startsWith('{') ? STUECK_RE.test(ist[i]) : stueck === ist[i]))
  );
}

/**
 * Prueft Form und Nennung. Wirft mit dem Grund, den der Lauf zeigt.
 *
 * @returns {{app: string, methode: string, pfad: string}}
 */
function genannteRoute({ app, methode, pfad }, { routen, eigeneApp }) {
  const ziel = app ? String(app).trim() : eigeneApp;
  const verb = String(methode || 'GET')
    .trim()
    .toUpperCase();
  const weg = String(pfad || '').trim();
  if (!METHODEN.includes(verb)) {
    throw new ValidationError(
      `Route abgewiesen: Methode "${verb}" gibt es nicht (${METHODEN.join(', ')})`
    );
  }
  if (
    !weg.startsWith('/') ||
    weg.length > 500 ||
    !weg
      .slice(1)
      .split('/')
      .every(t => STUECK_RE.test(t) && t !== '..' && t !== '.')
  ) {
    throw new ValidationError(
      `Route abgewiesen: "${weg}" ist kein Pfad einer App (führendes "/", Wegstücke aus Buchstaben, Ziffern und . _ ~ -, ohne Abfrage und Host)`
    );
  }
  const eintrag = (routen || []).find(
    r => (r.app || eigeneApp) === ziel && r.methode === verb && passt(r.pfad, weg)
  );
  if (!eintrag) {
    throw new ForbiddenError(
      `Route abgewiesen: ${verb} ${weg} der App ${ziel} steht nicht unter "routen" im Kopf des Flows`
    );
  }
  return { app: ziel, methode: verb, pfad: weg };
}

/** `daten` als Objekt: JSON-Text, Liste aus "name=wert" oder schon ein Objekt. */
function datenAlsObjekt(daten) {
  if (daten == null || daten === '') {
    return null;
  }
  if (Array.isArray(daten)) {
    const objekt = {};
    for (const zeile of daten) {
      const text = String(zeile);
      const gleich = text.indexOf('=');
      if (gleich < 1) {
        throw new ValidationError(`Route: "${text}" unter "daten" hat nicht die Form name=wert`);
      }
      objekt[text.slice(0, gleich).trim()] = text.slice(gleich + 1);
    }
    return objekt;
  }
  if (typeof daten === 'object') {
    return daten;
  }
  try {
    return JSON.parse(String(daten));
  } catch {
    throw new ValidationError('Route: "daten" ist kein JSON (oder als Liste name=wert angeben)');
  }
}

/**
 * Der Mensch, in dessen Namen gerufen wird. `vorsatz` steht vor jedem Grund:
 * dieselbe Frage stellt auch das Holen des Originals (`flows/original.js`).
 */
async function personDesLaufs(
  { einreicherId, userId },
  datenbank = db,
  vorsatz = 'Route abgewiesen'
) {
  const id = einreicherId ?? userId;
  if (id == null) {
    throw new ForbiddenError(`${vorsatz}: der Lauf hat weder Einreicher noch Besitzer`);
  }
  const { rows } = await datenbank.query(
    'SELECT id, username, role, is_active FROM public.admin_users WHERE id = $1',
    [id]
  );
  const wer = rows[0];
  if (!wer || !wer.is_active) {
    throw new ForbiddenError(`${vorsatz}: das Konto ${id} des Laufs ist nicht aktiv`);
  }
  return wer;
}

function kuerze(text, max) {
  return text.length > max ? `${text.slice(0, max)}\n[gekürzt, ${text.length} Zeichen]` : text;
}

/**
 * Der Aufruf selbst. Wirft bei allem ausser 2xx.
 *
 * Zwei Grenzen: `timeout` am Socket greift nur, solange NICHTS kommt; eine App,
 * die alle paar Sekunden ein Byte schickt, hielte den Lauf damit ewig fest.
 * Darum gilt dieselbe Frist auch fuer den ganzen Aufruf. Und ist die Obergrenze
 * der Antwort erreicht, endet das Lesen dort: der Rest wuerde ohnehin gekuerzt.
 */
function rufe({ host, port, methode, pfad, koerper, koepfe }, anfrage = http.request) {
  return new Promise((fertigRoh, scheitertRoh) => {
    let frist = null;
    const fertig = wert => {
      clearTimeout(frist);
      fertigRoh(wert);
    };
    const scheitert = fehler => {
      clearTimeout(frist);
      scheitertRoh(fehler);
    };
    const zuLange = () =>
      new ServiceUnavailableError(
        `Die App hat nicht innerhalb von ${Math.round(TIMEOUT_MS / 1000)} Sekunden geantwortet`
      );
    const req = anfrage(
      {
        host,
        port,
        path: pfad,
        method: methode,
        timeout: TIMEOUT_MS,
        headers: {
          ...koepfe,
          ...(koerper != null
            ? {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': Buffer.byteLength(koerper),
              }
            : {}),
        },
      },
      res => {
        const stuecke = [];
        let laenge = 0;
        res.on('data', c => {
          if (laenge >= MAX_ANTWORT_ZEICHEN * 4) {
            return;
          }
          stuecke.push(c);
          laenge += c.length;
          if (laenge >= MAX_ANTWORT_ZEICHEN * 4) {
            fertig({ code: res.statusCode, text: Buffer.concat(stuecke).toString('utf8') });
            res.destroy();
          }
        });
        res.on('end', () =>
          fertig({ code: res.statusCode, text: Buffer.concat(stuecke).toString('utf8') })
        );
        res.on('error', scheitert);
      }
    );
    req.on('timeout', () => req.destroy(zuLange()));
    req.on('error', scheitert);
    frist = setTimeout(() => {
      const fehler = zuLange();
      req.destroy(fehler);
      scheitert(fehler);
    }, TIMEOUT_MS);
    req.end(koerper ?? undefined);
  });
}

class RouteAufrufenTool extends BaseTool {
  get name() {
    return 'route_aufrufen';
  }

  get description() {
    return (
      'Ruft eine Route der eigenen App oder einer anderen App, die der Flow unter "routen" nennt. ' +
      'Nur genau diese Routen; jede andere weist das Gerät ab. Gibt die Antwort der App zurück.'
    );
  }

  get parameters() {
    return {
      type: 'object',
      properties: {
        app: {
          type: 'string',
          description: 'Die Kennung der App. Leer = die eigene App des Flows.',
        },
        methode: {
          type: 'string',
          enum: METHODEN,
          description: 'GET, POST, PUT, PATCH oder DELETE; ohne Angabe GET.',
        },
        pfad: {
          type: 'string',
          description:
            'Der Pfad der Route, wie die App ihn sieht, mit eingesetzten Werten, z. B. "/kunden/4711".',
        },
        daten: {
          type: 'object',
          description:
            'Was mitgeht: bei GET und DELETE als Abfrage, sonst als JSON-Körper. Ohne Angabe nichts.',
        },
      },
      required: ['pfad'],
    };
  }

  /**
   * @param {{app?: string, methode?: string, pfad: string, daten?: object|string|string[]}} params
   * @param {{appId?: string, stand?: string, runId?: number, slug?: string,
   *          userId?: number, einreicherId?: number|null, routen?: object[]}} context
   */
  async execute(params = {}, context = {}, deps = {}) {
    const { datenbank = db, zugang = appZugang.pruefe, port: portLesen = portVon, anfrage } = deps;
    if (!context.appId || !context.stand) {
      throw new ValidationError('Route abgewiesen: nur ein Flow einer App ruft Routen');
    }
    const route = genannteRoute(params, { routen: context.routen, eigeneApp: context.appId });
    const wer = await personDesLaufs(context, datenbank);
    try {
      await zugang({ benutzerId: wer.id, appId: route.app, stand: context.stand });
    } catch (err) {
      throw new ForbiddenError(
        `Route abgewiesen: ${wer.username} hat keinen Zugang zur App ${route.app} (${context.stand}): ${err.message}`
      );
    }
    const port = await portLesen(route.app, context.stand);
    if (!port) {
      throw new ValidationError(
        `Route abgewiesen: die App ${route.app} hat im ${context.stand}-Stand kein Backend`
      );
    }

    const daten = datenAlsObjekt(params.daten);
    const mitAbfrage = route.methode === 'GET' || route.methode === 'DELETE';
    const pfad =
      mitAbfrage && daten && Object.keys(daten).length
        ? `${route.pfad}?${new URLSearchParams(
            Object.entries(daten).map(([k, v]) => [
              k,
              typeof v === 'string' ? v : JSON.stringify(v),
            ])
          )}`
        : route.pfad;
    const koerper = !mitAbfrage ? JSON.stringify(daten ?? {}) : null;

    const antwort = await rufe(
      {
        host: containerName(route.app, context.stand),
        port,
        methode: route.methode,
        pfad,
        koerper,
        koepfe: {
          [appZugang.KOPF_BENUTZER]: appZugang.kopfWert(wer.username),
          [appZugang.KOPF_ROLLE]: appZugang.kopfWert(wer.role),
          'X-Arasul-Lauf': String(context.runId ?? ''),
          'X-Arasul-App': context.appId,
        },
      },
      anfrage
    );
    const text = antwort.text.trim();
    if (antwort.code < 200 || antwort.code >= 300) {
      throw new ValidationError(
        `Die App ${route.app} antwortete auf ${route.methode} ${route.pfad} mit ${antwort.code}` +
          (text ? `: ${kuerze(text.replace(/\s+/g, ' '), 300)}` : '')
      );
    }
    return text ? kuerze(text, MAX_ANTWORT_ZEICHEN) : `(HTTP ${antwort.code}, ohne Inhalt)`;
  }
}

module.exports = RouteAufrufenTool;
module.exports.genannteRoute = genannteRoute;
module.exports.datenAlsObjekt = datenAlsObjekt;
module.exports.passt = passt;
module.exports.personDesLaufs = personDesLaufs;
