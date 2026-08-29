/**
 * Die Datenbank je App (Phase H7).
 *
 * Gemessen wird, was diese Datei entscheidet, und nicht, was Postgres tut: der
 * NAME (er steht in vier Stellen und darf nie zweideutig werden), die
 * IDEMPOTENZ (derselbe Aufruf legt an, findet vor und heilt), und dass beim
 * Aufraeumen ueber den PRAEFIX gesucht wird und nicht ueber die Tabelle.
 */

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const db = require('../../src/database');
const appDatenbank = require('../../src/services/app/appDatenbank');

beforeEach(() => {
  db.query.mockReset();
  process.env.JWT_SECRET = 'test-geheimnis-fuer-die-verschluesselung';
  // Der Wirt kommt aus der Umgebung: im Container `postgres-db`, in der
  // Testumgebung steht `localhost` in der `.env` des Entwicklers.
  process.env.POSTGRES_HOST = 'postgres-db';
});

/** Die Antworten auf `pg_roles` / `pg_database`, in der Reihenfolge der Fragen. */
function clusterSagt({ rolle, datenbank }) {
  db.query.mockImplementation(async sql => {
    if (sql.includes('pg_roles')) {
      return { rows: rolle ? [{ rolname: 'x' }] : [] };
    }
    if (sql.includes('pg_database')) {
      return { rows: datenbank ? [{ datname: 'x' }] : [] };
    }
    return { rows: [] };
  });
}

