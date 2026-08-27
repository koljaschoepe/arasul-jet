/**
 * Wer eine App benutzen darf (Phase C4 des Umbaus vom 26.08.2026).
 *
 * C2 hat die Freigabe gebaut, C3 den Weg, ueber den eine App ausgeliefert wird.
 * Hier laufen beide zusammen: VOR jeder Seite und vor jedem Aufruf an das
 * Backend einer App steht die Frage „darf dieser Mensch das", und diese Datei
 * ist die einzige Stelle, die sie beantwortet. Die statische Auslieferung
 * (`routes/appAusliefern.js`) fragt sie im selben Prozess, das Backend der App
 * ueber Traefik (`GET /api/apps/:id/zugang`, Forward-Auth).
 *
 * Es gibt keine Sonderregel fuer Administratoren. Wer eine App benutzen will,
 * braucht sie freigegeben, auch der Administrator — das ist die Entscheidung
 * aus C2, und eine Ausnahme hier waere eine zweite Wahrheit neben
 * `app_members`.
 *
 * DIE REIHENFOLGE DER ANTWORTEN IST ABSICHT: erst die Freigabe, dann die
 * Existenz. Wer eine App nicht freigegeben hat, erfaehrt auch nicht, ob es sie
 * am Geraet gibt. Andersherum waere die Liste der Apps eines Unternehmens fuer
 * jeden angemeldeten Menschen abzaehlbar, und das ist eine Auskunft, die die
 * Freigabe gerade verweigern soll.
 */

const db = require('../../database');
const { ForbiddenError, NotFoundError } = require('../../utils/errors');

/**
 * Ein Wert, der in einer HTTP-Kopfzeile stehen darf.
 *
 * Zwei Dinge passieren hier, und beide sind noetig:
 *
 * 1. Steuerzeichen fallen weg. Ein Benutzername darf nach `schemas/benutzer.js`
 *    beliebiger Text bis 64 Zeichen sein; ein Zeilenumbruch darin waere eine
 *    zweite Kopfzeile, die sich der Mensch selbst geschrieben hat.
 * 2. Der Text wird als UTF-8 auf die Leitung gelegt. Node prueft Kopfzeilen
 *    gegen `[\t\x20-\x7e\x80-\xff]` und wirft bei allem darueber
 *    (`ERR_INVALID_CHAR`) -- ein Benutzer mit einem Namen in Schriftzeichen
 *    jenseits von Latin-1 haette also JEDEN Aufruf an JEDE App mit einem 500
 *    beendet. `Buffer.from(t, 'utf8').toString('latin1')` legt genau die
 *    UTF-8-Bytes ab, ohne dass ein Zeichen zu gross wird.
 *
 * Eine App liest den Kopf also als UTF-8. Wer es bequemer haben will, ruft
 * `/apps/<id>/api/me` auf und bekommt denselben Namen als JSON.
 */
function kopfWert(text) {
  const sauber = String(text ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .slice(0, 200);
  return Buffer.from(sauber, 'utf8').toString('latin1');
}

/**
 * Darf dieser Mensch diesen Stand dieser App?
 *
 * Wirft, statt einen Wahrheitswert zurueckzugeben: die Antwort ist immer eine
 * HTTP-Antwort, und `ForbiddenError`/`NotFoundError` tragen Code und Meldung
 * schon mit sich. Der Fehlerbehandler macht daraus den ueblichen Umschlag, und
 * Traefik reicht ihn bei einer Forward-Auth unveraendert an den Browser durch.
 *
 * @param {{benutzerId: number|string, appId: string, stand: 'test'|'live'}} was
 * @returns {Promise<{app_id: string, stand: string, freigegeben_bis: string}>}
 */
async function pruefe({ benutzerId, appId, stand }) {
  const freigabe = await db.query(
    'SELECT stand FROM public.app_members WHERE app_id = $1 AND user_id = $2',
    [appId, benutzerId]
  );
  if (freigabe.rows.length === 0) {
    throw new ForbiddenError(
      `Die App ${appId} ist Ihnen nicht freigegeben. Ein Administrator gibt sie frei, ` +
        'auch fuer sich selbst: eine Sonderregel fuer Administratoren gibt es nicht.'
    );
  }
  const freigegebenBis = freigabe.rows[0].stand;

  // Ein Tester ist kein anderer Nutzer, sondern einer mit einer Tuer mehr
  // (`docs/features/APPS.md`). `stand = 'test'` sieht beide Staende, `'live'`
  // nur den Livestand.
  if (stand === 'test' && freigegebenBis !== 'test') {
    throw new ForbiddenError(
      `Der Teststand von ${appId} ist den Testern vorbehalten. Der Livestand liegt unter /apps/${appId}/.`
    );
  }

  const vorhanden = await db.query(
    'SELECT 1 FROM public.app_staende WHERE app_id = $1 AND stand = $2',
    [appId, stand]
  );
  if (vorhanden.rows.length === 0) {
    throw new NotFoundError(
      stand === 'test' ? `Kein Teststand von ${appId} am Geraet` : `Keine App ${appId} am Geraet`
    );
  }

  return { app_id: appId, stand, freigegeben_bis: freigegebenBis };
}

/**
 * Was die Plattform der App ueber den Aufrufer sagt.
 *
 * Genau zwei Koepfe, und beide sind Aussagen der PLATTFORM, nicht des
 * Browsers: Traefik loescht sie an der Forward-Auth-Middleware aus der
 * eingehenden Anfrage, bevor es sie aus der Antwort dieses Endpunkts neu
 * setzt (`authResponseHeaders`, siehe `services/app/appContainer.js`). Ein
 * Aufrufer, der `X-Arasul-User: chef` mitschickt, kommt damit nicht durch.
 *
 * Die Nummer steht bewusst NICHT dabei. Eine App, die Daten je Mensch ablegt,
 * braucht einen stabilen Schluessel, und dafuer waere die Nummer richtig --
 * aber sie ist noch nirgends versprochen, und ein Feld, das die Plattform
 * setzt und niemand liest, ist die Sorte Zusage, die man spaeter nicht mehr
 * los wird. Wer sie braucht, bekommt sie in der Phase, die sie braucht.
 */
function setzeKoepfe(res, benutzer) {
  res.set({
    'X-Arasul-User': kopfWert(benutzer.username),
    'X-Arasul-Role': kopfWert(benutzer.role),
  });
}

module.exports = { pruefe, setzeKoepfe, kopfWert };
