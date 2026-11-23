/**
 * Die gespielten Antworten der Demo (J46, J54, M7): an Stelle des Backends.
 *
 * Eine reine Funktion: Anfrage und Zustand hinein, Antwort und neuer Zustand
 * heraus. Der Service Worker (`dienst.ts`) ruft sie für jede Anfrage an
 * `/api/…` und an die Schnittstelle einer App (`/apps/<id>/(test/)api/…`);
 * Tests rufen sie direkt. Die Formen der Plattform sind die des echten
 * Backends (`apps/dashboard-backend/src/routes/`), damit das Frontend nichts
 * von der Demo weiß. Die Schnittstelle der fünf Fach-Apps ist die, die eine
 * App aus dem Kit selbst mitbrächte: Einträge, Stand, Dateien.
 *
 * Was hier nicht steht, beantwortet die Demo mit 404 und einem Satz. Die
 * Verwaltung gehört dem Administrator und ist in der Demo nicht zu sehen.
 */
import {
  FACH_APPS,
  FREIGABE_STAND,
  NACH_FREIGABE,
  PRAEFIX,
  standText,
  txt,
  type AppKennung,
  type Datei,
  type Eintrag,
  type Schritt,
  type Wert,
} from './bestand';
import { dateiErzeugen } from './dokumente';
import { ICH, FIRMA, type DemoApp, type DemoZustand, type Sprache } from './daten';
import { kunde, name, person } from './firma';

export interface Anfrage {
  methode: string;
  /** Pfad ohne Herkunft, z. B. `/api/apps/meine`. */
  pfad: string;
  suche: URLSearchParams;
  koerper: unknown;
}

export interface Antwort {
  status: number;
  /** JSON-Rumpf, oder `null` mit `bytes` für eine Datei. */
  json?: unknown;
  bytes?: Uint8Array<ArrayBuffer>;
  typ?: string;
  /** Der Dateiname für `Content-Disposition`. */
  dateiname?: string;
}

const WERKSTATT = 'werkstatt';
const LOGO_STAND = 'km-1';

const jetzt = () => new Date().toISOString();
const ok = (data: unknown, status = 200): Antwort => ({
  status,
  json: { data, timestamp: jetzt() },
});
const fehler = (status: number, code: string, message: string): Antwort => ({
  status,
  json: { error: { code, message }, timestamp: jetzt() },
});

function profil(z: DemoZustand, sprache: Sprache) {
  return {
    id: ICH.id,
    username: ICH.username,
    email: null,
    role: 'mitarbeiter' as const,
    passwortWechselNoetig: false,
    theme: z.theme,
    vorname: ICH.vorname,
    nachname: ICH.nachname,
    funktion: ICH.funktion[sprache],
    kuerzel: ICH.kuerzel,
    hatBild: false,
    entwickler: true,
    anzeigeName: ICH.anzeigeName,
  };
}

/** `GET /api/apps/meine`: die fünf Fach-Apps, Test samt, und die Werkstatt. */
function meineApps(z: DemoZustand, sprache: Sprache) {
  const apps = z.apps.map(a => ({
    id: a.id,
    name: a.name[sprache],
    beschreibung: a.beschreibung[sprache],
    symbol: a.symbol,
    zeigt_freigaben: Boolean(FREIGABE_STAND[a.id]),
    live: { version: a.live.version, pfad: `/apps/${a.id}/`, api: `/apps/${a.id}/api/` },
    test: a.test
      ? { version: a.test.version, pfad: `/apps/${a.id}/test/`, api: `/apps/${a.id}/test/api/` }
      : null,
  }));
  return [
    ...apps,
    {
      id: WERKSTATT,
      name: 'Werkstatt',
      beschreibung:
        sprache === 'en'
          ? 'Your feedback with its status. With the right to do so: all feedback, test and live versions, the step to live.'
          : 'Ihre Rückmeldungen mit Stand. Mit dem Recht dazu: alle Meldungen, die Fassungen in Test und Live, der Schritt nach Live.',
      symbol: 'hammer',
      mitgeliefert: true,
      live: { version: '2.0.0', pfad: `/apps/${WERKSTATT}/`, api: null },
      test: null,
    },
  ];
}

