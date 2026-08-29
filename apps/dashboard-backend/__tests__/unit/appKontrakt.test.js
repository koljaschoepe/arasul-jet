/**
 * Der Kontrakt zwischen Geraet und Ara-Kit (Phase C5).
 *
 * Der eigentliche Zweck dieser Datei steht ganz unten: der Fingerabdruck. Eine
 * Kontraktversion, die niemand erhoeht, ist schlimmer als keine -- ein Kit
 * verlaesst sich darauf, dass „1" ueberall dasselbe bedeutet. Diese Pruefung
 * ist die einzige Stelle, an der diese Zahl ueberhaupt eine Bedeutung bekommt.
 */
const crypto = require('crypto');

process.env.APPS_DIR = '/tmp/arasul-kontrakt-test';

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const appKontrakt = require('../../src/services/app/appKontrakt');
const { KOPF_BENUTZER, KOPF_ROLLE } = require('../../src/services/app/appZugang');
const { VORGABE_ENDPUNKTE, ALLE_ENDPUNKTE } = require('../../src/config/apiBereiche');

describe('Der Kontrakt sagt, was das Kit wissen muss', () => {
  const k = appKontrakt.kontrakt();

  it('traegt eine Kontraktversion', () => {
    expect(k.kontrakt).toBe(appKontrakt.KONTRAKT_VERSION);
    expect(Number.isInteger(k.kontrakt)).toBe(true);
  });

  it('gibt app.json als JSON-Schema aus, aus der Sicht dessen, der es schreibt', () => {
    expect(k.app_json.schema.type).toBe('object');
    // Pflicht ist genau das, was ein Mensch tippen MUSS. Felder mit Vorgabe
    // (`ressourcen`, `modelle`) und optionale (`flows`) stehen nicht dabei --
    // das ist der Unterschied zwischen der Eingabe- und der Ausgabesicht.
    expect(k.app_json.schema.required.sort()).toEqual(['id', 'name', 'schema', 'version']);
    expect(k.app_json.schema.properties.backend.properties.bauen).toBeDefined();
    expect(k.app_json.schema.additionalProperties).toBe(false);
  });

  it('nennt die Regeln, die kein JSON-Schema traegt', () => {
    // `z.toJSONSchema` uebergeht jede `.refine`-Regel still. Genau die
    // interessanten sind Refinements -- ohne diesen Text haelt ein Kit ein
    // Manifest fuer gueltig, das das Geraet abweist.
    expect(k.app_json.schema.properties.id.pattern).toBeDefined();
    expect(JSON.stringify(k.app_json.schema)).not.toContain('Teststand');
    expect(k.app_json.regeln.join(' ')).toMatch(/Teststand/);
    expect(k.app_json.regeln.join(' ')).toMatch(/Mindestens eines/);
  });

  it('gibt das Flow-Frontmatter als JSON-Schema aus', () => {
    expect(k.flow_frontmatter.schema.type).toBe('object');
    expect(k.flow_frontmatter.schema.properties.werkzeuge).toBeDefined();
    expect(k.flow_frontmatter.rumpf).toMatch(/systemPrompt/);
  });

  it('nennt die Regeln, die nur fuer einen Flow AUS EINEM PAKET gelten (C6)', () => {
    // Sie stehen nicht im JSON-Schema, weil sie keine sind: der Dateiname als
    // Name, das verbotene `ordner`, der Namensraum je App. Ein Kit, das nur
    // `FlowDefinition` prueft, schickte ein Paket, das das Geraet abweist.
    const regeln = k.flow_frontmatter.regeln.join(' ');
    expect(regeln).toMatch(/Dateiname/);
    expect(regeln).toMatch(/ordner/);
    expect(regeln).toMatch(/Namensraum/);
  });

  it('sagt, dass `flows` eine Lieferung ist und `modelle` eine Forderung (C6)', () => {
    // Der eigentliche Unterschied zwischen Kontrakt 1 und 2. Ein Kit, das
    // `"flows": ["a"]` schreibt, bekommt vom Geraet ein 400 -- es soll das
    // hier lesen koennen, bevor es packt.
    expect(k.app_json.regeln.join(' ')).toMatch(/`flows` ist umgekehrt eine LIEFERUNG/);
    expect(k.paket.wurzel).toContain('<flows.verzeichnis>/');
  });

  it('nennt die Kopfzeilen mit denselben Namen, die die Anmeldung setzt', () => {
    expect(k.koepfe.benutzer).toBe(KOPF_BENUTZER);
    expect(k.koepfe.rolle).toBe(KOPF_ROLLE);
    expect(k.koepfe.rollen).toEqual(['admin', 'mitarbeiter']);
  });

  it('nennt die Bereiche eines Schluessels so, wie die Pruefung sie kennt', () => {
    expect(k.schluessel.bereiche).toEqual([...ALLE_ENDPUNKTE]);
    expect(k.schluessel.vorgabe).toEqual([...VORGABE_ENDPUNKTE]);
    // Der entscheidende Satz der Phase: was das Geraet einer App mitgibt,
    // erlaubt kein Deployen.
    expect(k.schluessel.vorgabe).not.toContain('app:deploy');
  });

  it('nennt zu jedem Endpunkt den Bereich, den er verlangt', () => {
    const bekannt = new Set(ALLE_ENDPUNKTE);
    for (const e of k.endpunkte) {
      expect(e.verb).toMatch(/^(GET|POST|DELETE)$/);
      expect(e.pfad.startsWith('/api/v1/external')).toBe(true);
      if (e.bereich !== null) {
        expect(bekannt.has(e.bereich)).toBe(true);
      }
    }
    const deploy = k.endpunkte.find(e => e.verb === 'POST' && e.pfad === '/api/v1/external/apps');
    expect(deploy.bereich).toBe('app:deploy');
  });

  it('sagt, wie ein Paket zu packen ist', () => {
    expect(k.paket.format).toBe('tar.gz');
    expect(k.paket.packen).toMatch(/-C <ordner> \./);
    expect(k.paket.regeln.join(' ')).toMatch(/Teststand/);
  });
});

