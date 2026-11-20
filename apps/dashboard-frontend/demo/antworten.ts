/**
 * Die gespielten Antworten der Demo (J46, M7): an Stelle des Backends.
 *
 * Eine reine Funktion: Anfrage und Zustand hinein, Antwort und neuer Zustand
 * heraus. Der Service Worker (`dienst.ts`) ruft sie für jede Anfrage an
 * `/api/…` und an die Schnittstelle einer Beispiel-App; Tests rufen sie
 * direkt. Die Formen sind die des echten Backends (`apps/dashboard-backend/
 * src/routes/`), damit das Frontend nichts von der Demo weiß.
 *
 * Was hier nicht steht, beantwortet die Demo mit 404 und einem Satz. Die
 * Verwaltung gehört dem Administrator und ist in der Demo nicht zu sehen.
 */
import { PERSONEN, FIRMA, type DemoApp, type DemoZustand, type Sprache } from './daten';

export interface Anfrage {
  methode: string;
  /** Pfad ohne Herkunft, z. B. `/api/apps/meine`. */
  pfad: string;
  suche: URLSearchParams;
  koerper: unknown;
}

export interface Antwort {
  status: number;
  /** JSON-Rumpf, oder `null` mit `bytes` für ein Bild. */
  json?: unknown;
  bytes?: Uint8Array<ArrayBuffer>;
  typ?: string;
}

const COCKPIT = 'entwickler-cockpit';

const jetzt = () => new Date().toISOString();
const ok = (data: unknown, status = 200): Antwort => ({
  status,
  json: { data, timestamp: jetzt() },
});
const fehler = (status: number, code: string, message: string): Antwort => ({
  status,
  json: { error: { code, message }, timestamp: jetzt() },
});

function person(z: DemoZustand, sprache: Sprache) {
  const p = PERSONEN[z.rolle];
  return {
    id: p.id,
    username: p.username,
    email: null,
    role: 'mitarbeiter' as const,
    passwortWechselNoetig: false,
    theme: z.theme,
    vorname: null,
    nachname: null,
    funktion: z.rolle === 'entwickler' ? (sprache === 'en' ? 'Development' : 'Entwicklung') : null,
    kuerzel: null,
    hatBild: false,
    entwickler: z.rolle === 'entwickler',
    anzeigeName: p[sprache],
  };
}

/** `GET /api/apps/meine`: der Entwickler ist Testperson und sieht das Cockpit. */
function meineApps(z: DemoZustand, sprache: Sprache) {
  const entwickler = z.rolle === 'entwickler';
  const apps = z.apps.map(a => ({
    id: a.id,
    name: a.name[sprache],
    beschreibung: a.beschreibung[sprache],
    symbol: a.symbol,
    live: { version: a.live.version, pfad: `/apps/${a.id}/`, api: `/apps/${a.id}/api/` },
    test:
      entwickler && a.test
        ? { version: a.test.version, pfad: `/apps/${a.id}/test/`, api: `/apps/${a.id}/test/api/` }
        : null,
  }));
  if (!entwickler) return apps;
  return [
    ...apps,
    {
      id: COCKPIT,
      name: 'Entwickler-Cockpit',
      beschreibung:
        sprache === 'en'
          ? 'Feedback per app, test and live versions, the step to live.'
          : 'Rückmeldungen je App mit Stand, Fassungen in Test und Live, der Schritt nach Live.',
      symbol: 'gauge',
      live: { version: '1.0.0', pfad: `/apps/${COCKPIT}/`, api: null },
      test: null,
    },
  ];
}

function meldungAussen(z: DemoZustand, m: DemoZustand['meldungen'][number], sprache: Sprache) {
  const { bild, ...rest } = m;
  return {
    ...rest,
    app_name: z.apps.find(a => a.id === m.app_id)?.name[sprache] ?? null,
    hat_bild: Boolean(bild),
  };
}

