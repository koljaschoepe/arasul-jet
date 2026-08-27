/**
 * Das Backend der Beispielapp.
 *
 * Ohne Abhaengigkeiten, mit dem eingebauten `http`-Modul: die Beispielapp soll
 * belegen, dass eine App unter `/apps/<id>/api/` erreichbar ist, und nicht
 * nebenbei einen zweiten Paketbaum ins Repository holen.
 *
 * Sie sieht ihre Pfade OHNE das Praefix der Plattform: Traefik schneidet
 * `/apps/beispielapp/api` ab, bevor die Anfrage hier ankommt. Genau das gibt
 * `/hallo` in der Antwort zurueck — es ist der Beleg dafuer.
 *
 * Seit Phase C4 belegt sie zwei Dinge mehr, und beide kommen von der
 * Plattform, nicht von ihr selbst:
 *
 *   /hallo       wer angemeldet ist (`X-Arasul-User`, `X-Arasul-Role`)
 *   /schluessel  dass ihr API-Schluessel wirklich gilt
 */

const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const NAME = process.env.ARASUL_APP_NAME || 'Beispielapp';
const API_URL = process.env.ARASUL_API_URL || '';
const API_SCHLUESSEL = process.env.ARASUL_API_SCHLUESSEL || '';

/**
 * Eine Kopfzeile, wie die Plattform sie meint.
 *
 * Node liest Kopfzeilen als Latin-1, die Plattform legt den Namen aber als
 * UTF-8 ab (`services/app/appZugang.js`). Ohne diese Zeile stuende
 * "JÃ¼rgen MÃ¼ller" auf dem Bildschirm. Der Umweg ist bei reinem ASCII
 * folgenlos, deshalb steht er ohne Bedingung da.
 */
function ausUtf8(wert) {
  return wert ? Buffer.from(wert, 'latin1').toString('utf8') : null;
}

/**
 * Einen Aufruf an die externe Schnittstelle des Geraets machen und NUR den
 * HTTP-Code zurueckgeben.
 *
 * Der Schluessel selbst verlaesst diesen Prozess nicht. Eine Beispielapp, die
 * ihn anzeigt, waere eine Anleitung dafuer, es genauso zu machen.
 */
function schluesselPruefen() {
  return new Promise(fertig => {
    if (!API_URL || !API_SCHLUESSEL) {
      fertig(null);
      return;
    }
    const anfrage = http.get(
      `${API_URL}/models`,
      { headers: { 'x-api-key': API_SCHLUESSEL }, timeout: 10000 },
      antwort => {
        antwort.resume();
        fertig(antwort.statusCode);
      }
    );
    anfrage.on('timeout', () => anfrage.destroy());
    anfrage.on('error', () => fertig(0));
  });
}

const server = http.createServer((anfrage, antwort) => {
  const pfad = new URL(anfrage.url, 'http://app').pathname;
  antwort.setHeader('content-type', 'application/json; charset=utf-8');

  if (pfad === '/gesund') {
    antwort.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (pfad === '/hallo') {
    antwort.end(
      JSON.stringify({
        app: NAME,
        pfad,
        // Was die Plattform der App ueber den Aufrufer sagt. Seit C4 steht
        // hier ein Name: die Forward-Auth vor diesem Container setzt beide
        // Koepfe, und sie sind nicht faelschbar — Traefik loescht sie aus der
        // eingehenden Anfrage, bevor es sie aus der Antwort der Anmeldung neu
        // setzt.
        nutzer: ausUtf8(anfrage.headers['x-arasul-user']),
        rolle: ausUtf8(anfrage.headers['x-arasul-role']),
        zeit: new Date().toISOString(),
      })
    );
    return;
  }

  if (pfad === '/schluessel') {
    schluesselPruefen().then(code => {
      antwort.end(
        JSON.stringify({
          gesetzt: Boolean(API_SCHLUESSEL),
          url: API_URL || null,
          // Der HTTP-Code der externen Schnittstelle: 200 heisst, der
          // Schluessel gilt. `null` heisst, das Geraet hat keinen gesetzt,
          // `0` heisst, es kam keine Antwort.
          antwort: code,
        })
      );
    });
    return;
  }

  antwort.statusCode = 404;
  antwort.end(JSON.stringify({ fehler: `Die Beispielapp kennt ${pfad} nicht` }));
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`Beispielapp hoert auf ${PORT}\n`);
});

// Docker schickt SIGTERM; ohne diese Zeilen wartet es zehn Sekunden und
// schiesst dann. Bei einer App, die je Deploy neu gestartet wird, sind das
// zehn Sekunden je Deploy.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