function meldungAussen(z: DemoZustand, m: DemoZustand['meldungen'][number], sprache: Sprache) {
  const { bild, ...rest } = m;
  return {
    ...rest,
    app_name:
      m.app_id === WERKSTATT
        ? 'Werkstatt'
        : (z.apps.find(a => a.id === m.app_id)?.name[sprache] ?? null),
    hat_bild: Boolean(bild),
  };
}

/** `GET /api/werkstatt/apps`, Form aus `services/app/werkstatt.js`. */
function werkstattApps(z: DemoZustand, sprache: Sprache) {
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
      live: { version: app.vorige_version, eingespielt_am: jetzt(), aenderungstext: null },
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

// ── Die Fach-Apps ───────────────────────────────────────────────────────────

function mitBestand(z: DemoZustand, app: AppKennung, liste: Eintrag[]): DemoZustand {
  return { ...z, bestand: { ...z.bestand, [app]: liste } };
}

const schritt = (text: Schritt['text']): Schritt => ({ am: jetzt(), wer: ICH.id, text });

/** Die Dateien, die ein Stand mit sich bringt: Lieferschein, Protokoll, Antrag. */
function dateienNachziehen(app: AppKennung, e: Eintrag): Eintrag {
  const hat = (id: string) => e.dateien.some(d => d.id === id);
  const neu: Datei[] = [];
  const datei = (id: string, vorlage: Datei['vorlage'], name: Datei['name']) =>
    neu.push({ id, name, art: 'pdf', vorlage, am: jetzt(), wer: ICH.id });
  if (app === 'angebote' && !hat('angebot')) datei('angebot', 'angebot', `${e.nr}.pdf`);
  if (app === 'wareneingang' && e.stand !== 'erwartet' && !hat('lieferschein')) {
    datei('lieferschein', 'lieferschein', {
      de: `Lieferschein-${e.nr}.pdf`,
      en: `Delivery note-${e.nr}.pdf`,
    });
  }
  if (app === 'wartungsplan' && e.stand === 'erledigt' && !hat('protokoll')) {
    datei('protokoll', 'wartung', {
      de: `Wartungsprotokoll-${e.nr}.pdf`,
      en: `Service report-${e.nr}.pdf`,
    });
  }
  if (app === 'pruefprotokolle' && e.stand !== 'offen' && !hat('protokoll')) {
    datei('protokoll', 'pruefung', `${e.nr}.pdf`);
  }
  if (app === 'urlaub' && e.stand === 'genehmigt' && !hat('antrag')) {
    datei('antrag', 'antrag', { de: `Urlaubsantrag-${e.nr}.pdf`, en: `Leave request-${e.nr}.pdf` });
  }
  return neu.length ? { ...e, dateien: [...neu, ...e.dateien] } : e;
}

function felderAusKoerper(roh: unknown): Record<string, Wert> {
  const aus: Record<string, Wert> = {};
  if (!roh || typeof roh !== 'object') return aus;
  for (const [k, v] of Object.entries(roh as Record<string, unknown>)) {
    if (
      v === null ||
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      (typeof v === 'object' && v && 'de' in v && 'en' in v)
    ) {
      aus[k] = typeof v === 'string' ? v.slice(0, 500) : (v as Wert);
    }
  }
  return aus;
}

/** Nach dem Wechsel in einen Stand: was er an Feldern setzt. */
function standFelder(
  app: AppKennung,
  stand: string,
  f: Record<string, Wert>
): Record<string, Wert> {
  const heute = jetzt().slice(0, 10);
  if (app === 'wareneingang' && stand !== 'erwartet' && !f.eingang) return { ...f, eingang: heute };
  if (app === 'wartungsplan' && stand === 'erledigt' && !f.erledigt_am)
    return { ...f, erledigt_am: heute };
  if (app === 'wartungsplan' && stand !== 'erledigt') return { ...f, erledigt_am: null };
  if (app === 'pruefprotokolle' && stand !== 'offen' && !f.ergebnis)
    return { ...f, ergebnis: 'io' };
  return f;
}

const HAUPTVORLAGE: Record<AppKennung, string> = {
  angebote: 'angebot',
  wareneingang: 'lieferschein',
  wartungsplan: 'wartung',
  pruefprotokolle: 'pruefung',
  urlaub: 'antrag',
};

function fachApp(
  a: Anfrage,
  z: DemoZustand,
  app: AppKennung,
  rest: string,
  sprache: Sprache
): [Antwort, DemoZustand] {
  const liste = z.bestand[app];
  const koerper = (a.koerper ?? {}) as Record<string, unknown>;

  if (rest === 'daten' && a.methode === 'GET') {
    return [ok({ eintraege: liste, ich: ICH.id }), z];
  }

  if (rest === 'eintraege' && a.methode === 'POST') {
    const felder = felderAusKoerper(koerper.felder);
    const stand = typeof koerper.stand === 'string' && koerper.stand ? koerper.stand : 'neu';
    const hoechste = liste.reduce((m, e) => Math.max(m, Number(e.nr.split('-').pop()) || 0), 0);
    const breite = (liste[0]?.nr.split('-').pop() ?? '000').length;
    const nr = `${PRAEFIX[app]}${String(hoechste + 1).padStart(breite, '0')}`;
    let e: Eintrag = {
      id: z.naechsterEintrag,
      nr,
      stand,
      felder: standFelder(app, stand, felder),
      dateien: [],
      verlauf: [
        schritt({ de: 'Angelegt', en: 'Created' }),
        ...(stand !== 'neu' && app === 'angebote' && stand === 'freigabe'
          ? [
              schritt({
                de: 'Zur Freigabe an Miriam Kerschner',
                en: 'Sent to Miriam Kerschner for approval',
              }),
            ]
          : []),
      ],
      angelegt_am: jetzt(),
      geaendert_am: jetzt(),
    };
    e = dateienNachziehen(app, e);
    return [
      ok(e, 201),
      { ...mitBestand(z, app, [e, ...liste]), naechsterEintrag: z.naechsterEintrag + 1 },
    ];
  }

  const einzeln = rest.match(/^eintraege\/(\d+)(?:\/(.*))?$/);
  if (!einzeln) return [fehler(404, 'NOT_FOUND', 'Diesen Weg kennt die App nicht.'), z];
  const id = Number(einzeln[1]);
  const unten = einzeln[2] ?? '';
  const e = liste.find(x => x.id === id);
  if (!e) return [fehler(404, 'NOT_FOUND', 'Diesen Eintrag gibt es nicht mehr.'), z];
  const ersetzen = (neu: Eintrag): DemoZustand =>
    mitBestand(
      z,
      app,
      liste.map(x => (x.id === id ? neu : x))
    );

  if (!unten && a.methode === 'DELETE') {
    return [
      ok({ id, entfernt: true }),
      mitBestand(
        z,
        app,
        liste.filter(x => x.id !== id)
      ),
    ];
  }

  if (!unten && a.methode === 'PATCH') {
    const felder = felderAusKoerper(koerper.felder);
    const verlauf = [...e.verlauf];
    let stand = e.stand;
    const geaendert = Object.keys(felder).filter(
      k => JSON.stringify(felder[k]) !== JSON.stringify(e.felder[k])
    );
    if (geaendert.length) verlauf.push(schritt({ de: 'Bearbeitet', en: 'Edited' }));
    if (typeof koerper.stand === 'string' && koerper.stand && koerper.stand !== e.stand) {
      stand = koerper.stand;
      const t = standText(app, stand);
      verlauf.push(schritt({ de: `Stand: ${t.de}`, en: `Status: ${t.en}` }));
    }
    if (typeof koerper.notiz === 'string' && koerper.notiz.trim()) {
      verlauf.push(schritt(koerper.notiz.trim().slice(0, 500)));
    }
    let neu: Eintrag = {
      ...e,
      stand,
      felder: standFelder(app, stand, { ...e.felder, ...felder }),
      verlauf,
      geaendert_am: jetzt(),
    };
    neu = dateienNachziehen(app, neu);
    return [ok(neu), ersetzen(neu)];
  }

  if (unten === 'freigabe' && a.methode === 'POST') {
    return entscheiden(
      z,
      app,
      e,
      koerper.entscheidung === 'ja',
      String(koerper.grund ?? ''),
      sprache
    );
  }

  if (unten === 'dateien' && a.methode === 'POST') {
    const data = typeof koerper.data === 'string' ? koerper.data : '';
    const dateiname = typeof koerper.name === 'string' ? koerper.name.slice(0, 120) : '';
    if (
      !/^data:(application\/pdf|image\/(png|jpeg|webp|gif|svg\+xml));base64,/.test(data) ||
      !dateiname
    ) {
      return [fehler(400, 'VALIDATION_ERROR', 'Nur PDF oder Bild, mit Namen.'), z];
    }
    if (data.length > 3_000_000) {
      return [fehler(413, 'TOO_LARGE', 'Die Datei ist größer als 2 MB.'), z];
    }
    const datei: Datei = {
      id: `d${Date.now().toString(36)}`,
      name: dateiname,
      art: data.startsWith('data:application/pdf') ? 'pdf' : 'bild',
      data,
      am: jetzt(),
      wer: ICH.id,
    };
    const neu: Eintrag = {
      ...e,
      dateien: [datei, ...e.dateien],
      verlauf: [
        ...e.verlauf,
        schritt({ de: `Datei angehängt: ${dateiname}`, en: `File attached: ${dateiname}` }),
      ],
      geaendert_am: jetzt(),
    };
    return [ok(neu, 201), ersetzen(neu)];
  }

  // Der Vorgang als PDF (J55): die Hauptvorlage der App, frisch aus dem Eintrag.
  if (unten === 'pdf' && a.methode === 'GET') {
    const erzeugt = dateiErzeugen(app, e, HAUPTVORLAGE[app], sprache);
    if (!erzeugt) return [fehler(404, 'NOT_FOUND', 'Zu diesem Vorgang gibt es kein PDF.'), z];
    return [{ status: 200, bytes: erzeugt.bytes, typ: erzeugt.typ, dateiname: `${e.nr}.pdf` }, z];
  }

  const dateiWeg = unten.match(/^dateien\/([a-z0-9-]+)$/);
  if (dateiWeg) {
    const d = e.dateien.find(x => x.id === dateiWeg[1]);
    if (!d) return [fehler(404, 'NOT_FOUND', 'Diese Datei gibt es nicht.'), z];
    if (a.methode === 'DELETE') {
      const neu: Eintrag = {
        ...e,
        dateien: e.dateien.filter(x => x.id !== d.id),
        verlauf: [
          ...e.verlauf,
          schritt({
            de: `Datei entfernt: ${txt(d.name, 'de')}`,
            en: `File removed: ${txt(d.name, 'en')}`,
          }),
        ],
        geaendert_am: jetzt(),
      };
      return [ok(neu), ersetzen(neu)];
    }
    if (a.methode === 'GET') {
      const dateiname = txt(d.name, sprache);
      if (d.data) {
        const bytes = bytesAusDataUrl(d.data);
        if (!bytes) return [fehler(404, 'NOT_FOUND', 'Die Datei ist leer.'), z];
        return [{ status: 200, bytes, typ: d.data.slice(5, d.data.indexOf(';')), dateiname }, z];
      }
      const erzeugt = d.vorlage ? dateiErzeugen(app, e, d.vorlage, sprache) : null;
      if (!erzeugt) return [fehler(404, 'NOT_FOUND', 'Diese Datei gibt es nicht.'), z];
      return [{ status: 200, bytes: erzeugt.bytes, typ: erzeugt.typ, dateiname }, z];
    }
  }

  return [fehler(404, 'NOT_FOUND', 'Diesen Weg kennt die App nicht.'), z];
}

function entscheiden(
  z: DemoZustand,
  app: AppKennung,
  e: Eintrag,
  ja: boolean,
  grund: string,
  sprache: Sprache
): [Antwort, DemoZustand] {
  const regel = NACH_FREIGABE[app];
  if (!regel || e.stand !== FREIGABE_STAND[app]) {
    return [fehler(409, 'CONFLICT', 'Dieser Vorgang wartet auf keine Freigabe mehr.'), z];
  }
  if (!ja && !grund.trim()) {
    return [fehler(400, 'VALIDATION_ERROR', 'Eine Ablehnung braucht einen Grund.'), z];
  }
  const stand = ja ? regel.ja : regel.nein;
  let neu: Eintrag = {
    ...e,
    stand,
    felder: !ja && app === 'urlaub' ? { ...e.felder, notiz: grund.trim() } : e.felder,
    verlauf: [
      ...e.verlauf,
      schritt(
        ja
          ? { de: 'Freigegeben', en: 'Approved' }
          : { de: `Abgelehnt: ${grund.trim()}`, en: `Declined: ${grund.trim()}` }
      ),
    ],
    geaendert_am: jetzt(),
  };
  neu = dateienNachziehen(app, neu);
  return [
    ok({ id: e.id, status: ja ? 'bestaetigt' : 'abgelehnt', stand, eintrag: neu, sprache }),
    mitBestand(
      z,
      app,
      z.bestand[app].map(x => (x.id === e.id ? neu : x))
    ),
  ];
}

const tageText = (n: number, sprache: Sprache) =>
  sprache === 'en' ? `${n} ${n === 1 ? 'day' : 'days'}` : `${n} ${n === 1 ? 'Tag' : 'Tage'}`;
const kurzDatum = (iso: string, sprache: Sprache) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(
    sprache === 'en' ? 'en-GB' : 'de-DE',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }
  );

