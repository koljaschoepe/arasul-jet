/**
 * Plan 023 H1: zeitgesteuerte Ausführung für Erweiterungen.
 *
 * Der Fall aus dem Plan ist „nächtliche Abgleiche". Die zwei Fragen, an denen
 * so etwas scheitert, sind immer dieselben: läuft es zu oft, oder läuft es gar
 * nicht, weil das Gerät gerade neu startete?
 *
 * Deshalb ein Nachholfenster und ein Vermerk je Tag, und deshalb prüfen die
 * meisten Tests hier genau diese beiden Fälle.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const dienst = require('../../src/services/extensions/zeitplanService');
const { ValidationError, NotFoundError, ForbiddenError } = require('../../src/utils/errors');

/** Ein Zeitpunkt in Gerätezeit. */
function um(tag, stunde, minute) {
  return new Date(2026, 7, tag, stunde, minute, 0);
}

function fakeDb(antworten = []) {
  const abfragen = [];
  const rest = [...antworten];
  const d = {
    query: jest.fn(async (sql, werte) => {
      abfragen.push({ sql, werte });
      return rest.shift() ?? { rows: [], rowCount: 0 };
    }),
  };
  d.abfragen = abfragen;
  d.sqlMit = teil => abfragen.filter(a => a.sql.includes(teil));
  return d;
}

describe('pruefeUhrzeit', () => {
  test.each(['00:00', '03:00', '23:59'])('%s ist gueltig', z => {
    expect(dienst.pruefeUhrzeit(z)).toBe(z);
  });

  test.each(['24:00', '3:00', '03:60', 'nachts', '', '03:00:00'])('%s nicht', z => {
    expect(() => dienst.pruefeUhrzeit(z)).toThrow(ValidationError);
  });
});

describe('istFaellig', () => {
  const plan = { uhrzeit: '03:00', zuletzt_am: null };

  test('genau zur Uhrzeit', () => {
    expect(dienst.istFaellig(plan, um(1, 3, 0))).toBe(true);
  });

  test('vorher nicht', () => {
    expect(dienst.istFaellig(plan, um(1, 2, 59))).toBe(false);
  });

  test('innerhalb des Nachholfensters noch', () => {
    // Ein Geraet, das um 03:00 gerade neu startet, haette den Lauf sonst
    // verloren.
    expect(dienst.istFaellig(plan, um(1, 3, dienst.NACHHOLFENSTER_MIN))).toBe(true);
  });

  test('danach nicht mehr', () => {
    expect(dienst.istFaellig(plan, um(1, 3, dienst.NACHHOLFENSTER_MIN + 1))).toBe(false);
  });

  test('heute schon gelaufen heisst nicht noch einmal', () => {
    // Der Takt schaut jede Minute nach; ohne diesen Vergleich liefe der Flow
    // im Nachholfenster elfmal.
    const gelaufen = { uhrzeit: '03:00', zuletzt_am: um(1, 3, 0) };
    expect(dienst.istFaellig(gelaufen, um(1, 3, 5))).toBe(false);
  });

  test('gestern gelaufen heisst heute wieder', () => {
    const gestern = { uhrzeit: '03:00', zuletzt_am: um(1, 3, 0) };
    expect(dienst.istFaellig(gestern, um(2, 3, 0))).toBe(true);
  });

  test('ein Zeitstempel als Zeichenkette geht auch', () => {
    const plan2 = { uhrzeit: '03:00', zuletzt_am: um(1, 3, 0).toISOString() };
    expect(dienst.istFaellig(plan2, um(1, 3, 2))).toBe(false);
  });
});

