/**
 * Das Frontend einer App ausliefern und sagen, wer da ist (Phasen C3 und C4
 * des Umbaus vom 26.08.2026).
 *
 * Arasul liefert die statischen Dateien der Apps selbst aus, unter
 * `/apps/<id>/` fuer den Livestand und `/apps/<id>/test/` fuer den Teststand.
 * Nicht Traefik und nicht ein zweiter Webserver je App: das Geraet weiss, wer
 * anfragt und welche App ihm freigegeben ist, und diese Frage kann nur
 * beantworten, wer die Anmeldung kennt. C3 hat den Weg gelegt, C4 stellt die
 * Pruefung hinein — sie steht in `services/app/appZugang.js`, an einer Stelle
 * fuer beide Wege.
 *
 * Das Backend einer App laeuft nicht hier, sondern in ihrem eigenen Container,
 * und Traefik gibt ihm `/apps/<id>/api/` (siehe `services/app/appContainer.js`).
 * Wenn eine Anfrage an einen `/api/`-Pfad TROTZDEM hier ankommt, ist entweder
 * kein Backend eingespielt oder Traefik kennt den Router noch nicht — beides
 * ist eine 404 mit Grund und nicht die Startseite der App. Ein Frontend, das
 * auf seine Schnittstelle HTML zurueckbekommt, meldet einen Fehler, der nach
 * einem Fehler der App aussieht.
 *
 * DIE EINE AUSNAHME davon ist `/apps/<id>/api/me` (C4): dieser Weg gehoert der
 * Plattform und wird hier beantwortet, obwohl er unter `api/` liegt. Der Grund
 * steht bei `ICH` weiter unten.
 *
 * WAS OHNE SITZUNG PASSIERT, haengt daran, was gefragt wurde:
 *
 *   die Seite (`/apps/<id>/…`)         302 auf `/`, dort steht die Anmeldung
 *   die Schnittstelle (`/apps/<id>/api/…`)  401 als JSON
 *
 * Ein Umzug auf die Anmeldeseite waere fuer ein `fetch` der App genau der
 * Fall, vor dem der Absatz darueber warnt: sie bekaeme HTML, wo sie JSON
 * erwartet, und meldete einen Fehler, der nach ihrem eigenen aussieht.
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { optionalAuth } = require('../middleware/auth');
const { NotFoundError, UnauthorizedError } = require('../utils/errors');
const { AppId } = require('../schemas/apps');
const appStore = require('../services/app/appStore');
const appZugang = require('../services/app/appZugang');

// `/apps/<id>` oder `/apps/<id>/test`, dahinter der Rest. Der Rest darf leer
// sein: `/apps/<id>/` ist die Startseite.
const PFAD = /^\/([^/]+)(?:\/(test))?(?:\/(.*))?$/;

/**
 * Der Weg, unter dem eine App fragt, wer gerade da ist.
 *
 * Er liegt unter `api/` und gehoert trotzdem der Plattform — der dritte
 * vergebene Name unter `/apps/<id>/` nach `test` und `api` selbst, und der
 * einzige, der einer App etwas WEGNIMMT. Das ist eine Entscheidung und keine
 * Bequemlichkeit:
 *
 * Eine App darf nach ihrem Manifest ganz ohne Backend auskommen
 * (`docs/features/APPS.md`, „mindestens eines von beiden"). Kaeme die Auskunft
 * ueber den angemeldeten Menschen nur aus dem Container der App, koennte
 * ausgerechnet die einfachste Sorte App — eine Seite ohne eigenen Dienst — den
 * Namen ihres Benutzers nicht anzeigen. Und ein Backend kann die Frage ohnehin
 * nur beantworten, indem es den Kopf zurueckgibt, den die Plattform ihm gerade
 * gesetzt hat.
 *
 * Der Traefik-Router dazu steht in `config/traefik/dynamic/routes.yml` mit
 * `Path(...)` und nicht `PathPrefix(...)`: vergeben ist genau dieser eine Weg.
 * `/apps/<id>/api/meine-sachen` gehoert weiter der App.
 */
const ICH = 'api/me';

/**
 * Ein Pfad ohne Punkt im letzten Stueck ist eine Route der App, keine Datei —
 * `/apps/urlaub/antraege/17` gehoert zur Seite und nicht auf die Platte.
 * Dafuer liefert eine Einzelseiten-Anwendung ihre `index.html`, sonst waere
 * jeder Neuladen-Klick in einer Unterseite ein 404.
 */