describe('Der Name', () => {
  it('setzt sich aus Praefix, Kennung und Stand zusammen', () => {
    expect(appDatenbank.namenFuer('urlaub', 'test')).toBe('arasul_app_urlaub_test');
    expect(appDatenbank.namenFuer('urlaub', 'live')).toBe('arasul_app_urlaub_live');
  });

  it('macht aus dem Bindestrich einen Unterstrich', () => {
    // In einem unquotierten Bezeichner ist `-` nicht erlaubt. Eindeutig ist
    // das, weil eine App-Kennung selbst keinen Unterstrich tragen darf.
    expect(appDatenbank.namenFuer('mein-antrag', 'live')).toBe('arasul_app_mein_antrag_live');
  });

  it('trennt zwei Staende derselben App', () => {
    expect(appDatenbank.namenFuer('a', 'test')).not.toBe(appDatenbank.namenFuer('a', 'live'));
  });

  it('bleibt unter der Grenze von Postgres und trotzdem eindeutig', () => {
    // 63 Byte, mehr nimmt Postgres nicht. Eine abgeschnittene Kennung allein
    // waere nicht mehr eindeutig -- zwei Apps mit einer Datenbank waeren genau
    // der Fehler, gegen den diese Datei gebaut ist.
    const lang = 'a'.repeat(60);
    const eins = appDatenbank.namenFuer(`${lang}-eins`, 'live');
    const zwei = appDatenbank.namenFuer(`${lang}-zwei`, 'live');
    expect(Buffer.byteLength(eins)).toBeLessThanOrEqual(63);
    expect(eins).not.toBe(zwei);
    expect(eins).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});

describe('sorgeFuer', () => {
  it('legt Rolle und Datenbank an, wenn es sie nicht gibt', async () => {
    clusterSagt({ rolle: false, datenbank: false });
    const zugang = await appDatenbank.sorgeFuer({ appId: 'urlaub', stand: 'test' });

    const sql = db.query.mock.calls.map(([s]) => s);
    expect(sql.some(s => s.startsWith('CREATE ROLE "arasul_app_urlaub_test"'))).toBe(true);
    expect(sql.some(s => s.startsWith('CREATE DATABASE "arasul_app_urlaub_test"'))).toBe(true);
    // Ohne das darf JEDE Rolle sich mit dieser Datenbank verbinden.
    expect(sql.some(s => s.includes('REVOKE ALL ON DATABASE "arasul_app_urlaub_test"'))).toBe(true);
    expect(zugang.url).toMatch(
      /^postgresql:\/\/arasul_app_urlaub_test:[A-Za-z0-9_-]+@postgres-db:5432\/arasul_app_urlaub_test$/
    );
  });

  it('legt nichts noch einmal an, was schon dasteht', async () => {
    clusterSagt({ rolle: true, datenbank: true });
    await appDatenbank.sorgeFuer({ appId: 'urlaub', stand: 'live' });
    const sql = db.query.mock.calls.map(([s]) => s);
    expect(sql.some(s => s.startsWith('CREATE DATABASE'))).toBe(false);
    // Aber das Passwort wird gesetzt: nach einem Weg zurueck steht die Rolle
    // mit einem Zufallswert da, den niemand kennt.
    expect(sql.some(s => s.startsWith('ALTER ROLE "arasul_app_urlaub_live" PASSWORD'))).toBe(true);
  });

  it('behaelt das Passwort einer App, die es schon gab', async () => {
    // Sonst verloere jede laufende App bei jedem Einspielen den Zugang zu
    // ihren eigenen Daten: Docker startet mit `unless-stopped` neu und behaelt
    // dabei die alte Umgebung.
    clusterSagt({ rolle: false, datenbank: false });
    const erste = await appDatenbank.sorgeFuer({ appId: 'urlaub', stand: 'live' });
    const gemerkt = db.query.mock.calls.find(([s]) =>
      s.includes('INSERT INTO public.app_datenbanken')
    )[1][3];

    db.query.mockReset();
    db.query.mockImplementation(async sql => {
      if (sql.includes('SELECT passwort FROM public.app_datenbanken')) {
        return { rows: [{ passwort: gemerkt }] };
      }
      if (sql.includes('pg_roles') || sql.includes('pg_database')) {
        return { rows: [{ x: 1 }] };
      }
      return { rows: [] };
    });
    const zweite = await appDatenbank.sorgeFuer({ appId: 'urlaub', stand: 'live' });
    expect(zweite.url).toBe(erste.url);
  });

  it('das Passwort taugt fuer ein SQL-Literal und fuer eine Adresse', async () => {
    // Es steht zweimal an einer Stelle, an der ein Sonderzeichen etwas anderes
    // bedeutet: im Literal von `ALTER ROLE` und in `postgres://…`.
    clusterSagt({ rolle: false, datenbank: false });
    const zugang = await appDatenbank.sorgeFuer({ appId: 'urlaub', stand: 'test' });
    const wort = zugang.url.split('//')[1].split(':')[1].split('@')[0];
    expect(wort).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });
});

describe('umgebungFuer', () => {
  it('gibt EINEN Wert, den jeder Treiber versteht', () => {
    expect(appDatenbank.umgebungFuer({ url: 'postgresql://a:b@c:5432/d' })).toEqual({
      ARASUL_DB_URL: 'postgresql://a:b@c:5432/d',
    });
  });

  it('gibt nichts, wo es keine Datenbank gibt (App ohne Backend)', () => {
    expect(appDatenbank.umgebungFuer(null)).toEqual({});
  });
});

describe('entferneAlle', () => {
  it('fragt den Cluster nach dem Praefix und nicht die Tabelle', async () => {
    // Der Werksreset leert `apps`, und die Zeile in `app_datenbanken` faellt
    // mit ihr. Eine Aufraeumung, die danach die Tabelle fragte, faende nichts
    // mehr und liesse jede App-Datenbank stehen.
    db.query.mockImplementation(async (sql, werte) => {
      if (sql.includes('FROM pg_database WHERE datname LIKE')) {
        expect(werte).toEqual(['arasul_app_%']);
        return { rows: [{ datname: 'arasul_app_urlaub_live' }] };
      }
      if (sql.includes('FROM pg_roles WHERE rolname LIKE')) {
        return { rows: [] };
      }
      if (sql.includes('pg_database')) {
        return { rows: [{ x: 1 }] };
      }
      if (sql.includes('pg_roles')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    const anzahl = await appDatenbank.entferneAlle();
    expect(anzahl).toBe(1);
    const sql = db.query.mock.calls.map(([s]) => s);
    expect(sql.some(s => s.includes('DROP DATABASE IF EXISTS "arasul_app_urlaub_live"'))).toBe(
      true
    );
    expect(sql.some(s => s.includes('app_datenbanken'))).toBe(false);
  });

  it('faellt nicht ueber einen Namen, der nicht von hier kommt', async () => {
    db.query.mockImplementation(async sql => {
      if (sql.includes('FROM pg_database WHERE datname LIKE')) {
        return { rows: [{ datname: 'arasul_app_x"; DROP DATABASE arasul_db; --' }] };
      }
      return { rows: [] };
    });
    await expect(appDatenbank.entferneAlle()).rejects.toThrow('Unbrauchbarer Datenbankname');
  });
});
