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
describe('Daten und Freigaben im Kontrakt (J35)', () => {
  it('nennt den einen dauerhaften Ort und was ihn nicht ueberlebt', () => {
    const { daten } = appKontrakt.kontrakt();
    expect(daten.ort).toBe('datenbank');
    expect(daten.je_stand).toBe(true);
    expect(daten.ueberlebt).toEqual(expect.arrayContaining(['einspielen', 'schalten']));
    expect(daten.ueberlebt_nicht).toContain('dateisystem_des_containers');
    expect(daten.regeln.join(' ')).toMatch(/SQLite/);
    expect(daten.wiederherstellen).toBe('/api/backup/wiederherstellung/app/:id');
  });

  it('nennt Einreicher und Entscheider als Schema und als Satz', () => {
    const { freigaben } = appKontrakt.kontrakt();
    expect(freigaben.start.properties).toHaveProperty('einreicher');
    expect(freigaben.start.properties).toHaveProperty('freigabe');
    expect(freigaben.regel.properties).toHaveProperty('ohne_einreicher');
    expect(freigaben.regel.properties.entscheider.properties.rolle.enum).toEqual(['admin']);
    expect(freigaben.regeln.join(' ')).toMatch(/403/);
  });

  it('sagt, wo eine App zum Lauf liest, wer entscheidet', () => {
    const { freigaben } = appKontrakt.kontrakt();
    expect(freigaben.lauf.weg).toBe('/api/v1/external/flows/runs/:id');
    expect(freigaben.lauf.felder).toEqual(
      expect.arrayContaining(['einreicher', 'entscheider', 'kreis', 'satz'])
    );
  });
});

describe('Das Protokoll der Modellaufrufe im Kontrakt (J35)', () => {
  it('nennt die Wege, den Kopf und dass kein Inhalt gespeichert wird', () => {
    const { protokoll } = appKontrakt.kontrakt();
    expect(protokoll.wege).toContain('document/extract-structured');
    expect(protokoll.einreicher.kopf).toBe('X-Arasul-User');
    expect(protokoll.regeln.join(' ')).toMatch(/Ohne Inhalt/);
  });
});

