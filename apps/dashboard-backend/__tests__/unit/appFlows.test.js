/**
 * Die Flows einer App (Phase C6).
 *
 * Gemessen wird das, was zwischen Paket und Lauf schiefgehen kann: ein Flow,
 * der zwei Namen traegt; ein Flow, der sich Ordner am Geraet nimmt; ein
 * Update, das die Einstellung des Administrators mitnimmt; und die Frage, an
 * der die ganze Phase haengt -- sieht eine App die Flows einer anderen.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// `transaction` reicht einen Client durch, der auf denselben Spion zeigt:
// so bleibt `db.query.mock.calls` die eine Stelle, an der die Abfragen dieses
// Tests stehen, egal ob sie in einer Transaktion liefen.
jest.mock('../../src/database', () => {
  const query = jest.fn();
  return { query, transaction: jest.fn(cb => cb({ query })) };
});
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const db = require('../../src/database');
const appFlows = require('../../src/services/app/appFlows');

const PAKET = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-appflows-'));
afterAll(() => fs.rmSync(PAKET, { recursive: true, force: true }));
beforeEach(() => {
  db.query.mockReset();
  db.transaction.mockClear();
});

const MANIFEST = { id: 'urlaub', version: '1.0.0', flows: { verzeichnis: 'flows' } };

/** Legt einen Paketordner mit den gegebenen Flow-Dateien an. */
function paketMit(dateien, verzeichnis = 'flows') {
  const ordner = fs.mkdtempSync(path.join(PAKET, 'p-'));
  if (dateien !== null) {
    fs.mkdirSync(path.join(ordner, verzeichnis), { recursive: true });
    for (const [name, inhalt] of Object.entries(dateien)) {
      fs.writeFileSync(path.join(ordner, verzeichnis, name), inhalt);
    }
  }
  return ordner;
}

const BERICHT = `---
name: bericht
beschreibung: Fasst die Woche zusammen.
modell: qwen3:14b-q8
argumente:
  - name: woche
    typ: freitext
    pflicht: true
---
Fasse die Woche {{woche}} zusammen.
`;

describe('leseAusPaket', () => {
  it('liest die Flows eines Pakets und nimmt den Dateinamen als Namen', async () => {
    const gelesen = await appFlows.leseAusPaket(MANIFEST, paketMit({ 'bericht.md': BERICHT }));
    expect(gelesen).toHaveLength(1);
    expect(gelesen[0].name).toBe('bericht');
    expect(gelesen[0].definition.modell).toBe('qwen3:14b-q8');
    expect(gelesen[0].definition.systemPrompt).toMatch(/\{\{woche\}\}/);
  });

  it('gibt eine leere Liste, wenn das Manifest keine Flows ankuendigt', async () => {
    // Ein Paket ohne `flows` ist kein Fehler -- die meisten Apps haben keine.
    expect(await appFlows.leseAusPaket({ id: 'x', version: '1.0.0' }, PAKET)).toEqual([]);
  });

  it('weist ein Paket ab, dessen versprochener Flow-Ordner fehlt', async () => {
    await expect(appFlows.leseAusPaket(MANIFEST, paketMit(null))).rejects.toThrow(
      /verspricht Flows/
    );
  });

  it('weist einen leeren Flow-Ordner ab', async () => {
    // Nicht still durchwinken: `flows` im Manifest ist eine Zusage, und eine
    // Zusage ohne Inhalt ist ein Tippfehler, kein Zustand.
    await expect(appFlows.leseAusPaket(MANIFEST, paketMit({}))).rejects.toThrow(
      /keine einzige .md-Datei/
    );
  });

  it('weist einen Flow ab, dessen Kopf anders heisst als seine Datei', async () => {
    // Ein Flow mit zwei Namen ist einer, den man beim naechsten Mal nicht
    // wiederfindet: die Datenbank kennt ihn unter dem einen, der Partner sucht
    // ihn unter dem anderen.
    const ordner = paketMit({ 'bericht.md': BERICHT.replace('name: bericht', 'name: anders') });
    await expect(appFlows.leseAusPaket(MANIFEST, ordner)).rejects.toThrow(
      /Dateiname und "name" muessen dasselbe sagen/
    );
  });

  it('weist einen Flow ab, der sich Ordner am Geraet nimmt', async () => {
    // Der eigentliche Riegel: `ordner` sind absolute Pfade, und ein Paket
    // koennte damit `/arasul/config` deklarieren und die Umgebungsdatei
    // ausliefern lassen.
    const boese = `---
name: leck
werkzeuge: [dateien_lesen]
ordner: ['/arasul/config']
---
Lies alles.
`;
    await expect(
      appFlows.leseAusPaket(MANIFEST, paketMit({ 'leck.md': boese }))
    ).rejects.toThrow(/ohne Ordner am Geraet/);
  });

  it('weist einen Dateinamen ab, der kein Flow-Name ist', async () => {
    const ordner = paketMit({ 'Mein Bericht.md': BERICHT });
    await expect(appFlows.leseAusPaket(MANIFEST, ordner)).rejects.toThrow(/kein Flow-Name/);
  });

  it('reicht den Fehler des Parsers durch, statt ihn zu verschlucken', async () => {
    const ordner = paketMit({ 'kaputt.md': '---\nname: [nicht\n---\nRumpf\n' });
    await expect(appFlows.leseAusPaket(MANIFEST, ordner)).rejects.toThrow(/YAML|ungültig/);
  });

  it('nimmt das Verzeichnis aus dem Manifest, nicht den Namen `flows`', async () => {
    const ordner = paketMit({ 'bericht.md': BERICHT }, 'ablaeufe');
    const gelesen = await appFlows.leseAusPaket(
      { ...MANIFEST, flows: { verzeichnis: 'ablaeufe' } },
      ordner
    );
    expect(gelesen).toHaveLength(1);
  });
});

