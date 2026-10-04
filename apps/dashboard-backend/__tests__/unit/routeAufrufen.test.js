/**
 * Das Werkzeug `route_aufrufen` (M5, Kontrakt 13): genannt, Zugang, App.
 */
jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { EventEmitter } = require('events');
const RouteAufrufenTool = require('../../src/services/flows/tools/route');
const { genannteRoute, datenAlsObjekt, passt } = RouteAufrufenTool;
const { FlowDefinition } = require('../../src/schemas/flows');
const { ForbiddenError } = require('../../src/utils/errors');

const ROUTEN = [
  { methode: 'GET', pfad: '/info' },
  { app: 'kunden', methode: 'POST', pfad: '/eintrag' },
  { app: 'kunden', methode: 'GET', pfad: '/kunden/{nummer}' },
];

const KONTEXT = {
  appId: 'belege',
  stand: 'live',
  runId: 42,
  userId: 1,
  einreicherId: 7,
  routen: ROUTEN,
};

/** Eine Datenbank mit zwei Konten. */
function datenbank() {
  return {
    query: jest.fn(async (_sql, [id]) => ({
      rows:
        Number(id) === 7
          ? [{ id: 7, username: 'mia', role: 'mitarbeiter', is_active: true }]
          : Number(id) === 1
            ? [{ id: 1, username: 'probe-admin', role: 'admin', is_active: true }]
            : [],
    })),
  };
}

/** Ein http.request, das antwortet und mitschreibt, was es bekam. */
function anfrageMit(code, text = '') {
  const gesehen = {};
  const anfrage = jest.fn((optionen, rueckruf) => {
    Object.assign(gesehen, { optionen });
    const req = new EventEmitter();
    req.end = koerper => {
      gesehen.koerper = koerper;
      const res = new EventEmitter();
      res.statusCode = code;
      rueckruf(res);
      if (text) {
        res.emit('data', Buffer.from(text));
      }
      res.emit('end');
    };
    req.destroy = jest.fn();
    return req;
  });
  return { anfrage, gesehen };
}

describe('genannteRoute', () => {
  it('nimmt eine genannte Route der eigenen App und einer anderen', () => {
    expect(genannteRoute({ pfad: '/info' }, { routen: ROUTEN, eigeneApp: 'belege' })).toEqual({
      app: 'belege',
      methode: 'GET',
      pfad: '/info',
    });
    expect(
      genannteRoute(
        { app: 'kunden', methode: 'get', pfad: '/kunden/K-4711' },
        { routen: ROUTEN, eigeneApp: 'belege' }
      )
    ).toEqual({ app: 'kunden', methode: 'GET', pfad: '/kunden/K-4711' });
  });

  it('weist eine nicht genannte Route mit Grund ab', () => {
    const eigeneApp = 'belege';
    expect(() =>
      genannteRoute(
        { app: 'kunden', methode: 'DELETE', pfad: '/eintrag' },
        { routen: ROUTEN, eigeneApp }
      )
    ).toThrow(
      'Route abgewiesen: DELETE /eintrag der App kunden steht nicht unter "routen" im Kopf des Flows'
    );
    // Die Route der anderen App gilt nicht fuer die eigene.
    expect(() =>
      genannteRoute({ methode: 'POST', pfad: '/eintrag' }, { routen: ROUTEN, eigeneApp })
    ).toThrow(ForbiddenError);
    // Ein Platzhalter steht fuer genau EIN Wegstueck.
    expect(() =>
      genannteRoute({ app: 'kunden', pfad: '/kunden/a/b' }, { routen: ROUTEN, eigeneApp })
    ).toThrow(/steht nicht unter/);
  });

  it('weist alles ab, was kein Pfad einer App ist', () => {
    const k = { routen: [{ methode: 'GET', pfad: '/{x}' }], eigeneApp: 'belege' };
    for (const pfad of ['http://evil/x', '/..', '/a?b=1', '//evil', 'info', '/a b', '/%2e%2e']) {
      expect(() => genannteRoute({ pfad }, k)).toThrow(/Route abgewiesen/);
    }
    expect(() => genannteRoute({ methode: 'TRACE', pfad: '/x' }, k)).toThrow(/Methode/);
  });

  it('passt nur auf gleich viele Wegstuecke', () => {
    expect(passt('/a/{b}', '/a/c')).toBe(true);
    expect(passt('/a/{b}', '/a')).toBe(false);
    expect(passt('/a', '/a/c')).toBe(false);
  });
});

