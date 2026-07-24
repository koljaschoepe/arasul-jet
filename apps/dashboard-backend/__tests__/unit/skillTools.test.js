/**
 * Skill-Werkzeuge für Dateien und Wissensbasis (Plan 011, Schritt 6).
 *
 * Die Datei-Werkzeuge arbeiten gegen einen echten temporären Baum — bei einem
 * Werkzeug, dessen ganze Aufgabe der kontrollierte Dateizugriff ist, würde ein
 * gemocktes `fs` genau die Zusage wegtesten.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../../src/utils/logger');
jest.mock('../../src/services/rag/ragCore');

const ragCore = require('../../src/services/rag/ragCore');
const {
  DateienLesenTool,
  DateienSchreibenTool,
} = require('../../src/services/skills/tools/dateien');
const { DateiSuchenTool } = require('../../src/services/skills/tools/suche');
const RagSucheTool = require('../../src/services/skills/tools/rag');
const TerminalTool = require('../../src/services/skills/tools/terminal');
const { buildTools, implementedTools } = require('../../src/services/skills/toolRegistry');

let base, arbeit, zweit, aussen;

beforeAll(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-tools-'));
  arbeit = path.join(base, 'arbeit');
  zweit = path.join(base, 'zweit');
  aussen = path.join(base, 'aussen');
  for (const d of [arbeit, zweit, aussen]) {
    fs.mkdirSync(d, { recursive: true });
  }
  fs.writeFileSync(path.join(arbeit, 'notiz.md'), 'Inhalt der Notiz');
  fs.writeFileSync(path.join(zweit, 'vorlage.md'), 'Inhalt der Vorlage');
  fs.writeFileSync(path.join(aussen, 'geheim.txt'), 'GEHEIM');
});

afterAll(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

const ctx = (extra = {}) => ({ roots: [arbeit, zweit], ...extra });

describe('dateien_lesen', () => {
  const tool = new DateienLesenTool();

  it('heisst wie im Schema deklariert', () => {
    expect(tool.name).toBe('dateien_lesen');
  });

  it('listet das Arbeitsverzeichnis', async () => {
    const out = await tool.execute({ aktion: 'list' }, ctx());
    expect(out).toContain('notiz.md');
  });

  it('liest eine Datei im Arbeitsverzeichnis', async () => {
    const out = await tool.execute({ aktion: 'read', pfad: 'notiz.md' }, ctx());
    expect(out).toBe('Inhalt der Notiz');
  });

  it('liest eine Datei im zweiten Ordner über den vollen Pfad', async () => {
    const out = await tool.execute({ aktion: 'read', pfad: path.join(zweit, 'vorlage.md') }, ctx());
    expect(out).toBe('Inhalt der Vorlage');
  });

  it('verweigert den Zugriff ausserhalb der erlaubten Ordner', async () => {
    const out = await tool.execute({ aktion: 'read', pfad: '../aussen/geheim.txt' }, ctx());
    expect(out).toMatch(/^Fehler:/);
    expect(out).not.toContain('GEHEIM');
  });

  it('verweigert einen absoluten Pfad ausserhalb', async () => {
    const out = await tool.execute(
      { aktion: 'read', pfad: path.join(aussen, 'geheim.txt') },
      ctx()
    );
    expect(out).toMatch(/^Fehler:/);
    expect(out).not.toContain('GEHEIM');
  });

  it('meldet eine fehlende Datei als Text, statt zu werfen', async () => {
    const out = await tool.execute({ aktion: 'read', pfad: 'gibtsnicht.md' }, ctx());
    expect(out).toMatch(/existiert nicht/i);
  });

  it('meldet fehlende Ordner-Freigabe verständlich', async () => {
    const out = await tool.execute({ aktion: 'list' }, { roots: [] });
    expect(out).toMatch(/kein erlaubter Ordner/i);
  });

  it('weist eine unbekannte aktion ab', async () => {
    const out = await tool.execute({ aktion: 'loeschen', pfad: 'x' }, ctx());
    expect(out).toMatch(/Unbekannte aktion/i);
  });

  it('kappt sehr grosse Dateien (Kontext-Schutz)', async () => {
    const gross = path.join(arbeit, 'gross.txt');
    fs.writeFileSync(gross, 'x'.repeat(300 * 1024));
    try {
      const out = await tool.execute({ aktion: 'read', pfad: 'gross.txt' }, ctx());
      expect(out).toMatch(/gekuerzt bei/);
      expect(out.length).toBeLessThan(300 * 1024);
    } finally {
      fs.unlinkSync(gross);
    }
  });

  /**
   * Regression: Der Deckel ist ein BYTE-Deckel. Frueher wurde mit
   * `String.slice` gekappt, das UTF-16-Einheiten zaehlt — bei Umlauten, CJK
   * oder Emoji rutschte eine 400-KB-Datei damit fast vollstaendig durch. Bei
   * deutschem Fliesstext ist das der Normalfall, nicht der Sonderfall.
   */
  it.each([
    ['Umlaute', 'ä'],
    ['CJK', '漢'],
    ['Emoji', '😀'],
  ])('haelt den Byte-Deckel auch bei Mehrbyte-Zeichen (%s)', async (_name, zeichen) => {
    const datei = path.join(arbeit, 'mehrbyte.txt');
    fs.writeFileSync(datei, zeichen.repeat(200 * 1024));
    try {
      const out = await tool.execute({ aktion: 'read', pfad: 'mehrbyte.txt' }, ctx());
      expect(out).toMatch(/gekuerzt bei/);
      // 256 KB plus den Hinweistext — nicht das Vielfache davon.
      expect(Buffer.byteLength(out, 'utf8')).toBeLessThan(256 * 1024 + 200);
      // Kein zerschnittenes Zeichen am Ende des Inhalts.
      expect(out.split('\n... [gekuerzt')[0]).not.toMatch(/\uFFFD$/);
    } finally {
      fs.unlinkSync(datei);
    }
  });
});

