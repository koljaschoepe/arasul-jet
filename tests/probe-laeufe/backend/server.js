/**
 * Die Proben-App der Abnahme „Verwaltung Läufe" (M5, 04.10.2026).
 *
 * Ein Messgeraet und keine Vorlage. Sie ist das FESTE MODELL, mit dem ihre
 * Flows rechnen, und sie startet auf Zuruf:
 *
 *   POST /starten?flow=<name>[&ohne_einreicher=1]
 *        startet einen Flow von Hand ueber den Schluessel der App, mit dem
 *        Menschen aus `X-Arasul-User` als `einreicher`
 *   POST /melden?ereignis=<name>[&ohne_einreicher=1]
 *        meldet dem Geraet ein Ereignis, genauso
 *   POST /v1/chat/completions   antwortet immer "Fertig."
 *   GET  /gesund
 *
 * Die Pfade sieht sie OHNE `/apps/<id>/api`; Traefik schneidet ab.
 */

const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const APP = process.env.PROBE_APP || '?';
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

/** Ein Kopf der Plattform, als UTF-8 gelesen (Kontrakt: `koepfe.hinweis`). */
function kopf(anfrage, name) {
  const wert = anfrage.headers[name.toLowerCase()];
  return wert == null ? null : Buffer.from(String(wert), 'latin1').toString('utf8');
}

function anGeraet(pfad, leib) {
  return new Promise(fertig => {
    if (!API_URL || !API_SCHLUESSEL) {
      fertig({ code: null, rumpf: null });
      return;
    }
    const daten = JSON.stringify(leib);
    const anfrage = http.request(
      `${API_URL}${pfad}`,
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
            rumpf = { roh: text.slice(0, 500) };
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
    sende(antwort, 200, { ok: true, app: APP });
    return;
  }

  if (url.pathname === '/v1/chat/completions' && anfrage.method === 'POST') {
    await lies(anfrage);
    sende(antwort, 200, {
      id: 'probe-fest',
      object: 'chat.completion',
      model: 'fest',
      choices: [
        { index: 0, message: { role: 'assistant', content: 'Fertig.' }, finish_reason: 'stop' },
      ],
    });
    return;
  }

  if (url.pathname === '/melden' && anfrage.method === 'POST') {
    let daten = {};
    try {
      daten = JSON.parse((await lies(anfrage)) || '{}');
    } catch {
      daten = {};
    }
    const leib = { daten };
    const wer = kopf(anfrage, 'X-Arasul-User');
    if (wer && url.searchParams.get('ohne_einreicher') !== '1') {
      leib.einreicher = wer;
    }
    const { code, rumpf } = await anGeraet(
      `/ereignisse/${encodeURIComponent(url.searchParams.get('ereignis') || '')}`,
      leib
    );
    sende(antwort, code || 502, { antwort: code, geraet: rumpf });
    return;
  }

  if (url.pathname === '/starten' && anfrage.method === 'POST') {
    await lies(anfrage);
    const leib = { args: {}, wait_for_result: false };
    const wer = kopf(anfrage, 'X-Arasul-User');
    if (wer && url.searchParams.get('ohne_einreicher') !== '1') {
      leib.einreicher = wer;
    }
    const nummer = url.searchParams.get('nummer');
    if (nummer) {
      leib.args = { nummer };
    }
    const { code, rumpf } = await anGeraet(
      `/flows/${encodeURIComponent(url.searchParams.get('flow') || '')}/run`,
      leib
    );
    sende(antwort, code || 502, { antwort: code, geraet: rumpf });
    return;
  }

  // Alles andere ist eine Route, die ein Flow ruft; sie antwortet mit 200.
  await lies(anfrage);
  sende(antwort, 200, { app: APP });
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`Proben-App ${APP} hoert auf ${PORT}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