describe('datenAlsObjekt', () => {
  it('liest JSON-Text, Liste name=wert und Objekt', () => {
    expect(datenAlsObjekt('{"a":"x"}')).toEqual({ a: 'x' });
    expect(datenAlsObjekt(['nummer=R-17', 'text=a=b "c"'])).toEqual({
      nummer: 'R-17',
      text: 'a=b "c"',
    });
    expect(datenAlsObjekt({ a: 1 })).toEqual({ a: 1 });
    expect(datenAlsObjekt('')).toBeNull();
    expect(() => datenAlsObjekt('{kaputt')).toThrow(/kein JSON/);
    expect(() => datenAlsObjekt(['ohne-gleich'])).toThrow(/name=wert/);
  });
});

describe('RouteAufrufenTool.execute', () => {
  const tool = new RouteAufrufenTool();

  it('ruft die Ziel-App im selben Stand mit dem Menschen des Laufs, ohne Geheimnis', async () => {
    const { anfrage, gesehen } = anfrageMit(201, '{"ok":true}');
    const zugang = jest.fn(async () => ({}));
    const antwort = await tool.execute(
      { app: 'kunden', methode: 'POST', pfad: '/eintrag', daten: ['nummer=R-17'] },
      KONTEXT,
      { datenbank: datenbank(), zugang, port: async () => 8080, anfrage }
    );
    expect(antwort).toBe('{"ok":true}');
    // Zugang geprueft fuer den Einreicher, an der Ziel-App, im Stand des Laufs.
    expect(zugang).toHaveBeenCalledWith({ benutzerId: 7, appId: 'kunden', stand: 'live' });
    expect(gesehen.optionen).toMatchObject({
      host: 'arasul-app-kunden-live',
      port: 8080,
      path: '/eintrag',
      method: 'POST',
    });
    const koepfe = gesehen.optionen.headers;
    expect(koepfe['X-Arasul-User']).toBe('mia');
    expect(koepfe['X-Arasul-Role']).toBe('mitarbeiter');
    expect(koepfe['X-Arasul-Lauf']).toBe('42');
    expect(koepfe['X-Arasul-App']).toBe('belege');
    expect(koepfe.Authorization).toBeUndefined();
    expect(JSON.parse(gesehen.koerper)).toEqual({ nummer: 'R-17' });
  });

  it('ohne Einreicher ruft es im Namen des Besitzers, GET mit Abfrage', async () => {
    const { anfrage, gesehen } = anfrageMit(200, '');
    const zugang = jest.fn(async () => ({}));
    const antwort = await tool.execute(
      { pfad: '/info', daten: { a: 'x y' } },
      { ...KONTEXT, einreicherId: null },
      { datenbank: datenbank(), zugang, port: async () => 8080, anfrage }
    );
    expect(antwort).toBe('(HTTP 200, ohne Inhalt)');
    expect(zugang).toHaveBeenCalledWith({ benutzerId: 1, appId: 'belege', stand: 'live' });
    expect(gesehen.optionen.path).toBe('/info?a=x+y');
    expect(gesehen.optionen.headers['X-Arasul-User']).toBe('probe-admin');
    expect(gesehen.koerper).toBeUndefined();
  });

  it('weist ab, wenn der Mensch keinen Zugang zur Ziel-App hat, und ruft nicht', async () => {
    const { anfrage } = anfrageMit(200, 'nie');
    const zugang = jest.fn(async () => {
      throw new ForbiddenError('Die App kunden ist Ihnen nicht freigegeben.');
    });
    await expect(
      tool.execute({ app: 'kunden', methode: 'POST', pfad: '/eintrag' }, KONTEXT, {
        datenbank: datenbank(),
        zugang,
        port: async () => 8080,
        anfrage,
      })
    ).rejects.toThrow(
      'Route abgewiesen: mia hat keinen Zugang zur App kunden (live): Die App kunden ist Ihnen nicht freigegeben.'
    );
    expect(anfrage).not.toHaveBeenCalled();
  });

  it('prueft die Nennung VOR dem Zugang', async () => {
    const zugang = jest.fn();
    await expect(
      tool.execute({ app: 'kunden', methode: 'POST', pfad: '/loeschen' }, KONTEXT, {
        datenbank: datenbank(),
        zugang,
      })
    ).rejects.toThrow(/steht nicht unter "routen"/);
    expect(zugang).not.toHaveBeenCalled();
  });

  it('macht aus einer Antwort ausser 2xx einen Fehler mit Grund', async () => {
    const { anfrage } = anfrageMit(403, '{"fehler":"nur Leitung"}');
    await expect(
      tool.execute({ app: 'kunden', methode: 'POST', pfad: '/eintrag' }, KONTEXT, {
        datenbank: datenbank(),
        zugang: async () => ({}),
        port: async () => 8080,
        anfrage,
      })
    ).rejects.toThrow(
      'Die App kunden antwortete auf POST /eintrag mit 403: {"fehler":"nur Leitung"}'
    );
  });

  it('ruft nichts fuer einen Flow ohne App, eine App ohne Backend oder ein inaktives Konto', async () => {
    await expect(tool.execute({ pfad: '/info' }, { ...KONTEXT, appId: null })).rejects.toThrow(
      /nur ein Flow einer App/
    );
    await expect(
      tool.execute({ pfad: '/info' }, KONTEXT, {
        datenbank: datenbank(),
        zugang: async () => ({}),
        port: async () => null,
      })
    ).rejects.toThrow(/kein Backend/);
    await expect(
      tool.execute({ pfad: '/info' }, { ...KONTEXT, einreicherId: 99 }, { datenbank: datenbank() })
    ).rejects.toThrow(/nicht aktiv/);
  });
});