/** `GET /api/entwickler/apps`, Form aus `services/app/entwicklerCockpit.js`. */
function entwicklerApps(z: DemoZustand, sprache: Sprache) {
  return z.apps.map(a => {
    const meldungen = z.meldungen.filter(m => m.app_id === a.id);
    const schaltung = [...z.schaltungen].reverse().find(s => s.app_id === a.id) ?? null;
    return {
      id: a.id,
      name: a.name[sprache],
      symbol: a.symbol,
      mitgeliefert: false,
      live: { ...a.live, vorige_version: a.vorige_version },
      test: a.test,
      zuletzt_geaendert: a.test?.eingespielt_am ?? a.live.eingespielt_am,
      test_neuer: Boolean(a.test && a.test.version !== a.live.version),
      meldungen: {
        offen: meldungen.filter(m => m.stand_meldung === 'neu' || m.stand_meldung === 'angenommen')
          .length,
        neu: meldungen.filter(m => m.stand_meldung === 'neu').length,
        umgesetzt: meldungen.filter(m => m.stand_meldung === 'umgesetzt').length,
      },
      letzte_schaltung: schaltung
        ? {
            ergebnis: schaltung.ergebnis,
            satz: schaltung.satz,
            nach_version: schaltung.nach_version,
            am: schaltung.am,
          }
        : null,
    };
  });
}

function schalten(z: DemoZustand, app: DemoApp, ziel: unknown): [Antwort, DemoZustand] {
  if (ziel === 'live') {
    if (!app.test || app.test.version === app.live.version) {
      return [fehler(409, 'CONFLICT', 'In Test liegt keine neuere Fassung.'), z];
    }
    const neu: DemoApp = {
      ...app,
      vorige_version: app.live.version,
      live: { ...app.test, eingespielt_am: jetzt() },
    };
    return [
      ok({ version: neu.live.version, stand: 'live' }),
      {
        ...z,
        apps: z.apps.map(a => (a.id === app.id ? neu : a)),
        schaltungen: [
          ...z.schaltungen,
          {
            app_id: app.id,
            ergebnis: 'live',
            satz: `Fassung ${neu.live.version} ist live.`,
            nach_version: neu.live.version,
            am: jetzt(),
          },
        ],
      },
    ];
  }
  if (ziel === 'zurueck') {
    if (!app.vorige_version) {
      return [fehler(409, 'CONFLICT', 'Es gibt keine vorige Fassung.'), z];
    }
    const neu: DemoApp = {
      ...app,
      vorige_version: null,
      live: {
        version: app.vorige_version,
        eingespielt_am: jetzt(),
        aenderungstext: null,
      },
    };
    return [
      ok({ version: neu.live.version, stand: 'live' }),
      {
        ...z,
        apps: z.apps.map(a => (a.id === app.id ? neu : a)),
        schaltungen: [
          ...z.schaltungen,
          {
            app_id: app.id,
            ergebnis: 'zurueckgeschaltet',
            satz: `Zurück auf ${neu.live.version}.`,
            nach_version: neu.live.version,
            am: jetzt(),
          },
        ],
      },
    ];
  }
  return [fehler(400, 'VALIDATION_ERROR', 'Ziel ist live oder zurueck.'), z];
}

function bytesAusDataUrl(url: string): Uint8Array<ArrayBuffer> | null {
  const treffer = url.match(/^data:[^;,]*;base64,(.*)$/);
  if (!treffer?.[1]) return null;
  const roh = atob(treffer[1]);
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i += 1) bytes[i] = roh.charCodeAt(i);
  return bytes;
}

const STAENDE_MELDUNG = ['neu', 'angenommen', 'umgesetzt', 'abgelehnt'] as const;

/**
 * Eine Anfrage beantworten. Gibt die Antwort und den Zustand danach zurück;
 * ist er unverändert, ist es dasselbe Objekt.
 */
