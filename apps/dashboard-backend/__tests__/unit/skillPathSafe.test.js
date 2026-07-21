/**
 * Pfad-Sperre für Skills über mehrere Ordner (Plan 011, Schritt 6).
 *
 * Das hier ist die Sicherheitsgrenze des ganzen Skill-Systems: Ein Skill darf
 * ausschließlich in seinen deklarierten Ordnern lesen und schreiben. Die Tests
 * arbeiten deshalb auf einem ECHTEN temporären Dateibaum inklusive echter
 * Symlinks — eine gemockte Prüfung würde genau das wegtesten, worauf es
 * ankommt.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  normalizeRoots,
  resolveWithinRoots,
  resolveRealWithinRoots,
} = require('../../src/services/skills/pathSafe');

let base, arbeit, zweit, aussen;

beforeAll(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'arasul-jail-'));
  arbeit = path.join(base, 'arbeit');
  zweit = path.join(base, 'zweit');
  aussen = path.join(base, 'aussen');
  for (const d of [arbeit, zweit, aussen]) {
    fs.mkdirSync(d, { recursive: true });
  }
  fs.writeFileSync(path.join(arbeit, 'notiz.md'), 'im Arbeitsordner');
  fs.writeFileSync(path.join(zweit, 'vorlage.md'), 'im zweiten Ordner');
  fs.writeFileSync(path.join(aussen, 'geheim.txt'), 'DARF NICHT GELESEN WERDEN');
  fs.mkdirSync(path.join(arbeit, 'unter'), { recursive: true });
});

afterAll(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

const roots = () => [arbeit, zweit];

describe('normalizeRoots', () => {
  it('entfernt Duplikate und behält die Reihenfolge', () => {
    expect(normalizeRoots([arbeit, zweit, arbeit])).toEqual([arbeit, zweit]);
  });

  it('nimmt auch einen einzelnen String', () => {
    expect(normalizeRoots(arbeit)).toEqual([arbeit]);
  });

  it('weist eine leere Liste ab', () => {
    expect(() => normalizeRoots([])).toThrow(/keinen erlaubten Ordner/i);
    expect(() => normalizeRoots(['   '])).toThrow(/keinen erlaubten Ordner/i);
  });
});

describe('resolveWithinRoots — erlaubte Zugriffe', () => {
  it('löst relative Pfade gegen das ARBEITSVERZEICHNIS auf (erste Wurzel)', () => {
    expect(resolveWithinRoots(roots(), 'notiz.md')).toBe(path.join(arbeit, 'notiz.md'));
  });

  it('behandelt leeren Pfad und "." als Arbeitsverzeichnis', () => {
    expect(resolveWithinRoots(roots(), '')).toBe(arbeit);
    expect(resolveWithinRoots(roots(), '.')).toBe(arbeit);
  });

  it('erlaubt Unterverzeichnisse', () => {
    expect(resolveWithinRoots(roots(), 'unter/neu.md')).toBe(path.join(arbeit, 'unter', 'neu.md'));
  });

  it('erlaubt einen absoluten Pfad in der ZWEITEN Wurzel', () => {
    const p = path.join(zweit, 'vorlage.md');
    expect(resolveWithinRoots(roots(), p)).toBe(p);
  });

  it('erlaubt ein ".." das innerhalb der Wurzel bleibt', () => {
    expect(resolveWithinRoots(roots(), 'unter/../notiz.md')).toBe(path.join(arbeit, 'notiz.md'));
  });
});

describe('resolveWithinRoots — Ausbrüche', () => {
  const verboten = (p, muster = /ausserhalb/i) => {
    expect(() => resolveWithinRoots(roots(), p)).toThrow(muster);
  };

  it('weist ".." aus dem Arbeitsverzeichnis heraus ab', () => {
    verboten('../aussen/geheim.txt');
    verboten('../../etc/passwd');
  });

  it('weist einen absoluten Pfad ausserhalb aller Wurzeln ab', () => {
    verboten(path.join(aussen, 'geheim.txt'));
    verboten('/etc/passwd');
  });

  it('weist einen Pfad ab, der nur wie eine Wurzel AUSSIEHT', () => {
    // `${arbeit}-evil` beginnt als String mit `${arbeit}`, liegt aber daneben.
    verboten(`${arbeit}-evil/datei.md`);
  });

  it('erlaubt kein relatives Ausweichen in die zweite Wurzel', () => {
    // Der zweite Ordner ist nur absolut adressierbar — sonst wäre nicht
    // vorhersagbar, wo eine Datei landet.
    verboten(path.join('..', path.basename(zweit), 'vorlage.md'));
  });
});

describe('resolveRealWithinRoots — Symlinks', () => {
  it('löst einen normalen Pfad auf', () => {
    expect(resolveRealWithinRoots(roots(), 'notiz.md')).toBe(
      fs.realpathSync(path.join(arbeit, 'notiz.md'))
    );
  });

  it('weist einen Symlink ab, der aus den Ordnern hinausführt', () => {
    const link = path.join(arbeit, 'ausbruch');
    fs.symlinkSync(aussen, link);
    try {
      expect(() => resolveRealWithinRoots(roots(), 'ausbruch/geheim.txt')).toThrow(
        /verlaesst die erlaubten Ordner/i
      );
    } finally {
      fs.unlinkSync(link);
    }
  });

  it('weist einen BAUMELNDEN Symlink als letztes Glied ab (Schreib-Falle)', () => {
    // Klassische Falle: Der Skill legt per Terminal `neu.md -> /etc/cron.d/x`
    // an. Die Datei existiert noch nicht, ein Schreibzugriff würde dem Symlink
    // aber folgen und ausserhalb landen.
    const link = path.join(arbeit, 'baumelnd');
    fs.symlinkSync(path.join(aussen, 'gibtsnochnicht'), link);
    try {
      expect(() => resolveRealWithinRoots(roots(), 'baumelnd')).toThrow(/Symlink/i);
    } finally {
      fs.unlinkSync(link);
    }
  });

  it('erlaubt einen Symlink, der INNERHALB der erlaubten Ordner bleibt', () => {
    const link = path.join(arbeit, 'zeigt-auf-zweit');
    fs.symlinkSync(zweit, link);
    try {
      const aufgeloest = resolveRealWithinRoots(roots(), 'zeigt-auf-zweit/vorlage.md');
      expect(aufgeloest).toBe(fs.realpathSync(path.join(zweit, 'vorlage.md')));
    } finally {
      fs.unlinkSync(link);
    }
  });

  it('erlaubt eine noch nicht existierende Datei in einem existierenden Ordner', () => {
    // Das ist der Normalfall beim Schreiben.
    expect(resolveRealWithinRoots(roots(), 'unter/ganz-neu.md')).toBe(
      path.join(fs.realpathSync(path.join(arbeit, 'unter')), 'ganz-neu.md')
    );
  });

  it('erlaubt einen noch nicht existierenden Ordner unterhalb der Wurzel', () => {
    expect(resolveRealWithinRoots(roots(), 'neuer-ordner/tief/datei.md')).toBe(
      path.join(fs.realpathSync(arbeit), 'neuer-ordner', 'tief', 'datei.md')
    );
  });

  it('behandelt eine Wurzel, die selbst ein Symlink ist, korrekt', () => {
    // Der erlaubte Ordner wird ueber einen Symlink erreicht. Ohne Aufloesen der
    // Wurzel wuerde der Vergleich fehlschlagen und JEDER Zugriff scheitern.
    const linkRoot = path.join(base, 'link-auf-arbeit');
    fs.symlinkSync(arbeit, linkRoot);
    try {
      expect(resolveRealWithinRoots([linkRoot], 'notiz.md')).toBe(
        fs.realpathSync(path.join(arbeit, 'notiz.md'))
      );
      // Und der Ausbruch bleibt trotzdem verwehrt.
      expect(() => resolveRealWithinRoots([linkRoot], '../aussen/geheim.txt')).toThrow();
    } finally {
      fs.unlinkSync(linkRoot);
    }
  });

  it('scheitert sauber, wenn keine der Wurzeln existiert', () => {
    expect(() => resolveRealWithinRoots(['/gibt/es/nicht'], 'x.md')).toThrow(
      /Keiner der erlaubten Ordner existiert/i
    );
  });
});