/** Die offenen Freigaben, in der Form von `GET /api/freigabe-anfragen`. */
function freigabeAnfragen(z: DemoZustand, sprache: Sprache) {
  const aus: unknown[] = [];
  for (const app of FACH_APPS) {
    const stand = FREIGABE_STAND[app];
    if (!stand) continue;
    const demoApp = z.apps.find(a => a.id === app)!;
    for (const e of z.bestand[app]) {
      if (e.stand !== stand) continue;
      const f = e.felder;
      const titel =
        app === 'angebote'
          ? `${e.nr} · ${kunde(Number(f.kunde)).name}`
          : app === 'urlaub'
            ? `${name(Number(f.person))} · ${tageText(Number(f.tage), sprache)} ${sprache === 'en' ? 'from' : 'ab'} ${kurzDatum(String(f.von), sprache)}`
            : `${e.nr} · ${txt(f.bauteil, sprache)}`;
      const zusammenhang =
        app === 'angebote'
          ? txt(f.betreff, sprache)
          : app === 'urlaub'
            ? `${kurzDatum(String(f.von), sprache)} – ${kurzDatum(String(f.bis), sprache)}, ${sprache === 'en' ? 'cover' : 'Vertretung'} ${name(Number(f.vertretung))}`
            : String(f.auftrag ?? '');
      const einreicher =
        app === 'urlaub'
          ? Number(f.person)
          : app === 'angebote'
            ? Number(f.bearbeiter)
            : Number(f.pruefer);
      const seit = [...e.verlauf].reverse()[0]?.am ?? e.geaendert_am;
      aus.push({
        id: e.id,
        run_id: e.id,
        app_id: app,
        stand: 'live',
        flow_name: sprache === 'en' ? 'Approval' : 'Freigabe',
        titel,
        zusammenhang,
        frist: new Date(Date.parse(seit) + 7 * 86_400_000).toISOString(),
        angefragt_am: seit,
        einreicher: name(einreicher),
        ohne_einreicher: false,
        benannt: false,
        app_name: demoApp.name[sprache],
        entscheider: null,
        kreis: [ICH.username],
        stufe: null,
        stufe_bezeichnung: null,
        liegt_bei: ICH.username,
        liegt_seit: seit,
        felder: null,
        original: null,
        frueher: [],
        app_zeigt_freigaben: true,
        person_einreicher: person(einreicher).id,
      });
    }
  }
  return aus.sort((x, y) =>
    String((y as { angefragt_am: string }).angefragt_am).localeCompare(
      String((x as { angefragt_am: string }).angefragt_am)
    )
  );
}

