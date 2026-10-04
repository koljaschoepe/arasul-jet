/**
 * Die Proben-App der Abnahme „Live schalten mit Sicherung" (M5, 04.10.2026).
 *
 * Ein Messgeraet, keine Vorlage. Sie tut beim Start, was eine Fach-App mit
 * einer neuen Fassung tut: ihre Strukturaenderung auf der eigenen Datenbank
 * (ARASUL_DB_URL). Welche, sagt PROBE_STRUKTUR aus dem Manifest:
 *
 *   1   legt `eintraege` an (die erste Fassung).
 *   2   KAPUTT AUF LIVE-DATEN: legt die Spalte `kostenstelle` und die Tabelle
 *       `halb_angelegt` an -- jedes fuer sich, OHNE Transaktion -- und will
 *       dann `text` eindeutig machen. Im Test (lauter verschiedene Texte)
 *       gelingt das, im Livestand mit einem doppelten Text scheitert es
 *       mittendrin. Dann beendet sich der Prozess mit Exit-Code 1, wie der
 *       Kontrakt es verlangt, und die halbe Aenderung bleibt in der Datenbank.
 *   3   die richtige Fassung von 2: `kostenstelle` in einer Transaktion,
 *       keine Eindeutigkeit. Gelingt auf jeder Datenbank.
 *
 * Die Pfade sieht sie OHNE `/apps/<id>/api`; Traefik schneidet ab.
 */

const http = require('http');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT || 8080);
const VERSION = process.env.PROBE_VERSION || '?';
const STRUKTUR = process.env.PROBE_STRUKTUR || '1';
const pool = new Pool({ connectionString: process.env.ARASUL_DB_URL, max: 2 });
pool.on('error', () => {});

async function strukturaenderung() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS eintraege (
       id SERIAL PRIMARY KEY,
       text TEXT NOT NULL,
       am TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  if (STRUKTUR === '2') {
    await pool.query('ALTER TABLE eintraege ADD COLUMN IF NOT EXISTS kostenstelle TEXT');
    await pool.query('CREATE TABLE IF NOT EXISTS halb_angelegt (id SERIAL PRIMARY KEY)');
    await pool.query('ALTER TABLE eintraege ADD CONSTRAINT eintraege_text_eindeutig UNIQUE (text)');
  }
  if (STRUKTUR === '3') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE eintraege ADD COLUMN IF NOT EXISTS kostenstelle TEXT');
      await client.query('COMMIT');
    } catch (fehler) {
      await client.query('ROLLBACK');
      throw fehler;
    } finally {
      client.release();
    }
  }
}

function sende(antwort, code, inhalt) {
  antwort.statusCode = code;
  antwort.setHeader('content-type', 'application/json; charset=utf-8');
  antwort.end(JSON.stringify(inhalt));
}

const server = http.createServer(async (anfrage, antwort) => {
  const url = new URL(anfrage.url, 'http://app');
  const pfad = url.pathname;
  try {
    if (pfad === '/gesund') {
      await pool.query('SELECT 1');
      sende(antwort, 200, { ok: true, version: VERSION });
      return;
    }
    if (pfad === '/eintrag' && anfrage.method === 'POST') {
      const { rows } = await pool.query('INSERT INTO eintraege (text) VALUES ($1) RETURNING id', [
        url.searchParams.get('text') || 'ohne Text',
      ]);
      sende(antwort, 201, { id: rows[0].id, version: VERSION });
      return;
    }
    if (pfad === '/eintraege') {
      const { rows } = await pool.query('SELECT text FROM eintraege ORDER BY id');
      sende(antwort, 200, { version: VERSION, eintraege: rows.map(r => r.text) });
      return;
    }
    // Was die Strukturaenderung hinterlassen hat: Tabellen und Spalten von `eintraege`.
    if (pfad === '/struktur') {
      const tabellen = await pool.query(
        `SELECT table_name FROM information_schema.tables
          WHERE table_schema = 'public' ORDER BY table_name`
      );
      const spalten = await pool.query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'eintraege' ORDER BY ordinal_position`
      );
      sende(antwort, 200, {
        version: VERSION,
        tabellen: tabellen.rows.map(r => r.table_name),
        spalten: spalten.rows.map(r => r.column_name),
      });
      return;
    }
    sende(antwort, 404, { fehler: `Die Proben-App kennt ${pfad} nicht` });
  } catch (fehler) {
    sende(antwort, 500, { fehler: fehler.message, code: fehler.code || null });
  }
});

strukturaenderung().then(
  () => {
    server.listen(PORT, '0.0.0.0', () => {
      process.stdout.write(`Proben-App ${VERSION} (Struktur ${STRUKTUR}) hoert auf ${PORT}\n`);
    });
  },
  fehler => {
    process.stderr.write(
      `Strukturaenderung ${STRUKTUR} von ${VERSION} gescheitert: ${fehler.message}\n`
    );
    process.exit(1);
  }
);

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
