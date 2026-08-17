/**
 * symbol_suche (Plan 021, Schritt 5) — Symboldefinitionen finden,
 * symlink-sicher und gedeckelt (wie dateien_suchen).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { SymbolSuchenTool } = require('../../src/services/flows/tools/symbolIndex');

describe('symbol_suche', () => {
  const tool = new SymbolSuchenTool();
  let baum, aussen;

  beforeAll(() => {
    baum = fs.mkdtempSync(path.join(os.tmpdir(), 'symsuche-'));
    aussen = fs.mkdtempSync(path.join(os.tmpdir(), 'symaussen-'));
    fs.mkdirSync(path.join(baum, 'src'), { recursive: true });
    fs.mkdirSync(path.join(baum, 'node_modules', 'pkg'), { recursive: true });

    fs.writeFileSync(
      path.join(baum, 'src', 'math.js'),
      [
        'function berechneSumme(a, b) {',
        '  return a + b;',
        '}',
        'const doppelt = (x) => x * 2;',
        'class RechnerService {',
        '  addiere(a, b) {',
        '    return berechneSumme(a, b);', // Aufrufstelle, KEINE Definition
        '  }',
        '}',
        'module.exports = { berechneSumme, RechnerService };', // Erwähnung
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(baum, 'src', 'app.py'),
      ['def lade_daten(pfad):', '    return open(pfad).read()', '', 'class DatenLader:', '    pass'].join(
        '\n'
      )
    );
    // Rausch-Ordner: darf nicht gefunden werden.
    fs.writeFileSync(
      path.join(baum, 'node_modules', 'pkg', 'index.js'),
      'function berechneSumme() { return 0; }'
    );
    // Außerhalb der Roots (für Symlink-Test).
    fs.writeFileSync(path.join(aussen, 'geheim.js'), 'function geheimeFunktion() {}');
  });

  afterAll(() => {
    fs.rmSync(baum, { recursive: true, force: true });
    fs.rmSync(aussen, { recursive: true, force: true });
  });

  const ctx = () => ({ roots: [baum] });

  it('heißt wie deklariert', () => {
    expect(tool.name).toBe('symbol_suche');
  });

  it('verlangt einen Namen', async () => {
    expect(await tool.execute({}, ctx())).toMatch(/^Fehler:/);
  });

  it('meldet fehlende Ordner-Freigabe', async () => {
    expect(await tool.execute({ name: 'x' }, {})).toMatch(/^Fehler:/);
  });

  it('findet die Definition einer Funktion (nicht die Aufrufstelle)', async () => {
    const out = await tool.execute({ name: 'berechneSumme' }, ctx());
    expect(out).toMatch(/src\/math\.js:1: \[function\]/);
    // NICHT die Aufrufzeile (7) im addiere-Body:
    expect(out).not.toMatch(/math\.js:7:/);
    // NICHT node_modules:
    expect(out).not.toMatch(/node_modules/);
  });

  it('findet eine Klasse', async () => {
    const out = await tool.execute({ name: 'RechnerService' }, ctx());
    expect(out).toMatch(/src\/math\.js:5: \[class\]/);
  });

  it('findet eine Methode ohne function-Schlüsselwort (was reines grep verfehlt)', async () => {
    const out = await tool.execute({ name: 'addiere' }, ctx());
    expect(out).toMatch(/src\/math\.js:6: \[method\]/);
  });

  it('findet eine arrow-const', async () => {
    const out = await tool.execute({ name: 'doppelt' }, ctx());
    expect(out).toMatch(/src\/math\.js:4: \[const\]/);
  });

  it('findet Python def und class', async () => {
    expect(await tool.execute({ name: 'lade_daten' }, ctx())).toMatch(/app\.py:1: \[def\]/);
    expect(await tool.execute({ name: 'DatenLader' }, ctx())).toMatch(/app\.py:4: \[class\]/);
  });

  it('unterscheidet exakt vs. ungefähr', async () => {
    expect(await tool.execute({ name: 'berechne' }, ctx())).toMatch(/Keine Definition/);
    const un = await tool.execute({ name: 'berechne', ungefaehr: true }, ctx());
    expect(un).toMatch(/berechneSumme/);
  });

  it('deutet Kontrollstrukturen NICHT als Symbol (if/for)', async () => {
    fs.writeFileSync(
      path.join(baum, 'src', 'ctrl.js'),
      ['function f() {', '  if (x) {', '    for (const y of z) {', '    }', '  }', '}'].join('\n')
    );
    try {
      expect(await tool.execute({ name: 'if' }, ctx())).toMatch(/Keine Definition/);
      expect(await tool.execute({ name: 'for' }, ctx())).toMatch(/Keine Definition/);
    } finally {
      fs.rmSync(path.join(baum, 'src', 'ctrl.js'), { force: true });
    }
  });

  it('folgt weder einem Verzeichnis- noch einem Datei-Symlink aus den Roots heraus', async () => {
    // Zwei Ausbruchsversuche, beide auf aussen/geheim.js (geheimeFunktion):
    // ein Verzeichnis-Symlink UND ein Datei-Symlink mit Quell-Endung — beide
    // werden schon beim Traversieren an `e.isSymbolicLink()` übersprungen, keine
    // Datei dahinter wird je geöffnet (O_NOFOLLOW + assertFdWithinRoots als
    // TOCTOU-Absicherung dahinter). Definition liegt NUR außerhalb der Roots.
    const dirLink = path.join(baum, 'aussen-link');
    const fileLink = path.join(baum, 'src', 'geheim-link.js');
    fs.symlinkSync(aussen, dirLink);
    fs.symlinkSync(path.join(aussen, 'geheim.js'), fileLink);
    try {
      const out = await tool.execute({ name: 'geheimeFunktion' }, ctx());
      // Die „Keine Definition"-Meldung echot den Suchnamen, daher auf einen
      // echten Datei-Treffer prüfen, nicht auf „geheim".
      expect(out).toMatch(/Keine Definition/);
      expect(out).not.toMatch(/geheim(-link)?\.js:|\[function\]|aussen-link/);
    } finally {
      fs.unlinkSync(dirLink);
      fs.unlinkSync(fileLink);
    }
  });
});