describe('dateien_schreiben', () => {
  const tool = new DateienSchreibenTool();

  it('legt eine neue Datei an und meldet das', async () => {
    const out = await tool.execute({ pfad: 'neu.md', inhalt: 'Hallo' }, ctx());
    expect(out).toMatch(/angelegt/);
    expect(fs.readFileSync(path.join(arbeit, 'neu.md'), 'utf8')).toBe('Hallo');
  });

  it('legt ein noch nicht existierendes Arbeitsverzeichnis an', async () => {
    // Ohne das koennte ein Skill, dessen Ordner erst entstehen soll, nie
    // schreiben: die Pfad-Sperre findet keine existierende Wurzel und bricht ab.
    const frisch = path.join(base, 'gibt-es-noch-nicht');
    expect(fs.existsSync(frisch)).toBe(false);
    const out = await tool.execute({ pfad: 'erste.md', inhalt: 'da' }, { roots: [frisch] });
    expect(out).toMatch(/angelegt/);
    expect(fs.readFileSync(path.join(frisch, 'erste.md'), 'utf8')).toBe('da');
  });

  it('legt fehlende Unterordner mit an', async () => {
    await tool.execute({ pfad: 'tief/drin/datei.md', inhalt: 'X' }, ctx());
    expect(fs.existsSync(path.join(arbeit, 'tief/drin/datei.md'))).toBe(true);
  });

  it('meldet Überschreiben als solches und ersetzt den Inhalt', async () => {
    // Die inhaltliche Vorher/Nachher-Übersicht liefert der Runner über den
    // Ordner-Abzug (changeTracker.js), nicht dieses Werkzeug — hier zählt nur,
    // dass „ueberschrieben" gemeldet und der Inhalt wirklich ersetzt wird.
    fs.writeFileSync(path.join(arbeit, 'alt.md'), 'ALT');
    const out = await tool.execute({ pfad: 'alt.md', inhalt: 'NEU' }, ctx());
    expect(out).toMatch(/ueberschrieben/);
    expect(fs.readFileSync(path.join(arbeit, 'alt.md'), 'utf8')).toBe('NEU');
  });

  it('schreibt NICHT ausserhalb der erlaubten Ordner', async () => {
    const ziel = path.join(aussen, 'eingeschleust.txt');
    const out = await tool.execute({ pfad: '../aussen/eingeschleust.txt', inhalt: 'X' }, ctx());
    expect(out).toMatch(/^Fehler:/);
    expect(fs.existsSync(ziel)).toBe(false);
  });

  it('folgt keinem Symlink aus den Ordnern heraus', async () => {
    const link = path.join(arbeit, 'raus');
    fs.symlinkSync(path.join(aussen, 'via-symlink.txt'), link);
    try {
      const out = await tool.execute({ pfad: 'raus', inhalt: 'X' }, ctx());
      expect(out).toMatch(/^Fehler:/);
      expect(fs.existsSync(path.join(aussen, 'via-symlink.txt'))).toBe(false);
    } finally {
      fs.unlinkSync(link);
    }
  });

  it('lehnt zu grosse Inhalte ab', async () => {
    const out = await tool.execute(
      { pfad: 'zugross.txt', inhalt: 'x'.repeat(2 * 1024 * 1024) },
      ctx()
    );
    expect(out).toMatch(/Limit/);
    expect(fs.existsSync(path.join(arbeit, 'zugross.txt'))).toBe(false);
  });
});

