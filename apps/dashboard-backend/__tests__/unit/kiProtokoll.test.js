/**
 * Das Protokoll der Modellaufrufe (J35, Migration 187).
 *
 * Gemessen wird, was der Auftrag verlangt: je Aufruf eine Zeile mit App,
 * Mensch, Modell und Dauer, OHNE Inhalt -- und dass die Zeile VOR dem Aufruf
 * steht, damit es keinen Aufruf ohne Zeile gibt.
 */

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/llm/llmJobService', () => ({ getJob: jest.fn() }));

const crypto = require('crypto');
const db = require('../../src/database');
const llmJobService = require('../../src/services/llm/llmJobService');
const kiProtokoll = require('../../src/services/app/kiProtokoll');

const APP_SCHLUESSEL = {
  id: 7,
  name: 'app faktum/live',
  userId: 1,
  appId: 'faktum',
  stand: 'live',
};
const MENSCHEN_SCHLUESSEL = { id: 8, name: 'Zapier', userId: 1, appId: null, stand: null };

/** Eine Datenbank, die nach dem Text der Abfrage antwortet. */
function datenbank({ mitglied = true } = {}) {
  db.query.mockImplementation(async sql => {
    if (sql.includes('FROM public.app_members')) {
      return { rows: mitglied ? [{ id: 5, username: 'anna' }] : [] };
    }
    if (sql.includes('FROM public.admin_users')) return { rows: [{ id: 1, username: 'admin' }] };
    if (sql.includes('INSERT INTO public.ki_aufrufe')) return { rows: [{ id: 42 }] };
    return { rows: [] };
  });
}

function aufrufe(teil) {
  return db.query.mock.calls.filter(([sql]) => sql.includes(teil));
}

beforeEach(() => {
  jest.clearAllMocks();
  datenbank();
});

describe('einreicherAus', () => {
  test('das Feld vor der Kopfzeile, die Kopfzeile als UTF-8 aus latin1', () => {
    expect(kiProtokoll.einreicherAus({ body: { einreicher: ' anna ' }, headers: {} })).toBe('anna');
    const kopf = Buffer.from('jürgen', 'utf8').toString('latin1');
    expect(kiProtokoll.einreicherAus({ body: {}, headers: { 'x-arasul-user': kopf } })).toBe(
      'jürgen'
    );
    expect(kiProtokoll.einreicherAus({ headers: {} })).toBeNull();
    expect(kiProtokoll.einreicherAus({ body: { user: 'anna' }, headers: {} }, 'user')).toBe('anna');
  });
});