function istDateiPfad(rest) {
  const letztes = rest.split('/').pop();
  return letztes.includes('.');
}

/**
 * Den Pfad lesen, und alles erledigen, was ohne Datenbank geht.
 *
 * Steht danach kein `req.appPfad`, ist die Anfrage keine an eine App: dann
 * `next('router')`, also raus aus diesem Router und weiter in der Kette von
 * `index.js`. Ein einfaches `next()` liefe hier in die Anmeldung darunter, und
 * die hat mit `/apps/etwas-anderes` nichts zu tun.
 */
function pfadErkennen(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return next('router');
  }
  const treffer = PFAD.exec(req.path);
  if (!treffer) {
    return next('router');
  }
  const [, kennung, testTeil, rest = ''] = treffer;
  if (!AppId.safeParse(kennung).success) {
    return next('router');
  }

  // Ohne Schraegstrich am Ende zeigen relative Verweise in der Seite
  // (`./api/…`, `assets/…`) eine Ebene zu hoch. Ein Umzug statt einer
  // kaputten Seite, und zwar VOR der Anmeldung: der Umzug sagt nichts darueber
  // aus, ob es die App gibt oder wer fragt.
  if ((testTeil && req.path === `/${kennung}/test`) || (!testTeil && req.path === `/${kennung}`)) {
    return res.redirect(301, `${req.baseUrl}${req.path}/`);
  }

  req.appPfad = { kennung, stand: testTeil ? 'test' : 'live', rest };
  return next();
}

// `optionalAuth` und nicht `requireAuth`: fehlt die Sitzung, soll hier kein
// fertiges 401-JSON herausfallen, sondern die Entscheidung unten getroffen
// werden — Seite oder Schnittstelle. Der Preis ist eine Abfrage je Anfrage
// (optionalAuth kennt den Zwischenspeicher von requireAuth nicht), also auch
// je Stylesheet und je Bild einer App. Bei einem Geraet mit einer Handvoll
// Menschen ist das eine indizierte Abfrage auf `admin_users`; sie
// zwischenzuspeichern hiesse, eine zurueckgenommene Freigabe noch eine Minute
// lang gelten zu lassen.
router.use(
  pfadErkennen,
  optionalAuth,
  asyncHandler(async (req, res, next) => {
    const { kennung, stand, rest } = req.appPfad;
    const istSchnittstelle = rest === 'api' || rest.startsWith('api/');

    if (!req.user) {
      if (istSchnittstelle) {
        throw new UnauthorizedError(
          `Fuer ${kennung} braucht es eine Anmeldung an Arasul. Die Anmeldung steht unter /.`
        );
      }
      return res.redirect(302, '/');
    }

    // Wirft 403 ohne Freigabe, 403 fuer den Teststand ohne Tester-Freigabe,
    // 404, wenn es diesen Stand am Geraet nicht gibt. Vor allem anderen: wer
    // die App nicht freigegeben hat, erfaehrt auch nicht, ob es sie gibt.
    await appZugang.pruefe({ benutzerId: req.user.id, appId: kennung, stand });

    if (rest === ICH) {
      return res.json({
        data: {
          app_id: kennung,
          stand,
          benutzer: req.user.username,
          rolle: req.user.role,
        },
        timestamp: new Date().toISOString(),
      });
    }

    if (istSchnittstelle) {
      throw new NotFoundError(
        `${kennung} hat unter ${req.path} keine Schnittstelle: entweder bringt die App kein Backend mit, oder ihr Container laeuft nicht`
      );
    }

    const ziel = await appStore.ausliefernAus(kennung, stand);
    if (!ziel) {
      throw new NotFoundError(
        `${kennung} bringt in diesem Stand kein Frontend mit; sie hat nur ein Backend unter /apps/${kennung}/api/`
      );
    }

    if (rest && istDateiPfad(rest)) {
      return res.sendFile(rest, { root: ziel.verzeichnis }, fehler => {
        if (!fehler) {
          return;
        }
        // 404 aus `sendFile` heisst: die Datei gibt es nicht. Alles andere
        // (403 bei Ausbruchsversuch, EACCES) geht an den Fehlerbehandler.
        next(
          fehler.status === 404
            ? new NotFoundError(`${rest} gibt es in ${kennung} ${ziel.version} nicht`)
            : fehler
        );
      });
    }

    return res.sendFile('index.html', { root: ziel.verzeichnis }, fehler => {
      if (fehler) {
        next(fehler);
      }
    });
  })
);

module.exports = router;
