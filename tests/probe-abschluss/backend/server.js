/**
 * Die Proben-App der Abnahme „Abschluss ueber die App" (M5, 04.10.2026).
 *
 * Ein Messgeraet und keine Vorlage. Sie startet einen ihrer Flows (`buch`,
 * `beleg`, `ohne`) mit dem Menschen aus X-Arasul-User als Einreicher und
 * nimmt die Ergebnisse an Abschluss-Routen entgegen.
 *
 *   POST /starten?flow=<name>&thema=<text>&datum=<text>  startet, antwortet { lauf }
 *   GET  /lauf?lauf=<id>          { status, freigabe } aus dem Geraet
 *   POST /v1/chat/completions     ein FESTES Modell
 *   POST /abschluss/buch|beleg    die Abschluss-Route (Kontrakt 11): prueft
 *                                 Authorization: Bearer ARASUL_ABSCHLUSS_TOKEN
 *                                 und den Idempotency-Key, legt ein Ergebnis zu
 *                                 einer Lauf-Nummer nur einmal an
 *   POST /schalter?modus=<m>      ok | 503 | langsam | haengt -- stoert die
 *                                 Route absichtlich (nie einen fremden Container)
 *   GET  /empfangen?lauf=<id>     was zu dieser Lauf-Nummer ankam, wie oft
 *                                 gerufen wurde, ob der Token stimmte
 *   GET  /info                    Modus, ob der Token gesetzt ist
 *
 * WARUM EIN FESTES MODELL. Die Abnahme liess bis zum 04.10.2026 das echte
 * Modell ein JSON wiedergeben, und es gab es nicht jedes Mal gleich wieder
 * (zweimal 42 von 43, mit verschiedenen roten Pruefungen). Gemessen werden die
 * Arten, nicht das Modell: die Abnahme stellt `texte` und `beleg` ueber den
 * Weg des Administrators auf ein externes Modell um, und das ist diese Route.
 * Sie antwortet, was im Auftrag zwischen `<<<` und `>>>` steht; ohne Marke
 * (die Synthese am Ende) die Ergebnisse der Schritte. Der Weg durch das Geraet
 * (Rolle, Vertrag, Erkennung, Freigabe) bleibt der echte.
 *
 * Die Pfade sieht sie OHNE `/apps/<id>/api`; Traefik schneidet ab.
 */

const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const VERSION = process.env.PROBE_VERSION || '?';
const API_URL = process.env.ARASUL_API_URL || '';
const API_SCHLUESSEL = process.env.ARASUL_API_SCHLUESSEL || '';
const TOKEN = process.env.ARASUL_ABSCHLUSS_TOKEN || '';
const LANGSAM_MS = 8000;

// Zustand der Abschluss-Route (im Speicher: ein Neustart der App leert ihn, die
// Abnahme startet die App nicht neu).
let modus = 'ok';
const empfangen = new Map(); // lauf -> { body, aufrufe, angenommen, schluessel, route }
const abgewiesen = { ohne_token: 0 };

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

/** Die feste Antwort auf den letzten Auftrag (siehe Kopf). */
function festeAntwort(nachrichten) {
  const auftraege = (Array.isArray(nachrichten) ? nachrichten : [])
    .filter(n => n && n.role === 'user')
    .map(n => (typeof n.content === 'string' ? n.content : JSON.stringify(n.content)));
  const letzter = auftraege[auftraege.length - 1] || '';
  const treffer = /<<<([\s\S]*?)>>>/.exec(letzter);
  if (treffer) {
    return treffer[1].trim();
  }
  const schritte = letzter.split('--- Ergebnisse der Schritte (in Reihenfolge) ---')[1];
  return schritte ? schritte.trim().replace(/\s*\n\s*/g, ' ') : 'Fertig.';
}

const ARGUMENTE = {
  buch: p => ({ thema: p.get('thema') || 'Wartung' }),
  ohne: p => ({ thema: p.get('thema') || 'Wartung' }),
  beleg: p => ({ datum: p.get('datum') || '' }),
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

  if (pfad === '/v1/chat/completions' && anfrage.method === 'POST') {
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
        {
          index: 0,
          message: { role: 'assistant', content: festeAntwort(leib.messages) },
          finish_reason: 'stop',
        },
      ],
    });
    return;
  }

  if (pfad.startsWith('/abschluss/') && anfrage.method === 'POST') {
    const text = await lies(anfrage);
    if (!TOKEN || anfrage.headers.authorization !== `Bearer ${TOKEN}`) {
      abgewiesen.ohne_token += 1;
      sende(antwort, 401, { fehler: 'Das ist nicht das Geraet' });
      return;
    }
    let leib = null;
    try {
      leib = JSON.parse(text);
    } catch {
      sende(antwort, 400, { fehler: 'Kein JSON' });
      return;
    }
    const lauf = String(leib.lauf);
    const eintrag = empfangen.get(lauf) || {
      body: null,
      aufrufe: 0,
      angenommen: 0,
      schluessel: null,
      route: pfad,
    };
    eintrag.aufrufe += 1;
    eintrag.schluessel = anfrage.headers['idempotency-key'] || null;
    empfangen.set(lauf, eintrag);
    if (modus === '503') {
      sende(antwort, 503, { fehler: 'Probe: absichtlich nicht bereit' });
      return;
    }
    if (modus === 'haengt') {
      return; // keine Antwort; das Geraet gibt nach seinem Timeout auf
    }
    if (modus === 'langsam') {
      await new Promise(weiter => setTimeout(weiter, LANGSAM_MS));
    }
    if (eintrag.body === null) {
      eintrag.body = leib; // idempotent: ein Ergebnis je Lauf-Nummer
      eintrag.angenommen = 1;
    }
    sende(antwort, 200, { ok: true, lauf, doppelt: eintrag.aufrufe > 1 });
    return;
  }

  if (pfad === '/schalter' && anfrage.method === 'POST') {
    const m = url.searchParams.get('modus') || '';
    if (!['ok', '503', 'langsam', 'haengt'].includes(m)) {
      sende(antwort, 400, { fehler: 'ok | 503 | langsam | haengt' });
      return;
    }
    modus = m;
    sende(antwort, 200, { modus });
    return;
  }

  if (pfad === '/empfangen') {
    const eintrag = empfangen.get(url.searchParams.get('lauf') || '');
    sende(antwort, 200, eintrag || { body: null, aufrufe: 0, angenommen: 0 });
    return;
  }

  if (pfad === '/info') {
    sende(antwort, 200, { modus, token_gesetzt: TOKEN.length >= 32, ...abgewiesen });
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
