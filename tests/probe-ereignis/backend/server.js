/**
 * Die Proben-Apps der Abnahme „Ereignis und Routen" (M5, 04.10.2026,
 * Kontrakt 13).
 *
 * Ein Messgeraet und keine Vorlage. Dieselbe Datei laeuft als App a (meldet
 * Ereignisse, ihre Flows rufen Routen) und als App b (wird gerufen);
 * `PROBE_APP` sagt, welche Kennung sie traegt.
 *
 *   POST /melden?ereignis=<name>[&ohne_einreicher=1]
 *        meldet dem Geraet ein Ereignis ueber den Schluessel der App
 *        (`ARASUL_API_SCHLUESSEL`), mit dem Koerper als `daten` und dem
 *        Menschen aus `X-Arasul-User` als `einreicher`
 *   POST /v1/chat/completions   das FESTE Modell: antwortet immer "Fertig."
 *   GET  /protokoll             was diese App von Flows bekommen hat
 *   GET  /gesund
 *   jede andere Route            wird mitgeschrieben (Methode, Pfad, Abfrage,
 *                               Koepfe des Geraets, Koerper) und mit 200
 *                               beantwortet; `/kunden/<nr>` nennt den Kunden
 *
 * Die Pfade sieht sie OHNE `/apps/<id>/api`; Traefik schneidet ab.
 */

const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const APP = process.env.PROBE_APP || '?';
const API_URL = process.env.ARASUL_API_URL || '';
const API_SCHLUESSEL = process.env.ARASUL_API_SCHLUESSEL || '';

/** Was Flows an dieser App gerufen haben, aelteste zuerst. */
const protokoll = [];

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

function meldenBeimGeraet(ereignis, leib) {
  return new Promise(fertig => {
    if (!API_URL || !API_SCHLUESSEL) {
      fertig({ code: null, rumpf: null });
      return;
    }
    const daten = JSON.stringify(leib);
    const anfrage = http.request(
      `${API_URL}/ereignisse/${encodeURIComponent(ereignis)}`,
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
    const { code, rumpf } = await meldenBeimGeraet(url.searchParams.get('ereignis') || '', leib);
    sende(antwort, code || 502, { antwort: code, geraet: rumpf });
    return;
  }

  if (url.pathname === '/protokoll' && anfrage.method === 'GET') {
    sende(antwort, 200, { app: APP, aufrufe: protokoll });
    return;
  }

  // Alles andere ist eine Route, die ein Flow ruft: mitschreiben, was kam.
  const text = await lies(anfrage);
  let koerper = null;
  try {
    koerper = text ? JSON.parse(text) : null;
  } catch {
    koerper = { roh: text.slice(0, 500) };
  }
  const eintrag = {
    methode: anfrage.method,
    pfad: url.pathname,
    abfrage: Object.fromEntries(url.searchParams),
    benutzer: kopf(anfrage, 'X-Arasul-User'),
    rolle: kopf(anfrage, 'X-Arasul-Role'),
    lauf: kopf(anfrage, 'X-Arasul-Lauf'),
    von_app: kopf(anfrage, 'X-Arasul-App'),
    mit_geheimnis: Boolean(anfrage.headers.authorization),
    koerper,
  };
  protokoll.push(eintrag);
  if (protokoll.length > 500) {
    protokoll.shift();
  }
  const kunde = /^\/kunden\/([^/]+)$/.exec(url.pathname);
  sende(antwort, 200, {
    app: APP,
    gesehen: { methode: eintrag.methode, pfad: eintrag.pfad, benutzer: eintrag.benutzer },
    ...(kunde ? { kunde: kunde[1], name: `Probe-Kunde ${kunde[1]}` } : {}),
  });
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`Proben-App ${APP} hoert auf ${PORT}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