describe('werFragt', () => {
  test('ein App-Schluessel nennt einen Menschen, dem die App freigegeben ist', async () => {
    await expect(kiProtokoll.werFragt(APP_SCHLUESSEL, 'anna')).resolves.toEqual({
      benutzerId: 5,
      benutzerName: 'anna',
    });
  });

  test('ein fremder Name ist ein 400, kein Eintrag', async () => {
    datenbank({ mitglied: false });
    await expect(kiProtokoll.werFragt(APP_SCHLUESSEL, 'mallory')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test('ohne Namen steht niemand da', async () => {
    await expect(kiProtokoll.werFragt(APP_SCHLUESSEL, null)).resolves.toEqual({
      benutzerId: null,
      benutzerName: null,
    });
  });

  test('der Schluessel eines Menschen ist sein Besitzer, ein Name aendert das nicht', async () => {
    await expect(kiProtokoll.werFragt(MENSCHEN_SCHLUESSEL, 'anna')).resolves.toEqual({
      benutzerId: 1,
      benutzerName: 'admin',
    });
  });
});

describe('einreihen', () => {
  test('Zeile vor dem Auftrag, mit App, Stand, Mensch, Modell und Datei ohne Namen', async () => {
    const reihenfolge = [];
    db.query.mockImplementation(async sql => {
      if (sql.includes('INSERT INTO public.ki_aufrufe')) {
        reihenfolge.push('zeile');
        return { rows: [{ id: 42 }] };
      }
      if (sql.includes('FROM public.app_members')) return { rows: [{ id: 5, username: 'anna' }] };
      return { rows: [] };
    });

    const auftrag = await kiProtokoll.einreihen(
      {
        apiKey: APP_SCHLUESSEL,
        endpunkt: 'document/extract-structured',
        einreicher: 'anna',
        modell: null,
        datei: { originalname: 'Kuendigung_Mueller.pdf', mimetype: 'application/pdf', size: 1234 },
      },
      async () => {
        reihenfolge.push('auftrag');
        return { jobId: 'job-1', model: 'qwen3.8:27b-q4_K_M' };
      }
    );

    expect(auftrag.jobId).toBe('job-1');
    expect(reihenfolge).toEqual(['zeile', 'auftrag']);

    const [[, werte]] = aufrufe('INSERT INTO public.ki_aufrufe');
    expect(werte).toEqual([
      'faktum',
      'live',
      'app faktum/live',
      5,
      'anna',
      'document/extract-structured',
      null,
      'application/pdf',
      1234,
    ]);
    // Der Dateiname steht nirgends.
    expect(JSON.stringify(db.query.mock.calls)).not.toContain('Kuendigung');

    const [[, auftragWerte]] = aufrufe('SET job_id');
    expect(auftragWerte).toEqual([42, 'job-1', 'qwen3.8:27b-q4_K_M']);
  });

  test('scheitert das Einreihen, steht der Aufruf als fehler da, und der Fehler geht weiter', async () => {
    await expect(
      kiProtokoll.einreihen({ apiKey: MENSCHEN_SCHLUESSEL, endpunkt: 'llm/chat' }, async () => {
        throw new Error('Warteschlange voll');
      })
    ).rejects.toThrow('Warteschlange voll');
    const [[, werte]] = aufrufe('UPDATE public.ki_aufrufe');
    expect(werte.slice(0, 3)).toEqual([42, 'fehler', 'Warteschlange voll']);
  });

  test('ein unbekannter Mensch: kein Auftrag', async () => {
    datenbank({ mitglied: false });
    const fn = jest.fn();
    await expect(
      kiProtokoll.einreihen({ apiKey: APP_SCHLUESSEL, endpunkt: 'llm/chat', einreicher: 'x' }, fn)
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('verfolge', () => {
  test('ein fertiger Auftrag schliesst die Zeile mit dem sha256 der Antwort, nicht der Antwort', async () => {
    llmJobService.getJob
      .mockResolvedValueOnce({ status: 'processing' })
      .mockResolvedValueOnce({ status: 'completed', content: '{"betrag": 12}' });

    await kiProtokoll.verfolge(42, 'job-1', { takt: 1 });

    const [[sql, werte]] = aufrufe('UPDATE public.ki_aufrufe');
    expect(sql).toContain('dauer_ms');
    expect(werte[0]).toBe(42);
    expect(werte[1]).toBe('fertig');
    expect(werte[3]).toBe(crypto.createHash('sha256').update('{"betrag": 12}').digest('hex'));
    expect(JSON.stringify(werte)).not.toContain('betrag');
  });

  test('ein abgebrochener Auftrag ist ein fehler', async () => {
    llmJobService.getJob.mockResolvedValueOnce({ status: 'cancelled' });
    await kiProtokoll.verfolge(42, 'job-1', { takt: 1 });
    const [[, werte]] = aufrufe('UPDATE public.ki_aufrufe');
    expect(werte.slice(1, 3)).toEqual(['fehler', 'abgebrochen']);
  });
});

describe('messen', () => {
  test('Zeile, Arbeit, Zeile -- und das Ergebnis geht durch', async () => {
    const ergebnis = await kiProtokoll.messen(
      { apiKey: APP_SCHLUESSEL, endpunkt: 'v1/embeddings', modell: 'nomic-embed-text' },
      async () => ({ ergebnis: [[0.1, 0.2]] })
    );
    expect(ergebnis).toEqual([[0.1, 0.2]]);
    const [[, werte]] = aufrufe('UPDATE public.ki_aufrufe');
    expect(werte[1]).toBe('fertig');
  });
});

describe('listeFuerApp', () => {
  test('nach App und Stand, neueste zuerst', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: '3', benutzer_id: '5', modell: 'gemma4:e4b', endpunkt: 'llm/chat' }],
    });
    const liste = await kiProtokoll.listeFuerApp({ appId: 'faktum', stand: 'live', limit: 10 });
    expect(liste).toEqual([{ id: 3, benutzer_id: 5, modell: 'gemma4:e4b', endpunkt: 'llm/chat' }]);
    const [sql, werte] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY begonnen_am DESC');
    expect(werte).toEqual(['faktum', 'live', 10]);
  });
});