describe('rag_suche', () => {
  const tool = new RagSucheTool();

  beforeEach(() => {
    jest.clearAllMocks();
    ragCore.getEmbedding.mockResolvedValue([0.1, 0.2]);
    ragCore.hybridSearch.mockResolvedValue([
      { payload: { document_name: 'Handbuch', text: 'Die Antwort steht hier.' } },
    ]);
  });

  it('gibt Fundstellen mit Quelle zurück', async () => {
    const out = await tool.execute({ frage: 'Wie geht das?' }, {});
    expect(out).toContain('[Handbuch]');
    expect(out).toContain('Die Antwort steht hier.');
  });

  it('schneidet die Suche auf die übergebenen Sammlungen zu', async () => {
    await tool.execute({ frage: 'X' }, { spaceIds: ['s1'] });
    expect(ragCore.hybridSearch).toHaveBeenCalledWith('X', expect.anything(), 5, ['s1']);
  });

  it('sucht ohne Zuschnitt über alles (spaceIds = null)', async () => {
    await tool.execute({ frage: 'X' }, { spaceIds: [] });
    expect(ragCore.hybridSearch).toHaveBeenCalledWith('X', expect.anything(), 5, null);
  });

  it('deckelt die Trefferzahl, damit das Modell sich nicht selbst flutet', async () => {
    await tool.execute({ frage: 'X', anzahl: 500 }, {});
    expect(ragCore.hybridSearch).toHaveBeenCalledWith('X', expect.anything(), 15, null);
  });

  it('fällt bei unsinniger Trefferzahl auf den Standard zurück', async () => {
    await tool.execute({ frage: 'X', anzahl: -3 }, {});
    expect(ragCore.hybridSearch).toHaveBeenCalledWith('X', expect.anything(), 5, null);
  });

  it('meldet eine leere Frage als Fehler', async () => {
    expect(await tool.execute({ frage: '  ' }, {})).toMatch(/^Fehler:/);
  });

  it('gibt bei leerem Ergebnis eine klare Meldung statt eines Fehlers', async () => {
    ragCore.hybridSearch.mockResolvedValue([]);
    expect(await tool.execute({ frage: 'X' }, {})).toMatch(/Nichts gefunden/i);
  });

  it('bricht den Lauf nicht ab, wenn die Suche ausfällt', async () => {
    ragCore.getEmbedding.mockRejectedValue(new Error('Embedding-Dienst weg'));
    const out = await tool.execute({ frage: 'X' }, {});
    expect(out).toMatch(/nicht moeglich/i);
    expect(out).toContain('Embedding-Dienst weg');
  });
});

