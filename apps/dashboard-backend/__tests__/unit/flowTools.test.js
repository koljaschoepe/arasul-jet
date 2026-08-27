/**
 * Flow-Werkzeuge für Dateien (Plan 011, Schritt 6).
 *
 * Die Datei-Werkzeuge arbeiten gegen einen echten temporären Baum — bei einem
 * Werkzeug, dessen ganze Aufgabe der kontrollierte Dateizugriff ist, würde ein
 * gemocktes `fs` genau die Zusage wegtesten.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../../src/utils/logger');

const {
  DateienLesenTool,
  DateienSchreibenTool,
  DateienBearbeitenTool,
  DateienAnhaengenTool,
} = require('../../src/services/flows/tools/dateien');
const { DateiSuchenTool } = require('../../src/services/flows/tools/suche');
const { buildTools, implementedTools } = require('../../src/services/flows/toolRegistry');

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

  it('liest gro\u00DFe Dateien chunked und nennt den n\u00E4chsten offset (Plan 019 \u00B7 Phase 4)', async () => {
    const gross = path.join(arbeit, 'chunk.txt');
    // 600 KB eindeutiger, ASCII-only Inhalt \u2192 mehrere Bl\u00F6cke \u00E0 256 KB.
    const inhalt = Array.from({ length: 600 * 1024 }, (_, i) => String.fromCharCode(97 + (i % 26))).join('');
    fs.writeFileSync(gross, inhalt);
    try {
      const teil1 = await tool.execute({ aktion: 'read', pfad: 'chunk.txt' }, ctx());
      const m = teil1.match(/weiterlesen mit aktion=read, offset=(\d+)/);
      expect(m).toBeTruthy();
      const off = Number(m[1]);
      expect(off).toBe(256 * 1024);
      // Erster Block = Dateianfang.
      expect(teil1.startsWith(inhalt.slice(0, 100))).toBe(true);

      const teil2 = await tool.execute({ aktion: 'read', pfad: 'chunk.txt', offset: off }, ctx());
      // Zweiter Block beginnt exakt an der Byte-Grenze (ASCII: 1 Byte = 1 Zeichen).
      expect(teil2.startsWith(inhalt.slice(off, off + 100))).toBe(true);

      // Offset hinter dem Dateiende \u2192 klarer Hinweis, kein Absturz.
      const zuWeit = await tool.execute({ aktion: 'read', pfad: 'chunk.txt', offset: 10 * 1024 * 1024 }, ctx());
      expect(zuWeit).toMatch(/hinter dem Dateiende/);
    } finally {
      fs.unlinkSync(gross);
    }
  });

  it('behandelt ein Mehrbyte-Zeichen genau an der Blockgrenze sauber (Plan 019 \u00b7 Phase 4)', async () => {
    const datei = path.join(arbeit, 'grenze.txt');
    const MAX = 256 * 1024;
    // '\u00fc' (2 Byte) liegt exakt auf der 256-KB-Grenze; danach ein ASCII-Marker.
    const inhalt = 'a'.repeat(MAX - 1) + '\u00fc' + 'MARKER' + 'z'.repeat(1000);
    fs.writeFileSync(datei, inhalt, 'utf8');
    try {
      const teil1 = await tool.execute({ aktion: 'read', pfad: 'grenze.txt' }, ctx());
      const inhalt1 = teil1.split('\n... [gekuerzt')[0];
      // Kein Ersatzzeichen geleakt, kein halbes '\u00fc', reine 'a'-Kette.
      expect(inhalt1).toBe('a'.repeat(MAX - 1));
      const off = Number(teil1.match(/offset=(\d+)/)[1]);
      expect(off).toBe(MAX);

      const teil2 = await tool.execute({ aktion: 'read', pfad: 'grenze.txt', offset: off }, ctx());
      // Fortsetzung beginnt sauber beim Marker (das zerschnittene '\u00fc' entf\u00e4llt,
      // aber KEIN Ersatzzeichen bleibt am Anfang stehen).
      expect(teil2.startsWith('MARKER')).toBe(true);
      expect(teil2).not.toMatch(/^\ufffd/);
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
    // Ohne das koennte ein Flow, dessen Ordner erst entstehen soll, nie
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

describe('dateien_bearbeiten', () => {
  const tool = new DateienBearbeitenTool();

  beforeEach(() => {
    fs.writeFileSync(
      path.join(arbeit, 'seite.html'),
      '<html>\n<head>\n  <title>Alt</title>\n</head>\n<body>\n  <p>Text</p>\n</body>\n</html>\n'
    );
  });

  it('ersetzt einen exakten Block genau einmal', async () => {
    const out = await tool.execute(
      { pfad: 'seite.html', suchen: '  <title>Alt</title>', ersetzen: '  <title>Neu</title>' },
      ctx()
    );
    expect(out).toMatch(/1 Stelle ersetzt/);
    expect(fs.readFileSync(path.join(arbeit, 'seite.html'), 'utf8')).toContain('<title>Neu</title>');
  });

  it('findet die Stelle auch mit abweichender Einrückung (Whitespace-tolerant)', async () => {
    const out = await tool.execute(
      { pfad: 'seite.html', suchen: '<title>Alt</title>', ersetzen: '<title>Neu</title>' },
      ctx()
    );
    expect(out).toMatch(/1 Stelle ersetzt/);
    expect(fs.readFileSync(path.join(arbeit, 'seite.html'), 'utf8')).toContain('<title>Neu</title>');
  });

  it('verweigert mehrdeutige Treffer ohne alle=true', async () => {
    fs.writeFileSync(path.join(arbeit, 'doppel.txt'), 'x\nGLEICH\ny\nGLEICH\nz\n');
    const out = await tool.execute(
      { pfad: 'doppel.txt', suchen: 'GLEICH', ersetzen: 'ANDERS' },
      ctx()
    );
    expect(out).toMatch(/^Fehler: .*2-mal/);
  });

  it('ersetzt mit alle=true jede Stelle', async () => {
    fs.writeFileSync(path.join(arbeit, 'doppel.txt'), 'x\nGLEICH\ny\nGLEICH\nz\n');
    const out = await tool.execute(
      { pfad: 'doppel.txt', suchen: 'GLEICH', ersetzen: 'ANDERS', alle: true },
      ctx()
    );
    expect(out).toMatch(/2 Stellen ersetzt/);
    expect(fs.readFileSync(path.join(arbeit, 'doppel.txt'), 'utf8')).not.toContain('GLEICH');
  });

  it('gibt bei Nicht-Treffern eine Handlungsanweisung zurück', async () => {
    const out = await tool.execute(
      { pfad: 'seite.html', suchen: 'GIBT ES NICHT', ersetzen: 'x' },
      ctx()
    );
    expect(out).toMatch(/^Fehler: .*nicht gefunden/);
    expect(out).toMatch(/dateien_lesen/);
  });

  it('verweist bei fehlender Datei auf dateien_schreiben und hinterlässt KEINE leere Datei', async () => {
    const out = await tool.execute({ pfad: 'fehlt.md', suchen: 'a', ersetzen: 'b' }, ctx());
    expect(out).toMatch(/^Fehler: .*dateien_schreiben/);
    // Review PR #278: O_CREAT im gemeinsamen Öffner legte hier eine leere
    // Datei an — die der Platten-Diff dann als "neue Datei" meldete.
    expect(fs.existsSync(path.join(arbeit, 'fehlt.md'))).toBe(false);
  });
});

describe('dateien_anhaengen', () => {
  const tool = new DateienAnhaengenTool();

  it('legt die Datei an und hängt weitere Abschnitte hinten an', async () => {
    const p = path.join(arbeit, 'lang.md');
    fs.rmSync(p, { force: true });
    const a = await tool.execute({ pfad: 'lang.md', inhalt: '# Kopf\n' }, ctx());
    expect(a).toMatch(/angehängt/);
    const b = await tool.execute({ pfad: 'lang.md', inhalt: 'Sektion 1\n' }, ctx());
    expect(b).toMatch(/angehängt/);
    expect(fs.readFileSync(p, 'utf8')).toBe('# Kopf\nSektion 1\n');
  });

  it('meldet die Gesamtgröße nach dem Anhängen', async () => {
    fs.writeFileSync(path.join(arbeit, 'gross.md'), 'x'.repeat(100));
    const out = await tool.execute({ pfad: 'gross.md', inhalt: 'y'.repeat(50) }, ctx());
    expect(out).toMatch(/Datei jetzt 150 Bytes/);
  });

  it('schreibt NICHT ausserhalb der erlaubten Ordner', async () => {
    const out = await tool.execute({ pfad: '../aussen/boese.txt', inhalt: 'X' }, ctx());
    expect(out).toMatch(/^Fehler:/);
    expect(fs.existsSync(path.join(aussen, 'boese.txt'))).toBe(false);
  });

  it('lehnt leeren Inhalt ab', async () => {
    const out = await tool.execute({ pfad: 'lang.md', inhalt: '' }, ctx());
    expect(out).toMatch(/^Fehler:/);
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

  it('folgt keinem Symlink aus den erlaubten Ordnern heraus (grep)', async () => {
    // Ein Symlink-Verzeichnis UND eine Symlink-Datei, beide auf „aussen"
    // (enthält geheim.txt mit GEHEIM). Der Baumlauf darf ihnen nicht folgen.
    const linkDir = path.join(suchbaum, 'aussen-link');
    const linkFile = path.join(suchbaum, 'geheim-link.md');
    fs.symlinkSync(aussen, linkDir);
    fs.symlinkSync(path.join(aussen, 'geheim.txt'), linkFile);
    try {
      const out = await tool.execute({ text: 'GEHEIM' }, sctx());
      // „Kein Treffer" echot den Suchbegriff — daher NICHT auf „GEHEIM" prüfen,
      // sondern darauf, dass keine Trefferzeile (Datei:Zeile) durchs Symlink kam.
      expect(out).toMatch(/kein treffer/i);
      expect(out).not.toMatch(/geheim\.txt:|geheim-link|aussen-link/);
    } finally {
      fs.unlinkSync(linkDir);
      fs.unlinkSync(linkFile);
    }
  });

  it('weist einen zu langen Suchtext ab (ReDoS-/Aufwandsschutz)', async () => {
    const out = await tool.execute({ text: 'x'.repeat(2001) }, sctx());
    expect(out).toMatch(/zu lang/i);
  });

  // Plan 021: Rausch-Ordner standardmäßig überspringen (agentic Code-Suche).
  it('überspringt Rausch-Ordner (node_modules) standardmäßig, findet sie mit alles=true', async () => {
    const nm = path.join(suchbaum, 'node_modules', 'pkg');
    fs.mkdirSync(nm, { recursive: true });
    fs.writeFileSync(path.join(nm, 'index.js'), 'const TREFFER = 1;');
    try {
      const standard = await tool.execute({ text: 'TREFFER' }, sctx());
      expect(standard).not.toMatch(/node_modules/);
      const mitAllem = await tool.execute({ text: 'TREFFER', alles: true }, sctx());
      expect(mitAllem).toMatch(/node_modules\/pkg\/index\.js/);
    } finally {
      fs.rmSync(path.join(suchbaum, 'node_modules'), { recursive: true, force: true });
    }
  });

  it('gibt mit kontext Zeilen vor/nach der Fundstelle aus (grep-Stil)', async () => {
    // a.md: Zeile 1 „Hallo Welt", Zeile 2 „zweite Zeile mit TREFFER".
    const out = await tool.execute({ text: 'TREFFER', muster: 'a.md', kontext: 1 }, sctx());
    expect(out).toMatch(/a\.md:2: .*TREFFER/);
    expect(out).toMatch(/a\.md-1- Hallo Welt/);
  });
});

describe('Werkzeug-Registry', () => {
  it('baut genau die deklarierten Werkzeuge', () => {
    const tools = buildTools(['dateien_lesen', 'dateien_suchen']);
    expect(tools.map(t => t.name)).toEqual(['dateien_lesen', 'dateien_suchen']);
  });

  it('entfernt Duplikate', () => {
    expect(buildTools(['dateien_suchen', 'dateien_suchen'])).toHaveLength(1);
  });

  it('gibt für eine leere Liste nichts zurück (keine Werkzeuge = keine Rechte)', () => {
    expect(buildTools([])).toEqual([]);
  });

  it('liefert für "subagent" das echte Werkzeug', () => {
    const SubagentTool = require('../../src/services/flows/subagent');
    const [tool] = buildTools(['subagent']);
    expect(tool).toBeInstanceOf(SubagentTool);
  });

  it('nennt die heute wirklich benutzbaren Werkzeuge (alle aus dem Plan)', () => {
    expect(implementedTools().sort()).toEqual(
      [
        'dateien_lesen',
        'dateien_schreiben',
        'dateien_bearbeiten',
        'dateien_anhaengen',
        'dateien_suchen',
        'symbol_suche',
        'subagent',
        // Plan 023 I3: EINE Rueckfrage an den Nutzer. Nur wirksam in der
        // Betriebsart `rueckfragen` — siehe die Tests darunter.
        'frage_nutzer',
        // Phase C7: der Lauf haelt an, bis ein Mensch entscheidet. Anders als
        // die Rueckfrage in JEDER Betriebsart -- eine Freigabe IST der Halt.
        'freigabe_anfordern',
      ].sort()
    );
  });

  /**
   * Plan 023 I2: in der Betriebsart `autonom` gibt es `frage_nutzer` NICHT.
   *
   * Nicht als gesperrte Variante, die eine Fehlermeldung liefert, sondern gar
   * nicht. Ein Modell, das ein Werkzeug sieht, benutzt es irgendwann, und die
   * Zusage "autonom stellt er keine Frage" haelt nur, wenn es die Frage nicht
   * geben kann.
   */
  describe('frage_nutzer haengt an der Betriebsart (Plan 023 I2)', () => {
    const namen = t => t.map(x => x.name).sort();

    it('faellt ohne Angabe weg — die Voreinstellung ist autonom', () => {
      expect(namen(buildTools(['dateien_lesen', 'frage_nutzer']))).toEqual(['dateien_lesen']);
    });

    it('faellt bei betriebsart autonom weg', () => {
      const t = buildTools(['dateien_lesen', 'frage_nutzer'], { betriebsart: 'autonom' });
      expect(namen(t)).toEqual(['dateien_lesen']);
    });

    it('ist bei betriebsart rueckfragen da', () => {
      const t = buildTools(['dateien_lesen', 'frage_nutzer'], { betriebsart: 'rueckfragen' });
      expect(namen(t)).toEqual(['dateien_lesen', 'frage_nutzer']);
    });

    it('laesst die uebrigen Werkzeuge unberuehrt', () => {
      const t = buildTools(['dateien_lesen', 'dateien_suchen'], { betriebsart: 'autonom' });
      expect(namen(t)).toEqual(['dateien_lesen', 'dateien_suchen']);
    });
  });
});
