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
 */

const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const NAME = process.env.ARASUL_APP_NAME || 'Beispielapp';

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
        // Was die Plattform der App ueber den Aufrufer sagt. In Phase C3 ist
        // das nichts: die Weiterreichung der Anmeldung kommt mit C4. Das Feld
        // steht trotzdem hier, weil die Abnahme dieser Phase belegen soll,
        // dass es HEUTE leer ist und nicht etwa still gefuellt wird.
        nutzer: anfrage.headers['x-arasul-user'] || null,
        zeit: new Date().toISOString(),
      })
    );
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
