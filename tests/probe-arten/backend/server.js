/**
 * Die Proben-App der Abnahme „Arten" (M5, 04.10.2026).
 *
 * Ein Messgeraet und keine Vorlage. Sie startet einen ihrer Flows (`texte`,
 * `beleg`, `nur-autonom`) mit dem Menschen aus X-Arasul-User als Einreicher.
 *
 *   POST /starten?flow=<name>&datum=<text>&unsicher=<text>  startet, antwortet { lauf }
 *   GET  /lauf?lauf=<id>          { status, freigabe } aus dem Geraet
 *
 * Die Pfade sieht sie OHNE `/apps/<id>/api`; Traefik schneidet ab.
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

const ARGUMENTE = {
  texte: p => ({ thema: p.get('thema') || 'Wartung' }),
  beleg: p => ({ datum: p.get('datum') || '', unsicher: p.get('unsicher') || '' }),
  'nur-autonom': () => ({}),
};

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

  if (pfad === '/starten' && anfrage.method === 'POST') {
    const flow = url.searchParams.get('flow') || '';
    if (!ARGUMENTE[flow]) {
      sende(antwort, 400, { fehler: `Kein Flow ${flow}` });
      return;
    }
    const einreicher = ausUtf8(anfrage.headers['x-arasul-user']);
    const { code, rumpf } = await ruf('POST', `/flows/${flow}/run`, {
      args: ARGUMENTE[flow](url.searchParams),
      wait_for_result: false,
      ...(einreicher ? { einreicher } : {}),
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
