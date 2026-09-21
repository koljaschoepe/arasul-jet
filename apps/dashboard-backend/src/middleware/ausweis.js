/**
 * Den Ausweis eines Mitarbeiters annehmen -- auf genau den Wegen, die ihn
 * annehmen sollen (Bruecke, 21.09.2026, J34).
 *
 * WARUM DAS NICHT IN `requireAuth` STEHT. Dort stuende es EINMAL und wirkte
 * auf jede Route des Geraets: Modelle, Benutzer, Sicherung, Werksreset. Der
 * Ausweis ist aber kein Ersatz fuer eine Sitzung, sondern etwas Kleineres --
 * er sagt, wer da ist, und oeffnet die Apps dieses Menschen. Die Regel „was
 * ein Ausweis kann, steht an den Routen, die ihn einbinden" ist damit im Bau
 * durchgesetzt und nicht in einer Ausnahmeliste, die jemand pflegen muss.
 * Vier Zeilen an drei Routen sind die ehrlichere Fassung von „sonst nichts".
 *
 * Und andersherum: ein Ausweis, der auf irgendeinem anderen Weg des Geraets
 * ankommt, ist dort kein gueltiger JWT. `requireAuth` antwortet 401, ohne
 * dass es dafuer eine Regel braeuchte.
 */

const mitarbeiterAusweis = require('../services/auth/mitarbeiterAusweis');
const { requireAuth } = require('./auth');

/** Der Wert hinter `Authorization: Bearer`, oder `null`. */
function bearerAus(req) {
  const kopf = req.headers.authorization;
  if (!kopf) {
    return null;
  }
  const teile = kopf.split(' ');
  return teile.length === 2 && teile[0].toLowerCase() === 'bearer' ? teile[1] : null;
}

/**
 * Ein Ausweis ODER eine Sitzung.
 *
 * Reihenfolge und Rueckfall sind die Aussage: sieht der Wert nicht wie ein
 * Ausweis aus, geht die Anfrage unveraendert durch `requireAuth` -- der
 * Browser merkt von dieser Datei nichts. Sieht er wie einer aus und ist
 * keiner, ist die Antwort 401 und NICHT ein Durchreichen an `requireAuth`:
 * ein widerrufener Ausweis soll „widerrufen" hoeren und nicht „kein gueltiger
 * Token", und `requireAuth` wuerde denselben Wert nur noch einmal als JWT
 * ablehnen.
 *
 * `req.user` sieht danach aus wie nach `requireAuth` -- dieselben Spalten,
 * dieselben Namen --, damit `requireRole` und jede Route dahinter nicht
 * wissen muessen, woher der Mensch kommt. Wer es doch wissen will, fragt
 * `req.ausweisId`.
 */
function ausweisOderSitzung(req, res, next) {
  const wert = bearerAus(req);
  if (!mitarbeiterAusweis.siehtAusWieAusweis(wert)) {
    return requireAuth(req, res, next);
  }
  mitarbeiterAusweis
    .pruefe(wert)
    .then(treffer => {
      if (!treffer) {
        return res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message:
              'Dieser Ausweis gilt nicht (mehr). Er wurde widerrufen, oder das Konto dazu ist abgeschaltet.',
          },
          timestamp: new Date().toISOString(),
        });
      }
      req.user = treffer.benutzer;
      req.ausweisId = treffer.ausweisId;
      next();
    })
    .catch(next);
}

/**
 * Derselbe Ausweis, aber ohne Pflicht: gilt er, steht der Mensch danach in
 * `req.user`; gilt er nicht, geht es weiter, als waere nichts gewesen.
 *
 * Nur fuer die Sitzungsprobe (`GET /api/auth/session`). Sie antwortet in
 * beiden Faellen mit 200 und sagt, ob jemand da ist -- ein 401 waere dort
 * gerade der Fehler, gegen den sie gebaut ist (Plan 023 C3). Das CLI der
 * Bruecke fragt hier nach, ob ein Ausweis noch gilt, bevor es ihn ablegt.
 *
 * Sie steht HINTER `optionalAuth` und tritt nur an, wenn dort niemand
 * gefunden wurde: eine Sitzung ist die genauere Auskunft, und der Browser
 * soll von dieser Datei nichts merken.
 */
function ausweisProbe(req, res, next) {
  if (req.user) {
    return next();
  }
  const wert = bearerAus(req);
  if (!mitarbeiterAusweis.siehtAusWieAusweis(wert)) {
    return next();
  }
  mitarbeiterAusweis
    .pruefe(wert)
    .then(treffer => {
      if (treffer) {
        req.user = treffer.benutzer;
        req.ausweisId = treffer.ausweisId;
      }
      next();
    })
    .catch(next);
}

module.exports = { ausweisOderSitzung, ausweisProbe, bearerAus };