describe('anlegen', () => {
  test('legt an und meldet zurueck', async () => {
    const db = fakeDb([
      { rows: [{ anzahl: 0 }] },
      { rows: [{ id: 1, flow: 'abgleich', uhrzeit: '03:00', args: {}, aktiv: true }] },
    ]);
    const res = await dienst.anlegen('meine-ext', { flow: 'abgleich', uhrzeit: '03:00' }, { db });
    expect(res.uhrzeit).toBe('03:00');
    expect(db.sqlMit('INSERT INTO public.extension_zeitplaene')).toHaveLength(1);
  });

  test('ein Flow-Name mit Sonderzeichen wird abgewiesen', async () => {
    await expect(
      dienst.anlegen('meine-ext', { flow: '../../etc/passwd', uhrzeit: '03:00' }, { db: fakeDb() })
    ).rejects.toThrow(ValidationError);
  });

  test('der Deckel je Erweiterung greift', async () => {
    const db = fakeDb([{ rows: [{ anzahl: dienst.MAX_ZEITPLAENE }] }]);
    await expect(
      dienst.anlegen('meine-ext', { flow: 'noch-einer', uhrzeit: '03:00' }, { db })
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('entfernen', () => {
  test('ein fremder Zeitplan ist nicht zu finden', async () => {
    // Die Bedingung traegt IMMER die extension_id: sonst koennte eine
    // Erweiterung den Zeitplan einer anderen loeschen.
    const db = fakeDb([{ rowCount: 0 }]);
    await expect(dienst.entfernen('meine-ext', { id: 99 }, { db })).rejects.toThrow(NotFoundError);
    expect(db.abfragen[0].sql).toContain('extension_id = $1');
  });
});

describe('taktLauf', () => {
  const FAELLIG = {
    rows: [
      {
        id: 1,
        extension_id: 'meine-ext',
        flow: 'abgleich',
        uhrzeit: '03:00',
        args: { a: 1 },
        zuletzt_am: null,
        erstellt_von: 7,
      },
    ],
  };

  test('startet den Flow und vermerkt den Lauf', async () => {
    const db = fakeDb([FAELLIG]);
    const flowStarten = jest.fn(async () => ({ runId: 42 }));
    const n = await dienst.taktLauf({ db, jetzt: um(1, 3, 0), flowStarten });

    expect(n).toBe(1);
    // `userId` ist der Kern, nicht Beiwerk: bis zum 23.08.2026 stand hier
    // `null`, und `flow_runs.user_id` ist NOT NULL. Der Zeitplan feuerte also
    // puenktlich, und der Lauf starb sofort — auf jedem Geraet.
    expect(flowStarten).toHaveBeenCalledWith({ name: 'abgleich', args: { a: 1 }, userId: 7 });
    expect(db.sqlMit('SET zuletzt_lauf')).toHaveLength(1);
  });

  test('vermerkt den Lauf VOR dem Start', async () => {
    // Sonst wuerde ein Flow, der eine Minute laeuft, im naechsten Takt ein
    // zweites Mal gestartet.
    const db = fakeDb([FAELLIG]);
    const reihenfolge = [];
    const flowStarten = jest.fn(async () => {
      reihenfolge.push('start');
      return { runId: 1 };
    });
    const echt = db.query;
    db.query = jest.fn(async (sql, w) => {
      if (sql.includes('SET zuletzt_am')) reihenfolge.push('vermerk');
      return echt(sql, w);
    });
    await dienst.taktLauf({ db, jetzt: um(1, 3, 0), flowStarten });
    expect(reihenfolge).toEqual(['vermerk', 'start']);
  });

  test('was nicht faellig ist, laeuft nicht', async () => {
    const db = fakeDb([FAELLIG]);
    const flowStarten = jest.fn();
    expect(await dienst.taktLauf({ db, jetzt: um(1, 12, 0), flowStarten })).toBe(0);
    expect(flowStarten).not.toHaveBeenCalled();
  });

  test('ein gescheiterter Lauf wird festgehalten, nicht verschluckt', async () => {
    const db = fakeDb([FAELLIG]);
    const flowStarten = jest.fn(async () => {
      throw new Error('Flow gibt es nicht');
    });
    expect(await dienst.taktLauf({ db, jetzt: um(1, 3, 0), flowStarten })).toBe(0);
    const vermerk = db.sqlMit('SET letzter_fehler')[0];
    expect(vermerk.werte[1]).toContain('Flow gibt es nicht');
  });

  test('ein Fehlschlag blockiert den Zeitplan nicht dauerhaft', async () => {
    // zuletzt_am steht trotzdem: sonst versuchte es der Takt im
    // Nachholfenster jede Minute erneut.
    const db = fakeDb([FAELLIG]);
    await dienst.taktLauf({
      db,
      jetzt: um(1, 3, 0),
      flowStarten: async () => {
        throw new Error('weg');
      },
    });
    expect(db.sqlMit('SET zuletzt_am')).toHaveLength(1);
  });

  test('nur aktive Zeitplaene aktiver Erweiterungen', async () => {
    const db = fakeDb([{ rows: [] }]);
    await dienst.taktLauf({ db, jetzt: um(1, 3, 0), flowStarten: jest.fn() });
    const abfrage = db.abfragen[0].sql;
    expect(abfrage).toContain('z.aktiv = TRUE');
    expect(abfrage).toContain('e.enabled = TRUE');
  });
});

describe('Wer laeuft, wenn in der Zeile kein Nutzer steht (23.08.2026)', () => {
  const OHNE_NUTZER = {
    rows: [
      {
        id: 1,
        extension_id: 'meine-ext',
        flow: 'abgleich',
        uhrzeit: '03:00',
        args: {},
        zuletzt_am: null,
        erstellt_von: null,
      },
    ],
  };

  test('Zeilen von vor Migration 158 fallen auf den aeltesten Administrator zurueck', async () => {
    // Ohne Rueckfall liefe so eine Zeile nie wieder, und zwar still.
    const db = fakeDb([OHNE_NUTZER, { rows: [] }, { rows: [{ id: 3 }] }]);
    const flowStarten = jest.fn(async () => ({ runId: 5 }));
    await dienst.taktLauf({ db, jetzt: um(1, 3, 0), flowStarten });
    expect(flowStarten).toHaveBeenCalledWith({ name: 'abgleich', args: {}, userId: 3 });
  });

  test('ohne jeden Administrator wird der Fehler festgehalten, nicht verschluckt', async () => {
    const db = fakeDb([OHNE_NUTZER, { rows: [] }, { rows: [] }]);
    const flowStarten = jest.fn();
    const n = await dienst.taktLauf({ db, jetzt: um(1, 3, 0), flowStarten });
    expect(n).toBe(0);
    expect(flowStarten).not.toHaveBeenCalled();
    expect(db.sqlMit('SET letzter_fehler')).toHaveLength(1);
  });
});

describe('anlegen haelt den Nutzer fest', () => {
  test('der Nutzer aus dem Bruecken-Token landet in der Zeile', async () => {
    const db = fakeDb([{ rows: [{ anzahl: 0 }] }, { rows: [{ id: 1 }] }]);
    await dienst.anlegen('meine-ext', { flow: 'abgleich', uhrzeit: '03:00', userId: 9 }, { db });
    const einfuegen = db.sqlMit('INSERT INTO public.extension_zeitplaene')[0];
    expect(einfuegen.sql).toContain('erstellt_von');
    expect(einfuegen.werte).toContain(9);
  });

  test('ein erneutes Anlegen ohne Nutzer loescht den vorhandenen nicht', async () => {
    const db = fakeDb([{ rows: [{ anzahl: 0 }] }, { rows: [{ id: 1 }] }]);
    await dienst.anlegen('meine-ext', { flow: 'abgleich', uhrzeit: '03:00' }, { db });
    expect(db.sqlMit('INSERT INTO public.extension_zeitplaene')[0].sql).toContain('COALESCE');
  });
});