describe('routen im Flow-Kopf', () => {
  const kopf = {
    name: 'probe',
    systemPrompt: 'p',
    werkzeuge: ['route_aufrufen'],
    routen: ROUTEN,
  };

  it('nimmt routen mit dem Werkzeug', () => {
    expect(FlowDefinition.safeParse(kopf).success).toBe(true);
  });

  it('verlangt Werkzeug und routen nur zusammen', () => {
    expect(FlowDefinition.safeParse({ ...kopf, routen: undefined }).success).toBe(false);
    expect(FlowDefinition.safeParse({ ...kopf, werkzeuge: [] }).success).toBe(false);
  });

  it('weist doppelte Routen, fremde Felder und kaputte Pfade ab', () => {
    expect(FlowDefinition.safeParse({ ...kopf, routen: [ROUTEN[0], ROUTEN[0]] }).success).toBe(
      false
    );
    expect(
      FlowDefinition.safeParse({ ...kopf, routen: [{ methode: 'GET', pfad: '/x', host: 'evil' }] })
        .success
    ).toBe(false);
    for (const pfad of ['/a/../b', 'x', '/a?b', '//a', '/a/', '/{A}']) {
      expect(
        FlowDefinition.safeParse({ ...kopf, routen: [{ methode: 'GET', pfad }] }).success
      ).toBe(false);
    }
    expect(
      FlowDefinition.safeParse({ ...kopf, routen: [{ app: 'test', methode: 'GET', pfad: '/x' }] })
        .success
    ).toBe(false);
  });
});
