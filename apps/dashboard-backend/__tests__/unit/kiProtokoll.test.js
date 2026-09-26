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

describe('ein Auftrag, der nicht in die Zeile kam', () => {
  test('scheitert setzeAuftrag, geht der Aufruf trotzdem durch und die Zeile schliesst mit ihm', async () => {
    db.query.mockImplementation(async sql => {
      if (sql.includes('INSERT INTO public.ki_aufrufe')) return { rows: [{ id: 42 }] };
      if (sql.includes('SET job_id')) throw new Error('Pool voll');
      return { rows: [] };
    });
    llmJobService.getJob.mockResolvedValue({ status: 'completed', content: 'x' });

    const auftrag = await kiProtokoll.einreihen(
      { apiKey: MENSCHEN_SCHLUESSEL, endpunkt: 'llm/chat' },
      async () => ({ jobId: 'job-9', model: 'gemma4:e4b' })
    );
    expect(auftrag.jobId).toBe('job-9');

    // Der losgeloeste Verfolger schliesst die Zeile und traegt den Auftrag nach.
    await kiProtokoll.verfolge(42, 'job-9', { takt: 1, modell: 'gemma4:e4b' });
    const schluss = aufrufe('beendet_am = NOW()').pop();
    expect(schluss[0]).toContain('COALESCE(job_id, $6::uuid)');
    expect(schluss[1].slice(1, 2)).toEqual(['fertig']);
    expect(schluss[1][4]).toBe('gemma4:e4b');
    expect(schluss[1][5]).toBe('job-9');
  });
});

describe('schliesseVerwaiste', () => {
  test('ein fertiger Auftrag schliesst, einer ohne Auftrag ist unterbrochen, ein laufender wird verfolgt', async () => {
    db.query.mockImplementation(async sql => {
      if (sql.includes('FROM public.ki_aufrufe') && sql.includes("status = 'laeuft'")) {
        return {
          rows: [
            { id: '1', job_id: 'job-fertig', aus_frueherem_prozess: true },
            { id: '2', job_id: null, aus_frueherem_prozess: true },
            { id: '3', job_id: 'job-laeuft', aus_frueherem_prozess: true },
          ],
        };
      }
      return { rows: [] };
    });
    const jobs = {
      getJob: jest.fn(async jobId =>
        jobId === 'job-fertig' ? { status: 'completed', content: 'a' } : { status: 'processing' }
      ),
    };

    const geschlossen = await kiProtokoll.schliesseVerwaiste({ beimStart: true }, { jobs });

    expect(geschlossen).toBe(2);
    const schluesse = aufrufe('beendet_am = NOW()').map(([, w]) => [w[0], w[1]]);
    expect(schluesse).toEqual([
      [1, 'fertig'],
      [2, 'fehler'],
    ]);
  });

  test('eine unlesbare Tabelle haelt den Start nicht auf', async () => {
    db.query.mockRejectedValue(new Error('keine Tabelle'));
    await expect(kiProtokoll.schliesseVerwaiste({ beimStart: true })).resolves.toBe(0);
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

  test('ein Aussetzer beim Nachsehen ist kein Ende', async () => {
    llmJobService.getJob
      .mockRejectedValueOnce(new Error('Verbindung weg'))
      .mockResolvedValueOnce({ status: 'completed', content: 'ok' });
    await kiProtokoll.verfolge(42, 'job-1', { takt: 1 });
    const [[, werte]] = aufrufe('UPDATE public.ki_aufrufe');
    expect(werte[1]).toBe('fertig');
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
      rows: [
        { id: '3', benutzer_id: '5', modell: 'gemma4:e4b', endpunkt: 'llm/chat', lauf_id: null },
        { id: '4', benutzer_id: null, modell: 'qwen', endpunkt: 'flows/brief', lauf_id: '12' },
      ],
    });
    const liste = await kiProtokoll.listeFuerApp({ appId: 'faktum', stand: 'live', limit: 10 });
    expect(liste).toEqual([
      { id: 3, benutzer_id: 5, modell: 'gemma4:e4b', endpunkt: 'llm/chat', lauf_id: null },
      { id: 4, benutzer_id: null, modell: 'qwen', endpunkt: 'flows/brief', lauf_id: 12 },
    ]);
    const [sql, werte] = db.query.mock.calls[0];
    expect(sql).toContain('ORDER BY begonnen_am DESC');
    expect(werte).toEqual(['faktum', 'live', 10]);
  });
});

