/**
 * Die Proben-App der Abnahme „KI-Aufrufe im Protokoll" (J35, 26.09.2026).
 *
 * Ein Messgeraet und keine Vorlage. Sie tut, was die Faktum-App tut: sie
 * liest einen Beleg ueber `document/extract-structured` aus -- OHNE Flow --
 * und reicht den Menschen aus `X-Arasul-User` unveraendert an das Geraet
 * weiter, wie der Kontrakt (`protokoll`) es sagt. Ob der Aufruf danach im
 * Protokoll des Geraets steht, misst die Abnahme von aussen.
 *
 *   POST /beleg?text=…&ohne_kopf=1&als=<name>&modell=<id>
 *
 * `ohne_kopf=1` schickt niemanden mit, `als` einen anderen Namen als den
 * angemeldeten (Gegenprobe: das Geraet weist ihn ab). Die Pfade sieht sie
 * OHNE `/apps/probe-ki/api`; Traefik schneidet ab.
 */

const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const VERSION = process.env.PROBE_VERSION || '?';
const API_URL = process.env.ARASUL_API_URL || '';
const API_SCHLUESSEL = process.env.ARASUL_API_SCHLUESSEL || '';

function sende(antwort, code, inhalt) {
  antwort.statusCode = code;
  antwort.setHeader('content-type', 'application/json; charset=utf-8');
  antwort.end(JSON.stringify(inhalt));
}

async function beleg(anfrage, q) {
  const form = new FormData();
  const text = q.get('text') || 'Rechnung Nr. 1 ueber 12,00 EUR';
  form.append('file', new Blob([text], { type: 'text/plain' }), q.get('datei') || 'beleg.txt');
  form.append('schema', JSON.stringify({ betrag: 'number', nummer: 'string' }));
  if (q.get('modell')) {
    form.append('model', q.get('modell'));
  }
  const kopf = { 'x-api-key': API_SCHLUESSEL };
  if (q.get('als')) {
    kopf['x-arasul-user'] = q.get('als');
  } else if (q.get('ohne_kopf') !== '1' && anfrage.headers['x-arasul-user']) {
    // Unveraendert weiterreichen: der Kopf steht schon als UTF-8 in latin1.
    kopf['x-arasul-user'] = anfrage.headers['x-arasul-user'];
  }
  const antwort = await fetch(`${API_URL}/document/extract-structured`, {
    method: 'POST',
    headers: kopf,
    body: form,
    signal: AbortSignal.timeout(600000),
  });
  let rumpf = null;
  try {
    rumpf = await antwort.json();
  } catch {
    rumpf = null;
  }
  return { code: antwort.status, rumpf };
}

const server = http.createServer(async (anfrage, antwort) => {
  const url = new URL(anfrage.url, 'http://app');
  if (url.pathname === '/gesund') {
    sende(antwort, 200, { ok: true, version: VERSION });
    return;
  }
  if (url.pathname === '/beleg' && anfrage.method === 'POST') {
    try {
      const { code, rumpf } = await beleg(anfrage, url.searchParams);
      // Der Code des Geraets geht unveraendert hinaus: die Abnahme misst an
      // ihm, ob ein Name abgewiesen wurde (400).
      sende(antwort, code, {
        antwort: code,
        job_id: rumpf?.job_id ?? null,
        modell: rumpf?.model ?? null,
        daten: rumpf?.data ?? null,
        fehler: rumpf?.error ?? null,
      });
    } catch (fehler) {
      sende(antwort, 502, { antwort: null, fehler: fehler.message });
    }
    return;
  }
  sende(antwort, 404, { fehler: 'unbekannt' });
});

server.listen(PORT);
