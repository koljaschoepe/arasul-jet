/**
 * Die Proben-App der Abnahme „Korrekturfelder" (M5, 04.10.2026).
 *
 * Ein Messgeraet und keine Vorlage. Drei Aufgaben:
 *
 *   POST /starten?beleg=<nr>&datum=<text>&unsicher=<text>  startet `beleg`, antwortet { lauf }
 *   GET  /lauf?lauf=<id>          { status, freigabe } aus dem Geraet
 *   GET  /belege/<nr>.svg         das Original, das die Freigabe links zeigt
 *   POST /v1/chat/completions     ein FESTES Modell (s. u.)
 *
 * WARUM EIN FESTES MODELL. Die Abnahme misst die Freigabe, nicht ein Modell.
 * Bis zum 04.10.2026 liess sie das echte Modell ein JSON wiedergeben, und es
 * gab es nicht jedes Mal gleich wieder (zweimal 42 von 43, mit verschiedenen
 * roten Pruefungen). Die Abnahme stellt den Flow deshalb ueber den regulaeren
 * Weg des Administrators auf ein externes Modell um
 * (`PUT /api/apps/:id/flows/beleg/modell`, `extern.basis_url` =
 * `http://arasul-app-<id>-live:8080/v1`), und das ist diese Route. Sie
 * antwortet, was im Auftrag zwischen `<<<` und `>>>` steht: ein JSON-Objekt
 * unveraendert, sonst eingewickelt als `{"buchung": …}`. Ohne Marke gibt sie
 * die Ergebnisse der Schritte zurueck (die Synthese am Ende). Kein Zufall,
 * keine GPU, dieselbe Antwort bei jedem Lauf; der Weg durch das Geraet
 * (Rolle, Ergebnis-Vertrag, Erkennung, Freigabe) ist der echte.
 *
 * Die Pfade sieht sie OHNE `/apps/<id>/api`; Traefik schneidet ab. Das Backend
 * des Geraets ruft `/v1/...` direkt im Netz der Apps.
 */

const http = require('http');
const BELEG_PNG = require('fs').readFileSync(require('path').join(__dirname, 'beleg.png'));

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
    // Mit einem Bild (Kontrakt 14) ist `content` eine Liste von Teilen; der
    // Auftrag steht im Textteil.
    .map(n =>
      typeof n.content === 'string'
        ? n.content
        : Array.isArray(n.content)
          ? n.content
              .filter(t => t && t.type === 'text')
              .map(t => t.text)
              .join('\n')
          : JSON.stringify(n.content)
    );
  const letzter = auftraege[auftraege.length - 1] || '';
  const treffer = /<<<([\s\S]*?)>>>/.exec(letzter);
  if (treffer) {
    const innen = treffer[1].trim();
    try {
      const objekt = JSON.parse(innen);
      if (objekt && typeof objekt === 'object' && !Array.isArray(objekt)) {
        return JSON.stringify(objekt);
      }
    } catch {
      // kein JSON: einwickeln
    }
    return JSON.stringify({ buchung: `Gebucht mit ${innen.replace(/\s*\n\s*/g, ', ')}` });
  }
  const schritte = letzter.split('--- Ergebnisse der Schritte (in Reihenfolge) ---')[1];
  return schritte ? `Ergebnis der Probe:${schritte.trim().replace(/\s*\n\s*/g, ' ')}` : 'Fertig.';
}

/**
 * Das Original: ein Beleg als SVG, auf dem das Datum unleserlich ist. Ein
 * Messgeraet braucht kein Foto, sondern etwas, das die Ansicht zeigen und
 * zoomen kann.
 */
function beleg(nr) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="420" height="560" viewBox="0 0 420 560">
  <rect width="420" height="560" fill="#fbfaf7" stroke="#c9c4b8"/>
  <text x="32" y="64" font-family="sans-serif" font-size="26" font-weight="700" fill="#222">Muster GmbH</text>
  <text x="32" y="92" font-family="sans-serif" font-size="14" fill="#555">Musterstrasse 1, 12345 Musterstadt</text>
  <text x="32" y="150" font-family="sans-serif" font-size="18" fill="#222">Beleg ${nr}</text>
  <text x="32" y="190" font-family="sans-serif" font-size="16" fill="#222">Datum:</text>
  <text x="110" y="190" font-family="sans-serif" font-size="16" fill="#bbb" transform="rotate(-4 110 190)">0?.1?.2026</text>
  <line x1="32" y1="230" x2="388" y2="230" stroke="#c9c4b8"/>
  <text x="32" y="270" font-family="sans-serif" font-size="16" fill="#222">Buerobedarf</text>
  <text x="300" y="270" font-family="sans-serif" font-size="16" fill="#222">10,50</text>
  <text x="32" y="300" font-family="sans-serif" font-size="16" fill="#222">Porto</text>
  <text x="300" y="300" font-family="sans-serif" font-size="16" fill="#222">2,00</text>
  <line x1="32" y1="330" x2="388" y2="330" stroke="#c9c4b8"/>
  <text x="32" y="370" font-family="sans-serif" font-size="20" font-weight="700" fill="#222">Summe</text>
  <text x="290" y="370" font-family="sans-serif" font-size="20" font-weight="700" fill="#222">12,50 EUR</text>
</svg>
`;
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

  // Seit Kontrakt 14 liest das Geraet das Original und gibt es dem Modell: ein
  // SVG liest kein Bildmodell. Dasselbe Blatt als PNG (gerendert aus dem SVG
  // darunter, Beleg 4711); das SVG bleibt fuer die Ansicht.
  if (/^\/belege\/[A-Za-z0-9-]{1,40}\.png$/.test(pfad)) {
    antwort.setHeader('content-type', 'image/png');
    antwort.statusCode = 200;
    antwort.end(BELEG_PNG);
    return;
  }

  const original = /^\/belege\/([A-Za-z0-9-]{1,40})\.svg$/.exec(pfad);
  if (original) {
    antwort.setHeader('content-type', 'image/svg+xml; charset=utf-8');
    antwort.statusCode = 200;
    antwort.end(beleg(original[1]));
    return;
  }

  if (pfad === '/starten' && anfrage.method === 'POST') {
    const einreicher = ausUtf8(anfrage.headers['x-arasul-user']);
    const { code, rumpf } = await ruf('POST', '/flows/beleg/run', {
      args: {
        beleg: url.searchParams.get('beleg') || '4711',
        datum: url.searchParams.get('datum') || '',
        unsicher: url.searchParams.get('unsicher') || '',
      },
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
      ergebnis: rumpf?.result ?? null,
      freigabe: rumpf?.freigabe ?? null,
    });
    return;
  }

  if (pfad === '/freigaben') {
    // Was die App ueber ihre Freigaben weiss (mit ihrem Schluessel): Felder,
    // Korrekturen, Original. Die Abnahme vergleicht es mit der Ansicht.
    const lauf = url.searchParams.get('lauf');
    const { code, rumpf } = await ruf(
      'GET',
      `/freigaben${lauf ? `?lauf=${encodeURIComponent(lauf)}` : ''}`
    );
    sende(antwort, code === 200 ? 200 : 502, { antwort: code, data: rumpf?.freigaben ?? null });
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