describe('registriere', () => {
  /** Was `leseAusPaket` liefert -- der Aufrufer liest frueh und schreibt spaet. */
  async function gelesen(dateien) {
    return appFlows.leseAusPaket(MANIFEST, paketMit(dateien));
  }

  it('ersetzt die Flows eines Standes, statt sie zu ergaenzen', async () => {
    const flows = await gelesen({ 'bericht.md': BERICHT });
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    const namen = await appFlows.registriere({
      appId: 'urlaub',
      stand: 'test',
      version: '1.0.0',
      flows,
    });
    expect(namen).toEqual(['bericht']);

    // Erst weg, dann hin: was der Stand hat, sagt das Paket, das gerade
    // eingespielt wird. Ein Flow, den die neue Version nicht mehr mitbringt,
    // bliebe sonst startbar, ohne dass ihn noch jemand pflegt.
    expect(db.query.mock.calls[0][0]).toMatch(/DELETE FROM public\.app_flows/);
    expect(db.query.mock.calls[0][1]).toEqual(['urlaub', 'test']);
    expect(db.query.mock.calls[1][0]).toMatch(/INSERT INTO public\.app_flows/);
    expect(db.query.mock.calls[1][1].slice(0, 4)).toEqual(['urlaub', 'test', 'bericht', '1.0.0']);
  });

  it('laeuft in EINER Transaktion -- kein halb registrierter Stand', async () => {
    // Der Aufruf steht hinter dem Stand und dem Container. Risse die
    // Verbindung zwischen dem DELETE und den INSERTs, stuende `app_staende`
    // auf der neuen Version und `app_flows` waere leer -- ein Flow des
    // Partners waere still weg, ohne Fehlermeldung.
    const flows = await gelesen({ 'bericht.md': BERICHT, 'pruefen.md': BERICHT.replace(/bericht/g, 'pruefen') });
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });

    await appFlows.registriere({ appId: 'urlaub', stand: 'test', version: '1.0.0', flows });

    // EINE Transaktion fuer das DELETE und BEIDE INSERTs, nicht drei.
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledTimes(3);
  });

  it('raeumt auch dann auf, wenn das neue Manifest gar keine Flows mehr nennt', async () => {
    db.query.mockResolvedValue({ rows: [], rowCount: 1 });
    const namen = await appFlows.registriere({
      appId: 'urlaub',
      stand: 'live',
      version: '2.0.0',
      flows: [],
    });
    expect(namen).toEqual([]);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toMatch(/DELETE FROM public\.app_flows/);
  });

  it('fasst `flow_settings` nicht an -- die Ueberschreibung ueberlebt ein Update', async () => {
    const flows = await gelesen({ 'bericht.md': BERICHT });
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await appFlows.registriere({
      appId: 'urlaub',
      stand: 'test',
      version: '1.1.0',
      flows,
    });
    const alles = db.query.mock.calls.map(c => c[0]).join('\n');
    expect(alles).not.toMatch(/flow_settings/);
  });
});