/**
 * Der Fingerabdruck.
 *
 * Er faellt um, sobald sich am Kontrakt irgendetwas aendert -- ein Feld, ein
 * Endpunkt, eine Regel, ein Name. Das ist Absicht und keine Schikane: wer
 * hier vorbeikommt, hat gerade den Vertrag mit einem fremden Repository
 * geaendert und muss eine von zwei Entscheidungen treffen.
 *
 *   1. Es ist eine Aenderung, auf die sich ein Kit verlassen hat
 *      -> `KONTRAKT_VERSION` erhoehen UND diesen Wert nachziehen.
 *   2. Es ist nur eine Beschreibung, die praeziser wurde
 *      -> nur diesen Wert nachziehen, mit einem Satz im Commit, warum.
 *
 * Der neue Wert steht in der Fehlermeldung dieses Tests.
 *
 * `arasul` bleibt aussen vor: das ist die Systemversion, sie aendert sich mit
 * jedem Release und sagt nichts ueber den Vertrag.
 */
describe('Der Fingerabdruck des Kontraktes', () => {
  /** JSON mit sortierten Schluesseln -- sonst haengt der Abdruck an der Reihenfolge. */
  function stabil(wert) {
    if (Array.isArray(wert)) {
      return `[${wert.map(stabil).join(',')}]`;
    }
    if (wert && typeof wert === 'object') {
      return `{${Object.keys(wert)
        .sort()
        .map(s => `${JSON.stringify(s)}:${stabil(wert[s])}`)
        .join(',')}}`;
    }
    return JSON.stringify(wert);
  }

  it('ist unveraendert, oder die Kontraktversion ist mitgegangen', () => {
    const ohneSystemversion = { ...appKontrakt.kontrakt() };
    delete ohneSystemversion.arasul;
    const abdruck = crypto.createHash('sha256').update(stabil(ohneSystemversion)).digest('hex');

    // Phase H7 (Kontrakt 5): `umgebung` nennt die Namen in ihrer Rolle statt
    // als Schluessel einer Abbildung, jeder Endpunkt traegt seinen Weg auch
    // relativ zur Basis, und `umgebung.datenbank` kommt dazu. Alle drei sind
    // Zusagen, auf die sich ein Kit verlassen soll, also ist die Zahl
    // mitgegangen.
    // (Davor H6, Kontrakt 4: `marken` im Manifest. Davor C7, Kontrakt 3:
    // `freigabe_anfordern` im Werkzeug-Schema und `GET /freigaben`.)
    expect(abdruck).toBe('69e07027d98471974eccdb8b5cdaef94f3f73e0a3c336085336f214c364dd545');
  });

  /**
   * Das Praefix steht an zwei Stellen, und es muss beide Male dasselbe sein.
   *
   * `appKontrakt.PRAEFIX` rechnet jeden `relativ`-Weg aus; `appSchluessel.API_URL`
   * ist die Adresse, die die App wirklich bekommt. Laufen die beiden
   * auseinander, ist `relativ` ueberall falsch -- und zwar auf genau die Art,
   * die am Orin einen 404 erzeugt hat: ein Weg, den es nicht gibt, aus zwei
   * Angaben, die einzeln stimmen.
   */
  it('das Praefix des Kontraktes ist das Ende der Adresse, die eine App bekommt', () => {
    const appSchluessel = require('../../src/services/app/appSchluessel');
    expect(appSchluessel.API_URL.endsWith(appKontrakt.PRAEFIX)).toBe(true);
  });

  it('jeder Endpunkt unter dem Praefix nennt seinen Weg auch relativ', () => {
    for (const e of appKontrakt.ENDPUNKTE) {
      expect(`${appKontrakt.PRAEFIX}${e.relativ}`).toBe(e.pfad);
    }
  });
});
