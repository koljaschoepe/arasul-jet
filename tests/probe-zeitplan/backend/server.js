/**
 * Die Proben-App der Abnahme „Zeitplaner" (M5, 04.10.2026).
 *
 * Ein Messgeraet und keine Vorlage. Sie startet nichts: ihre Flows laufen nach
 * Zeitplan, das ist der Gegenstand der Messung. Sie ist nur das FESTE MODELL,
 * mit dem die Flows rechnen, damit die Abnahme ohne Sprachmodell
 * deterministisch ist:
 *
 *   POST /v1/chat/completions   antwortet immer "Fertig."
 *   POST /starten?flow=<name>   startet einen Flow von Hand (Gegenprobe: die
 *                               Pause des Zeitplans trifft den Start von Hand
 *                               nicht)
 *   GET  /gesund
 *
 * Die Pfade sieht sie OHNE `/apps/<id>/api`; Traefik schneidet ab.
 */

const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const VERSION = process.env.PROBE_VERSION || '?';
const API_URL = process.env.ARASUL_API_URL || '';
const API_SCHLUESSEL = process.env.ARASUL_API_SCHLUESSEL || '';

function lies(anfrage) {
  return new Promise(fertig => {
    let text = '';
    anfrage.setEncoding('utf8');
    anfrage.on('data', stueck => {
      text += stueck;
    });
    anfrage.on('end', () => fertig(text));
    anfrage.on('error', () => fertig(''));
  });
}

function startenBeimGeraet(flow) {
  return new Promise(fertig => {
    if (!API_URL || !API_SCHLUESSEL) {
      fertig({ code: null, rumpf: null });
      return;
    }
    const daten = JSON.stringify({ args: {}, wait_for_result: false });
    const anfrage = http.request(
      `${API_URL}/flows/${encodeURIComponent(flow)}/run`,
      {
        method: 'POST',
        timeout: 30000,
        headers: {
          'x-api-key': API_SCHLUESSEL,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(daten),
        },
      },
      antwort => {
        let text = '';
        antwort.setEncoding('utf8');
        antwort.on('data', stueck => {
          text += stueck;
        });
        antwort.on('end', () => {
          let rumpf = null;
          try {
            rumpf = JSON.parse(text);
          } catch {
            rumpf = null;
          }
          fertig({ code: antwort.statusCode, rumpf });
        });
      }
    );
    anfrage.on('timeout', () => anfrage.destroy());
    anfrage.on('error', () => fertig({ code: 0, rumpf: null }));
    anfrage.write(daten);
    anfrage.end();
  });
}

function sende(antwort, code, inhalt) {
  antwort.statusCode = code;
  antwort.end(JSON.stringify(inhalt));
}

const server = http.createServer(async (anfrage, antwort) => {
  antwort.setHeader('content-type', 'application/json; charset=utf-8');
  const url = new URL(anfrage.url, 'http://app');

  if (url.pathname === '/gesund') {
    sende(antwort, 200, { ok: true, version: VERSION });
    return;
  }

  if (url.pathname === '/v1/chat/completions' && anfrage.method === 'POST') {
    let leib = {};
    try {
      leib = JSON.parse(await lies(anfrage));
    } catch {
      leib = {};
    }
    sende(antwort, 200, {
      id: 'probe-fest',
      object: 'chat.completion',
      model: leib.model || 'fest',
      choices: [
        { index: 0, message: { role: 'assistant', content: 'Fertig.' }, finish_reason: 'stop' },
      ],
    });
    return;
  }

  if (url.pathname === '/starten' && anfrage.method === 'POST') {
    const { code, rumpf } = await startenBeimGeraet(url.searchParams.get('flow') || '');
    sende(antwort, code || 502, { antwort: code, lauf: rumpf?.run_id ?? null, fehler: rumpf?.error ?? null });
    return;
  }

  sende(antwort, 404, { fehler: `Die Proben-App kennt ${url.pathname} nicht` });
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`Proben-App ${VERSION} hoert auf ${PORT}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
