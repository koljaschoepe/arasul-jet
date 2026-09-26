/**
 * Die Proben-App der Abnahme „Freigabe sagt, wer entscheidet" (J35,
 * 26.09.2026).
 *
 * Ein Messgeraet und keine Vorlage. Sie tut, was eine Fach-App nach dem
 * Einreichen tut: den Lauf mit dem Menschen aus X-Arasul-User als Einreicher
 * und der Vier-Augen-Regel starten, und danach dem Menschen sagen, was das
 * Geraet zum Lauf sagt -- `freigabe` aus GET /flows/runs/:id, unveraendert.
 *
 *   POST /einreichen        startet den Flow `freigabe`, antwortet { lauf }
 *   GET  /lauf?lauf=<id>    { status, freigabe } aus dem Geraet
 *
 * Die Pfade sieht sie OHNE `/apps/probe-freigabe/api`; Traefik schneidet ab.
 */

const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const VERSION = process.env.PROBE_VERSION || '?';
const API_URL = process.env.ARASUL_API_URL || '';
const API_SCHLUESSEL = process.env.ARASUL_API_SCHLUESSEL || '';

function ausUtf8(wert) {
  return wert ? Buffer.from(wert, 'latin1').toString('utf8') : null;
}

function ruf(verb, pfad, leib) {
  return new Promise(fertig => {
    if (!API_URL || !API_SCHLUESSEL) {
      fertig({ code: null, rumpf: null });
      return;
    }
    const daten = leib ? JSON.stringify(leib) : null;
    const anfrage = http.request(
      `${API_URL}${pfad}`,
      {
        method: verb,
        timeout: 30000,
        headers: {
          'x-api-key': API_SCHLUESSEL,
          ...(daten
            ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(daten) }
            : {}),
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
    if (daten) {
      anfrage.write(daten);
    }
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
  const pfad = url.pathname;

  if (pfad === '/gesund') {
    sende(antwort, 200, { ok: true, version: VERSION });
    return;
  }

  if (pfad === '/einreichen' && anfrage.method === 'POST') {
    const einreicher = ausUtf8(anfrage.headers['x-arasul-user']);
    const { code, rumpf } = await ruf('POST', '/flows/freigabe/run', {
      args: { woche: url.searchParams.get('woche') || '39' },
      wait_for_result: false,
      ...(einreicher ? { einreicher } : {}),
      freigabe: { ohne_einreicher: true },
    });
    sende(antwort, code || 502, {
      antwort: code,
      lauf: rumpf?.run_id ?? null,
      einreicher,
      fehler: rumpf?.error ?? null,
    });
    return;
  }

  if (pfad === '/lauf') {
    const lauf = url.searchParams.get('lauf') || '';
    const { code, rumpf } = await ruf('GET', `/flows/runs/${encodeURIComponent(lauf)}`);
    sende(antwort, code === 200 ? 200 : 502, {
      antwort: code,
      status: rumpf?.status ?? null,
      freigabe: rumpf?.freigabe ?? null,
    });
    return;
  }

  sende(antwort, 404, { fehler: `Die Proben-App kennt ${pfad} nicht` });
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`Proben-App ${VERSION} hoert auf ${PORT}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
