/**
 * Die Proben-App der Abnahme „Modell je Schritt" (M5, 04.10.2026).
 *
 * Ein Messgeraet und keine Vorlage: sie tut nichts ausser auf /gesund zu
 * antworten. Die Messung liegt in den Flows (`flows/schritte.md`) und in dem,
 * was das Geraet daraus macht.
 */
const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const VERSION = process.env.PROBE_VERSION || '?';

http
  .createServer((anfrage, antwort) => {
    antwort.setHeader('content-type', 'application/json');
    if (anfrage.url === '/gesund') {
      antwort.end(JSON.stringify({ ok: true, version: VERSION }));
      return;
    }
    antwort.statusCode = 404;
    antwort.end(JSON.stringify({ fehler: 'unbekannt' }));
  })
  .listen(PORT);
