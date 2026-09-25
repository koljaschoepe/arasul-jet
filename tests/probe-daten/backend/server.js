/**
 * Die Proben-App der Abnahme „Daten und vier Augen" (J35, 25.09.2026).
 *
 * Sie ist ein Messgeraet und keine Vorlage. Sie beantwortet zwei Fragen, an
 * denen eine Fach-App verkaeuflich wird oder nicht:
 *
 *   Bleiben ihre Daten?   /eintrag, /eintraege schreiben und lesen die
 *                         Datenbank aus ARASUL_DB_URL -- der eine Ort, den der
 *                         Kontrakt dafuer nennt. /datei legt dagegen eine
 *                         Datei in den Container, der das naechste Einspielen
 *                         nicht ueberlebt. Beides wird gemessen, weil das Kit
 *                         beides behauptet hat.
 *
 *   Wer gibt frei?        /flow startet den Flow `freigabe` mit dem Menschen
 *                         aus X-Arasul-User als Einreicher und der Regel aus
 *                         der Adresse (`ohne_einreicher=1`,
 *                         `entscheider=admin` oder `konten=a,b`).
 *
 * Die Pfade sieht sie OHNE `/apps/probe-daten/api`; Traefik schneidet ab.
 */

const http = require('http');
const fs = require('fs');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 8080);
const VERSION = process.env.PROBE_VERSION || '?';
const API_URL = process.env.ARASUL_API_URL || '';
const API_SCHLUESSEL = process.env.ARASUL_API_SCHLUESSEL || '';
const DB_URL = process.env.ARASUL_DB_URL || '';
const DATEI = '/tmp/probe-marke.txt';

const pool = DB_URL ? new Pool({ connectionString: DB_URL, max: 2 }) : null;
// Nach einem Weg zurueck trennt das Geraet die Verbindungen; der Pool baut
// neue auf. Ohne diesen Zuhoerer beendete ein getrennter Leerlauf-Client den
// Prozess.
if (pool) {
  pool.on('error', () => {});
}

/** Das Schema legt die App selbst an -- die Datenbank beginnt leer. */
async function schema() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS eintraege (
       id SERIAL PRIMARY KEY,
       text TEXT NOT NULL,
       version TEXT NOT NULL,
       am TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
}

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

/** Die Freigaberegel aus der Adresse, in der Form des Kontraktes. */
function regelAus(q) {
  const regel = {};
  if (q.get('ohne_einreicher') === '1') {
    regel.ohne_einreicher = true;
  }
  if (q.get('entscheider') === 'admin') {
    regel.entscheider = { rolle: 'admin' };
  } else if (q.get('konten')) {
    regel.entscheider = { konten: q.get('konten').split(',').filter(Boolean) };
  }
  return Object.keys(regel).length ? regel : null;
}

const server = http.createServer(async (anfrage, antwort) => {
  antwort.setHeader('content-type', 'application/json; charset=utf-8');
  const url = new URL(anfrage.url, 'http://app');
  const pfad = url.pathname;
  const q = url.searchParams;

  if (pfad === '/gesund') {
    sende(antwort, 200, { ok: true, version: VERSION });
    return;
  }

  if (pfad === '/eintrag' || pfad === '/eintraege') {
    if (!pool) {
      sende(antwort, 503, { fehler: 'ARASUL_DB_URL fehlt' });
      return;
    }
    try {
      await schema();
      if (anfrage.method === 'POST') {
        const { rows } = await pool.query(
          'INSERT INTO eintraege (text, version) VALUES ($1, $2) RETURNING id',
          [q.get('text') || 'ohne Text', VERSION]
        );
        sende(antwort, 201, { id: rows[0].id, version: VERSION });
        return;
      }
      const { rows } = await pool.query('SELECT text, version FROM eintraege ORDER BY id');
      sende(antwort, 200, { version: VERSION, eintraege: rows.map(r => r.text) });
    } catch (fehler) {
      sende(antwort, 500, { fehler: fehler.message, code: fehler.code || null });
    }
    return;
  }

  // Die Gegenprobe: eine Datei im Container. Der Kontrakt sagt, sie ueberlebt
  // das naechste Einspielen nicht.
  if (pfad === '/datei') {
    if (anfrage.method === 'POST') {
      fs.writeFileSync(DATEI, q.get('text') || 'marke');
      sende(antwort, 201, { geschrieben: true });
      return;
    }
    sende(antwort, 200, { text: fs.existsSync(DATEI) ? fs.readFileSync(DATEI, 'utf8') : null });
    return;
  }

  if (pfad === '/flow') {
    if (anfrage.method === 'POST') {
      const einreicher = ausUtf8(anfrage.headers['x-arasul-user']);
      const regel = regelAus(q);
      const { code, rumpf } = await ruf(
        'POST',
        `/flows/${encodeURIComponent(q.get('flow') || 'freigabe')}/run`,
        {
          args: { woche: q.get('woche') || '39' },
          wait_for_result: false,
          ...(einreicher ? { einreicher } : {}),
          ...(regel ? { freigabe: regel } : {}),
        }
      );
      // Der Code des Geraets geht UNVERAENDERT hinaus: die Abnahme misst an
      // ihm, ob eine Regel abgewiesen wurde (400) oder ein Lauf entstand (202).
      sende(antwort, code || 502, {
        antwort: code,
        lauf: rumpf?.run_id ?? null,
        einreicher,
        fehler: rumpf?.error ?? null,
      });
      return;
    }
    const lauf = q.get('lauf');
    const { code, rumpf } = await ruf('GET', `/flows/runs/${encodeURIComponent(lauf || '')}`);
    sende(antwort, code === 200 ? 200 : 502, {
      antwort: code,
      status: rumpf?.status ?? null,
      fehler: rumpf?.error ?? null,
    });
    return;
  }

  if (pfad === '/freigaben') {
    const lauf = q.get('lauf');
    const { code, rumpf } = await ruf(
      'GET',
      `/freigaben${lauf ? `?lauf=${encodeURIComponent(lauf)}` : ''}`
    );
    sende(antwort, code === 200 ? 200 : 502, {
      antwort: code,
      freigaben: rumpf?.freigaben ?? null,
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