describe('Auslesen und Bilder im Kontrakt (J35)', () => {
  it('nennt Anfrage, Antwort und Fehlschlag des Auslesens als JSON-Schema', () => {
    const { auslesen } = appKontrakt.kontrakt();
    expect(auslesen.weg).toBe('document/extract-structured');
    expect(auslesen.anfrage.required).toEqual(['schema']);
    expect(auslesen.antwort.properties).toHaveProperty('data');
    expect(auslesen.antwort.properties).toHaveProperty('job_id');
    expect(auslesen.antwort.additionalProperties).toBe(false);
    expect(auslesen.fehlschlag.properties.success.const).toBe(false);
    expect(auslesen.regeln.join(' ')).toMatch(/NICHT gegen `schema` geprueft/);
    // Der Weg steht auch unter `endpunkte`, mit demselben Bereich.
    const e = appKontrakt.ENDPUNKTE.find(x => x.relativ === `/${auslesen.weg}`);
    expect(e.bereich).toBe(auslesen.bereich);
  });

  it('sagt, wie ein Bild an ein Bildmodell geht', () => {
    const { bilder } = appKontrakt.kontrakt();
    expect(bilder.weg).toBe('llm/chat');
    expect(bilder.feld).toBe('images');
    expect(bilder.formate).toEqual(['png', 'jpeg']);
    expect(bilder.regeln.join(' ')).toMatch(/400/);
  });
});

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
    //
    // 30.08.2026 (J30): `paket.regeln` hat einen Satz dazubekommen -- die
    // Lizenzgrenze greift wieder beim Einspielen, und das Geraet sagt es jetzt
    // vorher. Die Kontraktversion geht NICHT mit, und der Grund steht in
    // `appKontrakt.js`: ein Kit ohne diesen Satz bekommt dieselbe Abweisung mit
    // derselben Begruendung, aber ein Kit vor einer hoeheren Nummer als es
    // kennt haelt an und spielt gar nichts mehr ein.
    //
    // 21.09.2026 (Bruecke, Kontrakt 6): das Manifest kennt `agent`, die Liste
    // der Routen, die eine App einem Agenten nennt. Die Zahl geht mit, und
    // zwar aus dem Grund, aus dem J30 sie stehen liess -- hier IST ein Kit auf
    // der alten Fassung falsch: es wiese das Feld als unbekannt ab, so wie das
    // Geraet es bis heute tat.
    //
    // 25.09.2026 (J35): zwei Abschnitte kommen dazu, `daten` und `freigaben`,
    // dazu zwei Saetze an Endpunkten und einer in den Flow-Regeln. Die Zahl
    // bleibt bei 6: beides ist freiwillig und additiv, ein Kit ohne die
    // Abschnitte startet Laeufe wie bisher -- und eine 7 hielte das Kit am
    // Orin an, an dem an diesem Tag ein anderer Agent damit baute.
    //
    // 26.09.2026 (J35, ki-aufrufe-einer-app-im-protokoll): der Abschnitt
    // `protokoll` kommt dazu -- welche Wege protokolliert werden und wie eine
    // App den Menschen nennt. Die Zahl bleibt bei 6, aus demselben Grund wie
    // am Vortag: freiwillig und additiv, eine App ohne den Kopf wird
    // trotzdem protokolliert.
    //
    // 26.09.2026 (J35, kontrakt-auslesen-schema-und-bilder): `auslesen`
    // (Anfrage, Antwort und Fehlschlag von document/extract-structured als
    // JSON-Schema) und `bilder` (`images` an llm/chat) kommen dazu, zwei
    // Endpunkte sagen genauer, was sie tun. Die Zahl bleibt bei 6: additiv,
    // eine App, die raet, bekommt dieselbe Antwort wie gestern. Am selben
    // Tag ein Satz in `bilder.regeln` praeziser: gemessen am Orin liest das
    // Bildmodell der Aufgabe `vision` ein Quittungsfoto schlechter als
    // gemma4:e4b, also sagt der Kontrakt nicht mehr, welcher Weg genauer ist,
    // sondern dass eine App `model` nennt und misst. Nur Beschreibung.
    //
    // 26.09.2026 (J35, freigabe-sagt-wer-entscheidet): `GET /flows/runs/:id`
    // nennt unter `freigabe`, wer eingereicht hat, wer entscheidet und wo
    // (`freigaben.lauf`, ein Satz in `freigaben.regeln`, der Endpunkt sagt
    // es), und `GET /freigaben` fuehrt `kreis` mit. Die Zahl bleibt bei 6:
    // additiv, eine App, die das Feld nicht liest, bekommt dieselbe Antwort.
    //
    // 26.09.2026 (J35, bildmodell-vorgabe-und-format): ohne `model` bekommt
    // ein Bild die gemessene Bildvorgabe `gemma4:e4b` (Migration 188) statt
    // `llava-phi3`; zwei Saetze in `bilder.regeln` sagen das. Die Zahl bleibt
    // bei 6: dieselbe Anfrage, dieselbe Form der Antwort, nur ein besseres Modell.
    //
    // 26.09.2026 (J35, flows-im-ki-protokoll-und-auslesen-408): rechnet das
    // Modell nach `timeout_seconds` noch, antworten `llm/chat`,
    // `document/analyze` und `document/extract-structured` mit 202 und
    // `abholen` statt mit 500 (oder nach 60 s mit 408); neu sind `warten`,
    // `auslesen.laeuft`/`abholen`/`abgeholt`, der Abholweg unter `endpunkte`
    // und `flows/:name/run` unter `protokoll.wege`. Die Zahl bleibt bei 6:
    // eine App, die nur 200 liest, bekam vorher an dieser Stelle einen Fehler,
    // und eine 7 hielte das Kit an.
    expect(abdruck).toBe('cab586f8d10dda1fe67e152dcaae33352322fb96d0bdab5d2e945c71176800b1');
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