describe('dateien_suchen', () => {
  const tool = new DateiSuchenTool();
  let suchbaum, sub;

  beforeAll(() => {
    // Eigener kleiner Baum, damit die Glob-/grep-Zählungen stabil sind.
    suchbaum = path.join(base, 'suche');
    sub = path.join(suchbaum, 'unter');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(suchbaum, 'a.md'), 'Hallo Welt\nzweite Zeile mit TREFFER');
    fs.writeFileSync(path.join(suchbaum, 'b.txt'), 'nur text ohne muster');
    fs.writeFileSync(path.join(sub, 'c.md'), 'TREFFER auch hier tief');
  });

  const sctx = (extra = {}) => ({ roots: [suchbaum], ...extra });

  it('heisst wie im Schema deklariert', () => {
    expect(tool.name).toBe('dateien_suchen');
  });

  it('findet Dateien per Glob nach Namen', async () => {
    const out = await tool.execute({ muster: '*.md' }, sctx());
    expect(out).toContain('a.md');
    expect(out).not.toContain('b.txt');
  });

  it('findet auch tiefer liegende Dateien per **-Glob', async () => {
    const out = await tool.execute({ muster: '**/*.md' }, sctx());
    expect(out).toContain('a.md');
    expect(out).toContain('unter/c.md');
  });

  it('grept nach Textinhalt mit Zeilennummer', async () => {
    const out = await tool.execute({ text: 'TREFFER' }, sctx());
    expect(out).toMatch(/a\.md:2:/);
    expect(out).toMatch(/unter\/c\.md:1:/);
  });

  it('kombiniert Glob und Text (nur passende Dateien durchsuchen)', async () => {
    const out = await tool.execute({ muster: 'unter/*.md', text: 'TREFFER' }, sctx());
    expect(out).toContain('unter/c.md');
    expect(out).not.toMatch(/^a\.md/m);
  });

  it('meldet, wenn weder muster noch text angegeben ist', async () => {
    const out = await tool.execute({}, sctx());
    expect(out).toMatch(/muster.*text|text.*muster/i);
  });

  it('verweigert einen Suchpfad ausserhalb der erlaubten Ordner', async () => {
    const out = await tool.execute({ muster: '*.txt', pfad: '../aussen' }, sctx());
    expect(out).toMatch(/^Fehler:/);
    expect(out).not.toContain('GEHEIM');
  });

  it('meldet fehlende Ordner-Freigabe verständlich', async () => {
    const out = await tool.execute({ muster: '*' }, { roots: [] });
    expect(out).toMatch(/kein erlaubter Ordner/i);
  });

  it('meldet „kein Treffer" statt zu werfen', async () => {
    const out = await tool.execute({ text: 'kommtnichtvor-xyz' }, sctx());
    expect(out).toMatch(/kein treffer/i);
  });
});

describe('Werkzeug-Registry', () => {
  it('baut genau die deklarierten Werkzeuge', () => {
    const tools = buildTools(['dateien_lesen', 'rag_suche']);
    expect(tools.map(t => t.name)).toEqual(['dateien_lesen', 'rag_suche']);
  });

  it('entfernt Duplikate', () => {
    expect(buildTools(['rag_suche', 'rag_suche'])).toHaveLength(1);
  });

  it('gibt für eine leere Liste nichts zurück (keine Werkzeuge = keine Rechte)', () => {
    expect(buildTools([])).toEqual([]);
  });

  it('liefert für "terminal" das echte Werkzeug, keinen Platzhalter mehr', () => {
    const [tool] = buildTools(['terminal']);
    expect(tool).toBeInstanceOf(TerminalTool);
  });

  it('liefert für "subagent" das echte Werkzeug', () => {
    const SubagentTool = require('../../src/services/skills/subagent');
    const [tool] = buildTools(['subagent']);
    expect(tool).toBeInstanceOf(SubagentTool);
  });

  it('nennt die heute wirklich benutzbaren Werkzeuge (alle aus dem Plan)', () => {
    expect(implementedTools().sort()).toEqual(
      [
        'dateien_lesen',
        'dateien_schreiben',
        'dateien_suchen',
        'rag_suche',
        'terminal',
        'web_suche',
        'web_lesen',
        'subagent',
      ].sort()
    );
  });
});