describe('flowSchritt (Migration 189)', () => {
  const LAUF = {
    runId: '12',
    flowName: 'bescheid',
    appId: 'abschluss',
    stand: 'live',
    einreicherId: 5,
    userId: 1,
  };

  test('App, Stand, Einreicher, Modell und Lauf -- und die Zeile vor dem Aufruf', async () => {
    let zeileDa = false;
    const message = await kiProtokoll.flowSchritt(LAUF, 'qwen3.8:27b-q4_K_M', async () => {
      zeileDa = aufrufe('INSERT INTO public.ki_aufrufe').length === 1;
      return { content: 'Die Freigabe ist erteilt.' };
    });
    expect(zeileDa).toBe(true);
    expect(message).toEqual({ content: 'Die Freigabe ist erteilt.' });

    const [[sql, werte]] = aufrufe('INSERT INTO public.ki_aufrufe');
    expect(sql).toContain('lauf_id');
    // Der Name kommt aus dem Konto, nach der Kennung des Einreichers.
    expect(aufrufe('FROM public.admin_users')[0][1]).toEqual([5]);
    expect(werte).toEqual([
      'abschluss',
      'live',
      5,
      'admin',
      'flows/bescheid',
      'qwen3.8:27b-q4_K_M',
      12,
    ]);

    const [[, schluss]] = aufrufe('UPDATE public.ki_aufrufe');
    expect(schluss[1]).toBe('fertig');
    expect(schluss[3]).toBe(
      crypto.createHash('sha256').update('Die Freigabe ist erteilt.', 'utf8').digest('hex')
    );
  });

  test('ein App-Lauf ohne Einreicher steht ohne Menschen da, nicht mit dem Schluesselbesitzer', async () => {
    await kiProtokoll.flowSchritt({ ...LAUF, einreicherId: null }, 'm', async () => ({
      content: 'x',
    }));
    expect(aufrufe('FROM public.admin_users')).toHaveLength(0);
    const [[, werte]] = aufrufe('INSERT INTO public.ki_aufrufe');
    expect(werte.slice(2, 4)).toEqual([null, null]);
  });

  test('ein Lauf der Plattform steht mit dem Menschen da, dem er gehoert', async () => {
    await kiProtokoll.flowSchritt(
      { runId: 3, flowName: 'wochenbericht', userId: 1, appId: null, stand: null },
      'm',
      async () => ({ content: 'x' })
    );
    const [[, werte]] = aufrufe('INSERT INTO public.ki_aufrufe');
    expect(werte.slice(0, 4)).toEqual([null, null, 1, 'admin']);
  });

  test('ein Werkzeugaufruf ist auch ein Vorschlag: sein sha256 deckt ihn mit ab', async () => {
    const rufe = [{ function: { name: 'freigabe_anfordern', arguments: { titel: 'T' } } }];
    await kiProtokoll.flowSchritt(LAUF, 'm', async () => ({ content: '', tool_calls: rufe }));
    const [[, schluss]] = aufrufe('UPDATE public.ki_aufrufe');
    expect(schluss[3]).toBe(
      crypto
        .createHash('sha256')
        .update(JSON.stringify({ content: '', tool_calls: rufe }), 'utf8')
        .digest('hex')
    );
  });

  test('scheitert das Modell, steht der Schritt als fehler da, und der Fehler geht weiter', async () => {
    await expect(
      kiProtokoll.flowSchritt(LAUF, 'm', async () => {
        throw new Error('Ollama weg');
      })
    ).rejects.toThrow('Ollama weg');
    const [[, schluss]] = aufrufe('UPDATE public.ki_aufrufe');
    expect(schluss[1]).toBe('fehler');
    expect(schluss[2]).toBe('Ollama weg');
  });

  test('scheitert die Zeile, laeuft der Flow trotzdem weiter', async () => {
    db.query.mockRejectedValue(new Error('Datenbank weg'));
    const message = await kiProtokoll.flowSchritt(LAUF, 'm', async () => ({ content: 'ok' }));
    expect(message).toEqual({ content: 'ok' });
  });
});