export function antworte(
  a: Anfrage,
  z: DemoZustand,
  sprache: Sprache = 'de'
): [Antwort, DemoZustand] {
  const { methode, pfad } = a;
  const koerper = (a.koerper ?? {}) as Record<string, unknown>;
  const entwickler = z.rolle === 'entwickler';

  // Die Schnittstelle einer Beispiel-App: welche Fassung in diesem Stand läuft.
  const appApi = pfad.match(/^\/apps\/([a-z0-9-]+)\/(test\/)?api\/fassung$/);
  if (appApi) {
    const app = z.apps.find(x => x.id === appApi[1]);
    if (!app) return [fehler(404, 'NOT_FOUND', 'Diese App gibt es nicht.'), z];
    const fassung = appApi[2] ? (app.test ?? app.live) : app.live;
    return [ok({ app: app.id, stand: appApi[2] ? 'test' : 'live', version: fassung.version }), z];
  }

  if (methode === 'GET') {
    switch (pfad) {
      case '/api/auth/session':
        return [
          {
            status: 200,
            json: { authenticated: true, user: person(z, sprache), timestamp: jetzt() },
          },
          z,
        ];
      case '/api/auth/me':
        return [{ status: 200, json: { user: person(z, sprache), timestamp: jetzt() } }, z];
      case '/api/auth/csrf':
        return [{ status: 200, json: { csrfToken: 'demo', timestamp: jetzt() } }, z];
      case '/api/auth/needs-setup':
        return [{ status: 200, json: { needsSetup: false, firmenname: FIRMA, logo: null } }, z];
      case '/api/health':
        return [{ status: 200, json: { status: 'OK', build_hash: 'dev' } }, z];
      case '/api/apps/meine':
        return [ok(meineApps(z, sprache)), z];
      case '/api/apps/reihenfolge':
        return [ok(z.reihenfolge), z];
      case '/api/freigabe-anfragen':
      case '/api/freigabe-anfragen/bei-anderen':
      case '/api/freigabe-anfragen/eingereicht':
      case '/api/ausweise':
        return [ok([]), z];
      case '/api/terminal':
        return [ok({ an: false, entwickler, linuxNutzer: null }), z];
      case '/api/profil':
        return [ok(person(z, sprache)), z];
      case '/api/rueckmeldungen':
        if (!entwickler) return [fehler(403, 'FORBIDDEN', 'Nur für Entwickler.'), z];
        return [
          ok(
            [...z.meldungen]
              .sort((x, y) => y.erstellt_am.localeCompare(x.erstellt_am))
              .map(m => meldungAussen(z, m, sprache))
          ),
          z,
        ];
      case '/api/entwickler/apps':
        if (!entwickler) return [fehler(403, 'FORBIDDEN', 'Nur für Entwickler.'), z];
        return [ok(entwicklerApps(z, sprache)), z];
    }
    const bild = pfad.match(/^\/api\/rueckmeldungen\/(\d+)\/bild$/);
    if (bild) {
      const m = z.meldungen.find(x => x.id === Number(bild[1]));
      const bytes = m?.bild ? bytesAusDataUrl(m.bild) : null;
      if (!bytes) return [fehler(404, 'NOT_FOUND', 'Zu dieser Rückmeldung gibt es kein Bild.'), z];
      return [
        { status: 200, bytes, typ: m?.bild?.slice(5, m.bild.indexOf(';')) || 'image/png' },
        z,
      ];
    }
  }

  if (methode === 'PUT' && pfad === '/api/apps/reihenfolge') {
    const liste = Array.isArray(koerper.reihenfolge)
      ? koerper.reihenfolge.filter((x): x is string => typeof x === 'string')
      : [];
    return [ok(liste), { ...z, reihenfolge: liste }];
  }

  if (methode === 'PUT' && pfad === '/api/darstellung') {
    const theme = koerper.theme;
    if (theme !== 'light' && theme !== 'dark' && theme !== 'system') {
      return [fehler(400, 'VALIDATION_ERROR', 'Theme ist light, dark oder system.'), z];
    }
    return [ok({ theme }), { ...z, theme }];
  }

  if (methode === 'POST' && pfad === '/api/auth/logout') {
    return [{ status: 200, json: { message: 'Abgemeldet.' } }, z];
  }

  if (methode === 'POST' && pfad === '/api/auth/login') {
    return [{ status: 200, json: { user: person(z, sprache), token: 'demo' } }, z];
  }

  if (methode === 'POST' && pfad === '/api/rueckmeldungen') {
    const text = typeof koerper.text === 'string' ? koerper.text.trim() : '';
    const appId = typeof koerper.app_id === 'string' ? koerper.app_id : '';
    if (!text || !appId) {
      return [fehler(400, 'VALIDATION_ERROR', 'App und Text sind nötig.'), z];
    }
    const id = z.naechsteId;
    const erstellt_am = jetzt();
    const p = PERSONEN[z.rolle];
    const markierung = koerper.markierung as DemoZustand['meldungen'][number]['markierung'];
    return [
      ok({ id, erstellt_am }, 201),
      {
        ...z,
        naechsteId: id + 1,
        meldungen: [
          ...z.meldungen,
          {
            id,
            app_id: appId,
            stand: koerper.stand === 'test' ? 'test' : 'live',
            seite: typeof koerper.seite === 'string' ? koerper.seite : '/',
            text,
            bild: typeof koerper.bild === 'string' ? koerper.bild : null,
            markierung: markierung ?? null,
            person: { id: p.id, anzeigeName: p[sprache] },
            stand_meldung: 'neu',
            grund: null,
            stand_geaendert_am: null,
            erstellt_am,
          },
        ],
      },
    ];
  }

  const einzeln = pfad.match(/^\/api\/rueckmeldungen\/(\d+)$/);
  if (einzeln && (methode === 'PATCH' || methode === 'DELETE')) {
    if (!entwickler) return [fehler(403, 'FORBIDDEN', 'Nur für Entwickler.'), z];
    const id = Number(einzeln[1]);
    const m = z.meldungen.find(x => x.id === id);
    if (!m) return [fehler(404, 'NOT_FOUND', 'Diese Rückmeldung gibt es nicht.'), z];
    if (methode === 'DELETE') {
      return [
        ok({ id: String(id), entfernt: true }),
        { ...z, meldungen: z.meldungen.filter(x => x.id !== id) },
      ];
    }
    const stand = koerper.stand_meldung;
    if (!STAENDE_MELDUNG.includes(stand as (typeof STAENDE_MELDUNG)[number])) {
      return [fehler(400, 'VALIDATION_ERROR', 'Unbekannter Stand.'), z];
    }
    const grund = typeof koerper.grund === 'string' ? koerper.grund.trim() : '';
    if (stand === 'abgelehnt' && !grund) {
      return [fehler(400, 'VALIDATION_ERROR', 'Eine Ablehnung braucht einen Grund.'), z];
    }
    const neu = {
      ...m,
      stand_meldung: stand as (typeof STAENDE_MELDUNG)[number],
      grund: stand === 'abgelehnt' ? grund : null,
      stand_geaendert_am: jetzt(),
    };
    return [
      ok({ ...meldungAussen(z, neu, sprache), vorher: m.stand_meldung }),
      { ...z, meldungen: z.meldungen.map(x => (x.id === id ? neu : x)) },
    ];
  }

  const schalt = pfad.match(/^\/api\/apps\/([a-z0-9-]+)\/schalten$/);
  if (schalt && methode === 'POST') {
    if (!entwickler) return [fehler(403, 'FORBIDDEN', 'Nur für Entwickler.'), z];
    const app = z.apps.find(x => x.id === schalt[1]);
    if (!app) return [fehler(404, 'NOT_FOUND', 'Diese App gibt es nicht.'), z];
    return schalten(z, app, koerper.ziel);
  }

  return [
    fehler(
      404,
      'NOT_FOUND',
      sprache === 'en'
        ? 'Not available in the demo. On a real Arasul server this works.'
        : 'In der Demo nicht verfügbar. Auf einem echten Arasul-Server geht das.'
    ),
    z,
  ];
}
