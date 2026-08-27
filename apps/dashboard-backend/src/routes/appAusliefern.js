/**
 * Das Frontend einer App ausliefern (Phase C3 des Umbaus vom 26.08.2026).
 *
 * Arasul liefert die statischen Dateien der Apps selbst aus, unter
 * `/apps/<id>/` fuer den Livestand und `/apps/<id>/test/` fuer den Teststand.
 * Nicht Traefik und nicht ein zweiter Webserver je App: das Geraet weiss, wer
 * anfragt und welche App ihm freigegeben ist, und diese Frage kann nur
 * beantworten, wer die Anmeldung kennt. Die Pruefung selbst kommt mit Phase C4;
 * dieser Baustein legt den Weg, ueber den sie laeuft.
 *
 * Das Backend einer App laeuft nicht hier, sondern in ihrem eigenen Container,
 * und Traefik gibt ihm `/apps/<id>/api/` (siehe `services/app/appContainer.js`).
 * Wenn eine Anfrage an einen `/api/`-Pfad TROTZDEM hier ankommt, ist entweder
 * kein Backend eingespielt oder Traefik kennt den Router noch nicht — beides
 * ist eine 404 mit Grund und nicht die Startseite der App. Ein Frontend, das
 * auf seine Schnittstelle HTML zurueckbekommt, meldet einen Fehler, der nach
 * einem Fehler der App aussieht.
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError } = require('../utils/errors');
const { AppId } = require('../schemas/apps');
const appStore = require('../services/app/appStore');

// `/apps/<id>` oder `/apps/<id>/test`, dahinter der Rest. Der Rest darf leer
// sein: `/apps/<id>/` ist die Startseite.
const PFAD = /^\/([^/]+)(?:\/(test))?(?:\/(.*))?$/;

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

router.use(
  asyncHandler(async (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }
    const treffer = PFAD.exec(req.path);
    if (!treffer) {
      return next();
    }
    const [, kennung, testTeil, rest = ''] = treffer;
    if (!AppId.safeParse(kennung).success) {
      return next();
    }
    const stand = testTeil ? 'test' : 'live';

    // Ohne Schraegstrich am Ende zeigen relative Verweise in der Seite
    // (`./api/…`, `assets/…`) eine Ebene zu hoch. Ein Umzug statt einer
    // kaputten Seite.
    if (
      (testTeil && req.path === `/${kennung}/test`) ||
      (!testTeil && req.path === `/${kennung}`)
    ) {
      return res.redirect(301, `${req.baseUrl}${req.path}/`);
    }

    const ziel = await appStore.ausliefernAus(kennung, stand);
    if (!ziel) {
      throw new NotFoundError(
        stand === 'test'
          ? `Kein Teststand von ${kennung} am Geraet`
          : `Keine App ${kennung} am Geraet`
      );
    }

    if (rest === 'api' || rest.startsWith('api/')) {
      throw new NotFoundError(
        `${kennung} hat unter ${req.path} keine Schnittstelle: entweder bringt die App kein Backend mit, oder ihr Container laeuft nicht`
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
