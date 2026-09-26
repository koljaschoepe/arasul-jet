/**
 * Die Proben-App der Abnahme „Auslesen und Flows im Protokoll" (J35,
 * 26.09.2026).
 *
 * Ein Messgeraet und keine Vorlage. Sie tut, was die Kanzlei-App der
 * App-Bau-Probe tat, an den zwei Stellen, an denen es schiefging:
 *
 *   POST /beleg?text=…&warten=<s>&modell=<id>
 *        liest einen Beleg ueber `document/extract-structured` aus. Kommt 202,
 *        holt sie das Ergebnis auf dem Weg ab, den das Geraet nennt
 *        (`abholen`), statt die Datei ein zweites Mal zu schicken -- so, wie
 *        der Kontrakt es unter `warten` sagt. Antwortet mit dem ersten und dem
 *        letzten Code, damit die Abnahme beide sieht.
 *   POST /einreichen?vorgang=…
 *        startet den Flow `satz` mit dem Menschen aus X-Arasul-User als
 *        Einreicher; nach der Freigabe schreibt der Flow einen Satz mit dem
 *        Modell.
 *   GET  /lauf?lauf=<id>
 *        Status und Ergebnis des Laufs.
 *
 * Die Pfade sieht sie OHNE `/apps/probe-auslesen/api`; Traefik schneidet ab.
 */

const http = require('http');

const PORT = Number(process.env.PORT || 8080);
const VERSION = process.env.PROBE_VERSION || '?';
const API_URL = process.env.ARASUL_API_URL || '';
const API_SCHLUESSEL = process.env.ARASUL_API_SCHLUESSEL || '';
// So lange holt sie hoechstens ab; danach ist es ein Befund und kein Warten.
const ABHOLEN_MS = 15 * 60 * 1000;

function ausUtf8(wert) {
  return wert ? Buffer.from(wert, 'latin1').toString('utf8') : null;
}

function sende(antwort, code, inhalt) {
  antwort.statusCode = code;
  antwort.setHeader('content-type', 'application/json; charset=utf-8');
  antwort.end(JSON.stringify(inhalt));
}

async function alsJson(antwort) {
  try {
    return await antwort.json();
  } catch {
    return null;
  }
}

async function beleg(anfrage, q) {
  const beginn = Date.now();
  const form = new FormData();
  const text = q.get('text') || 'Rechnung Nr. 1 ueber 12,00 EUR';
  form.append('file', new Blob([text], { type: 'text/plain' }), 'beleg.txt');
  form.append('schema', JSON.stringify({ betrag: 'number', nummer: 'string' }));
  if (q.get('warten')) {
    form.append('timeout_seconds', q.get('warten'));
  }
  if (q.get('modell')) {
    form.append('model', q.get('modell'));
  }
  const kopf = { 'x-api-key': API_SCHLUESSEL };
  if (anfrage.headers['x-arasul-user']) {
    kopf['x-arasul-user'] = anfrage.headers['x-arasul-user'];
  }
  const erste = await fetch(`${API_URL}/document/extract-structured`, {
    method: 'POST',
    headers: kopf,
    body: form,
    signal: AbortSignal.timeout(ABHOLEN_MS),
  });
  let rumpf = await alsJson(erste);
  const erst = erste.status;
  let ende = erst;
  let abgeholt = 0;

  // 202: der Auftrag rechnet weiter. Abholen, nicht noch einmal schicken.
  while (ende === 202 && rumpf?.abholen && Date.now() - beginn < ABHOLEN_MS) {
    await new Promise(r => setTimeout(r, 2000));
    const weiter = await fetch(`${API_URL}/${rumpf.abholen}`, {
      headers: { 'x-api-key': API_SCHLUESSEL },
      signal: AbortSignal.timeout(30000),
    });
    abgeholt += 1;
    ende = weiter.status;
    const neu = await alsJson(weiter);
    rumpf = ende === 202 ? { ...neu, abholen: neu?.abholen ?? rumpf.abholen } : neu;
  }

  return {
    erst,
    ende,
    abgeholt,
    job_id: rumpf?.job_id ?? null,
    modell: rumpf?.model ?? null,
    daten: rumpf?.data ?? null,
    fehler: typeof rumpf?.error === 'string' ? rumpf.error : (rumpf?.error?.message ?? null),
    dauer_ms: Date.now() - beginn,
  };
}

async function geraet(verb, pfad, leib) {
  const antwort = await fetch(`${API_URL}${pfad}`, {
    method: verb,
    headers: {
      'x-api-key': API_SCHLUESSEL,
      ...(leib ? { 'content-type': 'application/json' } : {}),
    },
    body: leib ? JSON.stringify(leib) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  return { code: antwort.status, rumpf: await alsJson(antwort) };
}

const server = http.createServer(async (anfrage, antwort) => {
  const url = new URL(anfrage.url, 'http://app');
  const pfad = url.pathname;
  try {
    if (pfad === '/gesund') {
      sende(antwort, 200, { ok: true, version: VERSION });
      return;
    }
    if (pfad === '/beleg' && anfrage.method === 'POST') {
      const ergebnis = await beleg(anfrage, url.searchParams);
      sende(antwort, 200, ergebnis);
      return;
    }
    if (pfad === '/einreichen' && anfrage.method === 'POST') {
      const einreicher = ausUtf8(anfrage.headers['x-arasul-user']);
      const { code, rumpf } = await geraet('POST', '/flows/satz/run', {
        args: { vorgang: url.searchParams.get('vorgang') || 'A-1' },
        wait_for_result: false,
        ...(einreicher ? { einreicher } : {}),
      });
      sende(antwort, code || 502, { antwort: code, lauf: rumpf?.run_id ?? null, einreicher });
      return;
    }
    if (pfad === '/lauf') {
      const lauf = url.searchParams.get('lauf') || '';
      const { code, rumpf } = await geraet('GET', `/flows/runs/${encodeURIComponent(lauf)}`);
      sende(antwort, code === 200 ? 200 : 502, {
        antwort: code,
        status: rumpf?.status ?? null,
        ergebnis: rumpf?.result ?? null,
      });
      return;
    }
    sende(antwort, 404, { fehler: `Die Proben-App kennt ${pfad} nicht` });
  } catch (fehler) {
    sende(antwort, 502, { fehler: fehler.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  process.stdout.write(`Proben-App ${VERSION} hoert auf ${PORT}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