describe('lade', () => {
  it('setzt die Ueberschreibung des Administrators ueber das Modell des Pakets', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ name: 'bericht', version: '1.0.0', definition: { name: 'bericht', modell: 'aus-dem-paket' } }],
      })
      .mockResolvedValueOnce({ rows: [{ flow_name: 'bericht', modell: 'vom-admin' }] });

    const flow = await appFlows.lade({ appId: 'urlaub', stand: 'live', name: 'bericht' });
    expect(flow.modell).toBe('vom-admin');
  });

  it('laesst das Modell des Pakets stehen, wenn niemand etwas ueberschrieben hat', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ name: 'bericht', version: '1.0.0', definition: { name: 'bericht', modell: 'aus-dem-paket' } }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const flow = await appFlows.lade({ appId: 'urlaub', stand: 'live', name: 'bericht' });
    expect(flow.modell).toBe('aus-dem-paket');
  });

  it('sucht IMMER in App und Stand -- eine App findet den Flow einer anderen nicht', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(
      appFlows.lade({ appId: 'urlaub', stand: 'live', name: 'fremd' })
    ).rejects.toThrow(/keinen Flow "fremd"/);
    // Der Namensraum steht in der Abfrage und nicht in einer Pruefung
    // daneben: eine Pruefung kann man vergessen, ein WHERE nicht.
    expect(db.query.mock.calls[0][1]).toEqual(['urlaub', 'live', 'fremd']);
  });
});

/**
 * Das externe Modell faellt in `lade` ein (Phase D4).
 *
 * Die Zusage, die hier gehalten wird: der Schluessel wird NUR entschluesselt,
 * wo er auch benutzt wird. Ein zweiter Aufrufer derselben Funktion (die
 * externe Route, fuer die Argumente eines Flows) bekommt ihn gar nicht erst in
 * seinen Speicher.
 */
describe('lade mit externem Modell (Phase D4)', () => {
  const flowSettings = require('../../src/services/flows/flowSettings');

  function flowInDerDatenbank() {
    db.query.mockResolvedValueOnce({
      rows: [{ name: 'bericht', version: '1.0.0', definition: { modell: 'aus-dem-paket' } }],
    });
  }

  test('ohne `mitZugang` wird nichts entschluesselt', async () => {
    flowInDerDatenbank();
    jest.spyOn(flowSettings, 'hole').mockResolvedValue({ extern_anbieter: 'OpenAI' });
    const spion = jest.spyOn(flowSettings, 'externerZugang');

    const flow = await appFlows.lade({ appId: 'urlaub', stand: 'live', name: 'bericht' });

    expect(spion).not.toHaveBeenCalled();
    expect(flow.extern).toBeUndefined();
    spion.mockRestore();
    flowSettings.hole.mockRestore();
  });

  test('mit `mitZugang` bekommt der Runner Modell UND Zugang', async () => {
    flowInDerDatenbank();
    jest.spyOn(flowSettings, 'hole').mockResolvedValue({ extern_anbieter: 'OpenAI' });
    jest.spyOn(flowSettings, 'externerZugang').mockResolvedValue({
      anbieter: 'OpenAI',
      modell: 'gpt-4o',
      basisUrl: 'https://api.example.test/v1',
      schluessel: 'sk-geheim',
    });

    const flow = await appFlows.lade({
      appId: 'urlaub',
      stand: 'live',
      name: 'bericht',
      mitZugang: true,
    });

    // Das Modell, das GILT, ist das des Anbieters -- nicht das aus dem Paket.
    expect(flow.modell).toBe('gpt-4o');
    expect(flow.extern.basisUrl).toBe('https://api.example.test/v1');
    flowSettings.externerZugang.mockRestore();
    flowSettings.hole.mockRestore();
  });
});