/** Das Logo der Firma: ein Monogramm, wie es ein Betrieb hinterlegt. */
function logo(): Antwort {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1f4f8f"/><path d="M14 46V18h6v11l10-11h7L26 30l12 16h-7.5L22 34.5 20 36.7V46z" fill="#fff"/><path d="M38 46V18h5.5l5.5 12 5.5-12H60v28h-5.5V29.5L50.6 38h-3.2L43.5 29.5V46z" fill="#cfe0f5"/></svg>`;
  return {
    status: 200,
    bytes: new TextEncoder().encode(svg) as Uint8Array<ArrayBuffer>,
    typ: 'image/svg+xml',
  };
}

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

  // Die Schnittstelle einer App: Fassung, und bei den Fach-Apps ihre Einträge.
  const appApi = pfad.match(/^\/apps\/([a-z0-9-]+)\/(test\/)?api\/(.+)$/);
  if (appApi) {
    const app = z.apps.find(x => x.id === appApi[1]);
    if (!app) return [fehler(404, 'NOT_FOUND', 'Diese App gibt es nicht.'), z];
    if (appApi[3] === 'fassung') {
      const fassung = appApi[2] ? (app.test ?? app.live) : app.live;
      return [ok({ app: app.id, stand: appApi[2] ? 'test' : 'live', version: fassung.version }), z];
    }
    return fachApp(a, z, app.id, appApi[3]!, sprache);
  }

  if (methode === 'GET') {
    switch (pfad) {
      case '/api/auth/session':
        return [
          {
            status: 200,
            json: { authenticated: true, user: profil(z, sprache), timestamp: jetzt() },
          },
          z,
        ];
      case '/api/auth/me':
        return [{ status: 200, json: { user: profil(z, sprache), timestamp: jetzt() } }, z];
      case '/api/auth/csrf':
        return [{ status: 200, json: { csrfToken: 'demo', timestamp: jetzt() } }, z];
      case '/api/auth/needs-setup':
        return [
          { status: 200, json: { needsSetup: false, firmenname: FIRMA.name, logo: LOGO_STAND } },
          z,
        ];
      case '/api/darstellung/logo':
        return [logo(), z];
      case '/api/health':
        return [{ status: 200, json: { status: 'OK', build_hash: 'dev' } }, z];
      case '/api/apps/meine':
        return [ok(meineApps(z, sprache)), z];
      case '/api/apps/reihenfolge':
        return [ok(z.reihenfolge), z];
      case '/api/freigabe-anfragen':
        return [ok(freigabeAnfragen(z, sprache)), z];
      case '/api/freigabe-anfragen/bei-anderen':
      case '/api/freigabe-anfragen/eingereicht':
      case '/api/ausweise':
        return [ok([]), z];
      case '/api/terminal':
        return [ok({ an: false, entwickler: true, linuxNutzer: null }), z];
      case '/api/profil':
        return [ok(profil(z, sprache)), z];
      case '/api/werkstatt/ich':
        return [ok({ recht: true }), z];
      case '/api/rueckmeldungen':
        return [
          ok(
            [...z.meldungen]
              .sort((x, y) => y.erstellt_am.localeCompare(x.erstellt_am))
              .map(m => meldungAussen(z, m, sprache))
          ),
          z,
        ];
      case '/api/werkstatt/apps':
        return [ok(werkstattApps(z, sprache)), z];
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

  // Eine Freigabe in „Für Sie" entschieden (Rückfall der Shell, Kontrakt 12).
  const freigabe = pfad.match(/^\/api\/freigabe-anfragen\/(\d+)\/(bestaetigen|ablehnen)$/);
  if (freigabe && methode === 'POST') {
    const id = Number(freigabe[1]);
    for (const app of FACH_APPS) {
      const e = z.bestand[app].find(x => x.id === id);
      if (e) {
        return entscheiden(
          z,
          app,
          e,
          freigabe[2] === 'bestaetigen',
          String(koerper.begruendung ?? ''),
          sprache
        );
      }
    }
    return [fehler(404, 'NOT_FOUND', 'Diese Freigabe gibt es nicht.'), z];
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
    return [{ status: 200, json: { user: profil(z, sprache), token: 'demo' } }, z];
  }

  if (methode === 'POST' && pfad === '/api/rueckmeldungen') {
    const text = typeof koerper.text === 'string' ? koerper.text.trim() : '';
    const appId = typeof koerper.app_id === 'string' ? koerper.app_id : '';
    if (!text || !appId) {
      return [fehler(400, 'VALIDATION_ERROR', 'App und Text sind nötig.'), z];
    }
    const id = z.naechsteId;
    const erstellt_am = jetzt();
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
            person: { id: ICH.id, anzeigeName: ICH.anzeigeName },
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
