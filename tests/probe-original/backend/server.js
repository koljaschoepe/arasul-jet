/**
 * Die Proben-App der Abnahme „Original lesen" (M5, 06.10.2026, Kontrakt 14).
 *
 * Ein Messgeraet und keine Vorlage. Es misst, dass das Modell eines
 * erkennenden Schritts das Original liest: der Auftrag nennt weder Lieferant
 * noch Betrag noch Datum, also koennen sie nur aus dem Bild kommen.
 *
 *   GET  /belege/2026-0815.png    der Beispielbeleg als PNG
 *   GET  /belege/2026-0815.pdf    derselbe Beleg als PDF (zwei Seiten)
 *   GET  /belege/<sonst>          404: das Original fehlt
 *   GET  /belege/gross.png        ein PNG ueber der Obergrenze des Geraets
 *   POST /starten?original=<pfad>&titel=<text>   startet `beleg`, antwortet { lauf }
 *   GET  /lauf?lauf=<id>          { status, ergebnis, titel, freigabe } aus dem Geraet
 *
 * Wer das Original holt, steht im Protokoll dieser App (`/abrufe`): das Geraet
 * ruft mit `X-Arasul-User` des Menschen des Laufs, und die Abnahme prueft das.
 *
 * Die Pfade sieht sie OHNE `/apps/<id>/api`; Traefik schneidet ab, und das
 * Geraet ruft den Container direkt.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = Number(process.env.PORT || 8080);
const VERSION = process.env.PROBE_VERSION || '?';
const API_URL = process.env.ARASUL_API_URL || '';
const API_SCHLUESSEL = process.env.ARASUL_API_SCHLUESSEL || '';

const PNG = fs.readFileSync(path.join(__dirname, 'beleg.png'));
const PDF = fs.readFileSync(path.join(__dirname, 'beleg.pdf'));
// 11 MB: ueber den 10 MB, die das Geraet holt. Ein gueltiger PNG-Kopf, damit
// die Groesse der Grund ist und nicht die Art.
const GROSS = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(11 * 1024 * 1024, 0)]);

/** Wer welches Original wann geholt hat (hoechstens 50). */
const abrufe = [];

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

  const beleg = /^\/belege\/([A-Za-z0-9-]{1,40})\.(png|pdf)$/.exec(pfad);
  if (beleg) {
    abrufe.push({
      pfad,
      benutzer: ausUtf8(anfrage.headers['x-arasul-user']),
      lauf: anfrage.headers['x-arasul-lauf'] || null,
      am: new Date().toISOString(),
    });
    abrufe.splice(0, Math.max(0, abrufe.length - 50));
    const [, nr, endung] = beleg;
    if (nr === 'gross' && endung === 'png') {
      antwort.setHeader('content-type', 'image/png');
      antwort.end(GROSS);
      return;
    }
    if (nr !== '2026-0815') {
      sende(antwort, 404, { fehler: `Den Beleg ${nr} gibt es nicht` });
      return;
    }
    antwort.setHeader('content-type', endung === 'png' ? 'image/png' : 'application/pdf');
    antwort.end(endung === 'png' ? PNG : PDF);
    return;
  }

  if (pfad === '/abrufe') {
    sende(antwort, 200, { data: abrufe });
    return;
  }

  if (pfad === '/starten' && anfrage.method === 'POST') {
    const einreicher = ausUtf8(anfrage.headers['x-arasul-user']);
    const titel = url.searchParams.get('titel');
    const { code, rumpf } = await ruf('POST', '/flows/beleg/run', {
      args: { original: url.searchParams.get('original') || '' },
      wait_for_result: false,
      ...(einreicher ? { einreicher } : {}),
      ...(titel ? { titel } : {}),
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
      titel: rumpf?.titel ?? null,
      schritte: rumpf?.schritte ?? null,
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
