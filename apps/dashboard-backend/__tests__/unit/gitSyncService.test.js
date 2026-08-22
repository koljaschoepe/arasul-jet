/**
 * Unit-Tests des Git-Sync-Dienstes (Plan 013, B9).
 *
 * `run` (Git-Ausführung) und `store` (DB) sind injiziert — getestet wird die
 * Fachlogik ohne echtes Git/Postgres: Zwei-Wege-Sync (commit→fetch→merge→push),
 * Konflikt-Erkennung (merge --abort + ConflictError mit Dateiliste), und dass ein
 * sauberer Baum keinen Leer-Commit erzeugt.
 */

process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'test';
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jwt-testing-minimum-32-chars';

const os = require('os');
const path = require('path');
const fs = require('fs/promises');

// PROJECT_GIT_DIR auf ein schreibbares Temp-Wurzelverzeichnis legen, BEVOR der
// Dienst geladen wird (die Konstante wird beim Require gelesen). Sonst versuchte
// der Neu-Klon-Pfad `mkdir /arasul/projects` und scheiterte im Test.
process.env.PROJECT_GIT_DIR = path.join(os.tmpdir(), 'gitsync-root');

const gitSyncService = require('../../src/services/git/gitSyncService');
const { ConflictError } = require('../../src/utils/errors');

/**
 * Baut einen `run`, der je nach Git-Unterkommando eine Antwort liefert. Default
 * ist Erfolg (code 0, leere Ausgabe). Überschreibungen per Matcher-Liste.
 */
function fakeRun(overrides = []) {
  const calls = [];
  const run = jest.fn(async (args, opts = {}) => {
    calls.push({ args, opts });
    const key = args.join(' ');
    for (const [match, antwort] of overrides) {
      if (key.includes(match)) {
        return { code: 0, stdout: '', stderr: '', ...antwort };
      }
    }
    return { code: 0, stdout: '', stderr: '' };
  });
  run.calls = calls;
  run.rief = match => calls.some(c => c.args.join(' ').includes(match));
  return run;
}

function fakeStore(kopplung) {
  return {
    getKopplung: jest.fn(async () => kopplung),
    entschluesselePat: jest.fn(async () => 'tok'),
    markiereSync: jest.fn(async () => ({ ...kopplung, last_status: 'synchronisiert' })),
  };
}

describe('synchronisiere', () => {
  let cwd;

  // Pro Test frisch: ein Verzeichnis mit .git, damit istRepo() true liefert.
  // Frisch je Test, weil der Neu-Klon-Pfad (Drift/Repo-Wechsel) den Checkout
  // löscht — sonst fänden Folgetests kein Repo mehr vor.
  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'gitsync-'));
    await fs.mkdir(path.join(cwd, '.git'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  function kopplung() {
    return { project_id: 'p1', repo_url: 'https://github.com/o/r', branch: 'main', local_path: cwd };
  }

  /** Overrides, die den Drift-Check bestehen lassen (Ferne + Branch passen). */
  function driftPasst(extra = []) {
    return [
      ['remote get-url origin', { stdout: 'https://github.com/o/r' }],
      ['rev-parse --abbrev-ref HEAD', { stdout: 'main' }],
      ...extra,
    ];
  }

  test('sauberer Baum: kein Commit, aber fetch/merge/push und Erfolg', async () => {
    const store = fakeStore(kopplung());
    const run = fakeRun(
      driftPasst([
        ['status --porcelain', { stdout: '' }],
        ['rev-parse --verify origin/main', { code: 0, stdout: 'deadbeef' }],
        ['rev-parse --short HEAD', { stdout: 'abc1234' }],
      ])
    );

    const res = await gitSyncService.synchronisiere({ projectId: 'p1' }, { run, store });

    expect(res.status).toBe('synchronisiert');
    expect(res.commit).toBe('abc1234');
    expect(run.rief('clone')).toBe(false); // Ferne passt → kein Neu-Klon
    expect(run.rief('commit -m')).toBe(false); // sauber → kein Commit
    expect(run.rief('push origin HEAD:main')).toBe(true);
    expect(store.markiereSync).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', status: 'synchronisiert', commit: 'abc1234' })
    );
  });

  test('lokale Änderungen werden vor dem Push committet', async () => {
    const store = fakeStore(kopplung());
    const run = fakeRun(
      driftPasst([
        ['status --porcelain', { stdout: ' M datei.txt' }],
        ['rev-parse --verify origin/main', { code: 0, stdout: 'deadbeef' }],
        ['rev-parse --short HEAD', { stdout: 'abc1234' }],
      ])
    );

    await gitSyncService.synchronisiere({ projectId: 'p1' }, { run, store });

    expect(run.rief('commit -m')).toBe(true);
    expect(run.rief('push origin HEAD:main')).toBe(true);
  });

  test('Merge-Konflikt: bricht ab, meldet Dateien, kein Push', async () => {
    const store = fakeStore(kopplung());
    const run = fakeRun(
      driftPasst([
        ['status --porcelain', { stdout: '' }],
        ['rev-parse --verify origin/main', { code: 0, stdout: 'deadbeef' }],
        ['merge --no-edit --allow-unrelated-histories origin/main', { code: 1, stdout: 'CONFLICT' }],
        ['diff --name-only --diff-filter=U', { stdout: 'a.txt\nb.txt\n' }],
      ])
    );

    const err = await gitSyncService
      .synchronisiere({ projectId: 'p1' }, { run, store })
      .catch(e => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.details).toEqual({ conflicts: ['a.txt', 'b.txt'] });

    expect(run.rief('merge --abort')).toBe(true);
    expect(run.rief('push')).toBe(false);
    expect(store.markiereSync).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', status: 'konflikt' })
    );
  });

  test('ungemergter Baum aus vorherigem Lauf → Konflikt, kein Commit/Push', async () => {
    const store = fakeStore(kopplung());
    const run = fakeRun(driftPasst([['ls-files -u', { stdout: '100644 abc 1\tX.txt\n' }]]));

    const err = await gitSyncService
      .synchronisiere({ projectId: 'p1' }, { run, store })
      .catch(e => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(run.rief('add -A')).toBe(false); // gar nicht erst stagen
    expect(run.rief('push')).toBe(false);
    expect(store.markiereSync).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'p1', status: 'konflikt' })
    );
  });

  test('Repo gewechselt (origin weicht ab) → Verwaltung neu, Dateien bleiben', async () => {
    const store = fakeStore(kopplung());
    const run = fakeRun([
      // origin zeigt noch auf das ALTE Repo → Drift → neu aufsetzen.
      ['remote get-url origin', { stdout: 'https://github.com/o/ALT' }],
      ['rev-parse --abbrev-ref HEAD', { stdout: 'main' }],
      ['status --porcelain', { stdout: '' }],
      ['rev-parse --verify origin/main', { code: 0, stdout: 'deadbeef' }],
      ['rev-parse --short HEAD', { stdout: 'abc1234' }],
    ]);
    await fs.writeFile(path.join(cwd, 'notiz.md'), 'wichtig');

    await gitSyncService.synchronisiere({ projectId: 'p1' }, { run, store });

    // Die Ferne stimmt wieder …
    expect(run.rief('remote add origin https://github.com/o/r')).toBe(true);
    expect(run.rief('push origin HEAD:main')).toBe(true);
    // … und die Datei des Nutzers liegt noch da.
    await expect(fs.readFile(path.join(cwd, 'notiz.md'), 'utf8')).resolves.toBe('wichtig');
  });

  /**
   * Am 22.08.2026 gefunden: `PROJECT_GIT_DIR/<id>` und `ABLAGE_DIR/<id>` sind
   * DERSELBE Ordner. Beide lesen `process.env.PROJECT_GIT_DIR` mit derselben
   * Vorgabe `/arasul/projects`, beide haengen die Projekt-ID an. Der Ordner,
   * den dieser Dienst fuer einen Wegwerf-Checkout hielt, ist die Ablage: das,
   * was im Dateibaum steht, was das Terminal unter /workspace/projekt sieht,
   * was der Chat liest.
   *
   * Ein Kunde koppelt sein Projekt an ein Repo und drueckt Synchronisieren.
   * Vorher: `fs.rm(cwd, {recursive: true})`, dann klonen. Alles weg, was nicht
   * im Repo stand.
   *
   * Diese drei Tests pruefen nicht Git, sondern die Platte.
   */
  describe('der Projektordner ueberlebt (Datenverlust vom 22.08.2026)', () => {
    test('erste Kopplung eines Projekts MIT Dateien loescht nichts', async () => {
      const store = fakeStore(kopplung());
      // Kein .git: das ist der Normalfall bei der ersten Kopplung.
      await fs.rm(path.join(cwd, '.git'), { recursive: true, force: true });
      await fs.writeFile(path.join(cwd, 'angebot.md'), 'Angebot an Kunde X');
      await fs.mkdir(path.join(cwd, 'belege'), { recursive: true });
      await fs.writeFile(path.join(cwd, 'belege', 'r-001.pdf'), 'PDF');

      const run = fakeRun([
        ['rev-parse --verify origin/main', { code: 0, stdout: 'deadbeef' }],
        ['rev-parse --verify HEAD', { code: 0, stdout: 'cafe' }],
        ['status --porcelain', { stdout: ' M angebot.md' }],
        ['rev-parse --short HEAD', { stdout: 'abc1234' }],
      ]);

      await gitSyncService.synchronisiere({ projectId: 'p1' }, { run, store });

      await expect(fs.readFile(path.join(cwd, 'angebot.md'), 'utf8')).resolves.toBe(
        'Angebot an Kunde X'
      );
      await expect(
        fs.readFile(path.join(cwd, 'belege', 'r-001.pdf'), 'utf8')
      ).resolves.toBe('PDF');
    });

    test('der Bestand wird festgehalten, bevor die Ferne dazukommt', async () => {
      // Sonst haette der Merge kein HEAD, in das er mergen koennte, und die
      // vorhandenen Dateien waeren nicht Teil der Historie.
      const store = fakeStore(kopplung());
      await fs.rm(path.join(cwd, '.git'), { recursive: true, force: true });
      const run = fakeRun([
        ['rev-parse --verify origin/main', { code: 0, stdout: 'deadbeef' }],
        ['rev-parse --verify HEAD', { code: 0, stdout: 'cafe' }],
        ['status --porcelain', { stdout: 'A  angebot.md' }],
        ['rev-parse --short HEAD', { stdout: 'abc1234' }],
      ]);

      await gitSyncService.synchronisiere({ projectId: 'p1' }, { run, store });

      const reihenfolge = run.calls.map(c => c.args.join(' '));
      const bestand = reihenfolge.findIndex(a => a.includes('Bestand vor der Kopplung'));
      const holen = reihenfolge.findIndex(a => a.includes('fetch origin main'));
      expect(bestand).toBeGreaterThanOrEqual(0);
      expect(bestand).toBeLessThan(holen);
    });

    test('ein leerer Projektordner nimmt die Ferne als Stand', async () => {
      // Der Fall, der frueher der Klon war.
      const store = fakeStore(kopplung());
      await fs.rm(path.join(cwd, '.git'), { recursive: true, force: true });
      const run = fakeRun([
        ['rev-parse --verify origin/main', { code: 0, stdout: 'deadbeef' }],
        // Kein HEAD: es gibt lokal keinen Commit.
        ['rev-parse --verify HEAD', { code: 128, stdout: '' }],
        ['status --porcelain', { stdout: '' }],
        ['rev-parse --short HEAD', { stdout: 'abc1234' }],
      ]);

      await gitSyncService.synchronisiere({ projectId: 'p1' }, { run, store });

      expect(run.rief('reset --hard origin/main')).toBe(true);
      expect(run.rief('commit -m Bestand vor der Kopplung')).toBe(false);
    });
  });

  test('doppelter Sync desselben Projekts → zweiter läuft in ConflictError', async () => {
    const store = fakeStore(kopplung());
    // Ein Run, der lange „hängt", während der zweite Aufruf startet.
    let freigeben;
    const gate = new Promise(res => {
      freigeben = res;
    });
    const run = fakeRun(
      driftPasst([
        ['rev-parse --verify origin/main', { code: 128 }],
        ['rev-parse --short HEAD', { stdout: 'abc1234' }],
        ['push', {}],
      ])
    );
    const langsam = jest.fn(async (args, opts) => {
      if (args.join(' ').includes('fetch')) {
        await gate;
      }
      return run(args, opts);
    });

    const p1 = gitSyncService.synchronisiere({ projectId: 'p1' }, { run: langsam, store });
    // Kurz warten, bis p1 die Sperre hält und am fetch hängt.
    await new Promise(r => setImmediate(r));
    const err = await gitSyncService
      .synchronisiere({ projectId: 'p1' }, { run: langsam, store })
      .catch(e => e);
    expect(err).toBeInstanceOf(ConflictError);
    freigeben();
    await p1;
  });

  test('ohne Kopplung → NotFound', async () => {
    const store = fakeStore(null);
    await expect(
      gitSyncService.synchronisiere({ projectId: 'p1' }, { run: fakeRun(), store })
    ).rejects.toThrow(/kein Repository/);
  });

  test('kein Remote-Branch: überspringt Merge, pusht trotzdem', async () => {
    const store = fakeStore(kopplung());
    const run = fakeRun(
      driftPasst([
        ['status --porcelain', { stdout: '' }],
        ['rev-parse --verify origin/main', { code: 128, stderr: 'unknown revision' }],
        ['rev-parse --short HEAD', { stdout: 'ffff000' }],
      ])
    );

    const res = await gitSyncService.synchronisiere({ projectId: 'p1' }, { run, store });

    expect(run.rief('merge --no-edit')).toBe(false);
    expect(run.rief('push origin HEAD:main')).toBe(true);
    expect(res.status).toBe('synchronisiert');
  });
});

/**
 * Plan 023 G3: „Änderungen gegenüber dem Stand auf GitHub".
 *
 * Bewusst OHNE Netz. Die Anzeige hängt in der Statusleiste; ein `fetch` bei
 * jedem Öffnen wäre auf einem Gerät, das offline laufen können muss, der
 * falsche Tausch. Verglichen wird mit dem zuletzt geholten Stand, und `stand`
 * sagt dazu, wann das war.
 */
describe('aenderungen (Plan 023 G3)', () => {
  let cwd;

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'gitaend-'));
    await fs.mkdir(path.join(cwd, '.git'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  function kopplung(extra = {}) {
    return {
      project_id: 'p1',
      repo_url: 'https://github.com/o/r',
      branch: 'main',
      local_path: cwd,
      last_synced_at: '2026-08-22T10:00:00.000Z',
      ...extra,
    };
  }

  test('nicht gekoppelt → null', async () => {
    const store = { getKopplung: jest.fn(async () => null) };
    await expect(gitSyncService.aenderungen({ projectId: 'p1' }, { store })).resolves.toBeNull();
  });

  test('zaehlt und benennt die geaenderten Dateien', async () => {
    const store = { getKopplung: jest.fn(async () => kopplung()) };
    const run = fakeRun([
      [
        'status --porcelain',
        { stdout: ' M src/a.js\n?? neu.md\n D weg.txt\nR  alt.md -> neu2.md\n' },
      ],
      ['rev-list', { stdout: '2\t3' }],
    ]);

    const res = await gitSyncService.aenderungen({ projectId: 'p1' }, { run, store });

    expect(res.dateien).toEqual([
      { art: 'geändert', pfad: 'src/a.js' },
      { art: 'neu', pfad: 'neu.md' },
      { art: 'gelöscht', pfad: 'weg.txt' },
      { art: 'umbenannt', pfad: 'alt.md -> neu2.md' },
    ]);
    expect(res.mehr).toBe(0);
    // `rev-list --left-right --count origin/main...HEAD`: links die Ferne,
    // rechts der eigene Stand.
    expect(res.zurueck).toBe(2);
    expect(res.voraus).toBe(3);
    expect(res.zweig).toBe('main');
    expect(res.stand).toBe('2026-08-22T10:00:00.000Z');
  });

  test('greift nicht ins Netz', async () => {
    // Der eigentliche Punkt dieser Funktion. Ein fetch hier waere in der
    // Statusleiste bei jedem Oeffnen ein Netzzugriff.
    const store = { getKopplung: jest.fn(async () => kopplung()) };
    const run = fakeRun([['status --porcelain', { stdout: '' }]]);
    await gitSyncService.aenderungen({ projectId: 'p1' }, { run, store });
    expect(run.rief('fetch')).toBe(false);
    expect(run.rief('ls-remote')).toBe(false);
    expect(run.rief('pull')).toBe(false);
  });

  test('deckelt lange Listen und meldet den Rest als Zahl', async () => {
    const store = { getKopplung: jest.fn(async () => kopplung()) };
    const viele = Array.from({ length: 250 }, (_, i) => `?? datei-${i}.md`).join('\n');
    const run = fakeRun([
      ['status --porcelain', { stdout: viele }],
      ['rev-list', { stdout: '0\t0' }],
    ]);

    const res = await gitSyncService.aenderungen({ projectId: 'p1' }, { run, store });

    expect(res.dateien).toHaveLength(200);
    expect(res.mehr).toBe(50);
  });

  test('gekoppelt, aber nie synchronisiert → leer statt Fehler', async () => {
    await fs.rm(path.join(cwd, '.git'), { recursive: true, force: true });
    const store = { getKopplung: jest.fn(async () => kopplung({ last_synced_at: null })) };
    const run = fakeRun();

    const res = await gitSyncService.aenderungen({ projectId: 'p1' }, { run, store });

    expect(res.nieSynchronisiert).toBe(true);
    expect(res.dateien).toEqual([]);
    expect(run.rief('status')).toBe(false);
  });

  test('ein kaputtes rev-list macht die Anzeige nicht kaputt', async () => {
    const store = { getKopplung: jest.fn(async () => kopplung()) };
    const run = fakeRun([
      ['status --porcelain', { stdout: ' M a.js' }],
      ['rev-list', { code: 128, stderr: 'unknown revision' }],
    ]);

    const res = await gitSyncService.aenderungen({ projectId: 'p1' }, { run, store });

    expect(res.voraus).toBe(0);
    expect(res.zurueck).toBe(0);
    expect(res.dateien).toHaveLength(1);
  });
});

describe('trenne — Rechnungsschutz (Plan 014, Phase 5)', () => {
  test('lehnt das Trennen ab, wenn das Projekt ausgestellte Rechnungen enthält', async () => {
    const store = { loescheKopplung: jest.fn(async () => ({})) };
    const db = { query: jest.fn(async () => ({ rows: [{ anzahl: 2 }] })) };
    await expect(gitSyncService.trenne({ projectId: 'p1' }, { store, db })).rejects.toThrow(
      /unveränderliche Rechnung/
    );
    // Weder Kopplung gelöscht noch der Ordner angefasst.
    expect(store.loescheKopplung).not.toHaveBeenCalled();
  });

  test('trennt normal, wenn keine Rechnungen registriert sind', async () => {
    const store = { loescheKopplung: jest.fn(async () => ({ getrennt: true })) };
    const db = { query: jest.fn(async () => ({ rows: [{ anzahl: 0 }] })) };
    const res = await gitSyncService.trenne({ projectId: 'p1' }, { store, db });
    expect(store.loescheKopplung).toHaveBeenCalledWith({ projectId: 'p1' });
    expect(res).toEqual({ getrennt: true });
  });

  /**
   * Der zweite Fund vom 22.08.2026, aus derselben Verwechslung: „Kopplung
   * trennen" loeschte `checkoutPfad(projectId)` rekursiv, also den
   * Projektordner. Ein Knopf mit der Aufschrift „trennen" loeschte alle
   * Dokumente, Notizen und Dateien des Projekts.
   *
   * Der Rechnungs-Schutz darueber zeigt, dass das jemandem schon einmal
   * aufgefallen war — er schuetzte aber nur die Rechnungen, nicht die Arbeit.
   */
  test('trennen loescht die Verwaltung, nicht die Dateien', async () => {
    const ordner = path.join(process.env.PROJECT_GIT_DIR, 'p9');
    await fs.mkdir(path.join(ordner, '.git'), { recursive: true });
    await fs.writeFile(path.join(ordner, 'HEAD'), 'ref');
    await fs.writeFile(path.join(ordner, 'protokoll.md'), 'monatelange Arbeit');

    const store = { loescheKopplung: jest.fn(async () => ({ getrennt: true })) };
    const db = { query: jest.fn(async () => ({ rows: [{ anzahl: 0 }] })) };
    await gitSyncService.trenne({ projectId: 'p9' }, { store, db });

    await expect(fs.readFile(path.join(ordner, 'protokoll.md'), 'utf8')).resolves.toBe(
      'monatelange Arbeit'
    );
    await expect(fs.access(path.join(ordner, '.git'))).rejects.toThrow();
    await fs.rm(ordner, { recursive: true, force: true });
  });
});

/**
 * Die Tatsache, aus der alles oben folgt. Sie steht als eigener Test da, weil
 * sie sonst nirgends geprueft wird und beim naechsten Umbau leise wegfallen
 * koennte — und dann waeren die drei Loeschungen oben wieder harmlos aussehende
 * Aufraeumarbeiten.
 */
describe('Ablage und Git-Arbeitsbaum sind derselbe Ordner', () => {
  test('checkoutPfad zeigt auf den Projektordner der Ablage', () => {
    const ablageService = require('../../src/services/projects/ablageService');
    expect(ablageService.ABLAGE_DIR).toBe(gitSyncService.PROJECT_GIT_DIR);
  });
});

describe('verbinde', () => {
  test('nicht erreichbar → ValidationError, OHNE die bestehende Kopplung zu überschreiben', async () => {
    const store = {
      upsertKopplung: jest.fn(async () => ({ project_id: 'p1' })),
      entschluesselePat: jest.fn(async () => 'tok'),
      markiereSync: jest.fn(async () => ({})),
    };
    const run = fakeRun([['ls-remote', { code: 128, stderr: 'Authentication failed' }]]);

    await expect(
      gitSyncService.verbinde(
        { projectId: 'p1', repoUrl: 'https://github.com/o/r', branch: 'main', pat: 'bad' },
        { run, store }
      )
    ).rejects.toThrow(/nicht erreichbar/);

    // Kein Schreibzugriff bei fehlgeschlagener Probe (keine Zerstörung).
    expect(store.upsertKopplung).not.toHaveBeenCalled();
    expect(store.markiereSync).not.toHaveBeenCalled();
  });

  test('erreichbares Repo → Kopplung zurück', async () => {
    const store = {
      upsertKopplung: jest.fn(async () => ({ project_id: 'p1', repo_url: 'https://github.com/o/r' })),
      entschluesselePat: jest.fn(async () => 'tok'),
      markiereSync: jest.fn(async () => ({})),
    };
    const run = fakeRun([['ls-remote', { code: 0, stdout: 'refs/heads/main' }]]);

    const k = await gitSyncService.verbinde(
      { projectId: 'p1', repoUrl: 'https://github.com/o/r', branch: 'main', pat: 'good' },
      { run, store }
    );
    expect(k.project_id).toBe('p1');
    expect(store.markiereSync).not.toHaveBeenCalled();
  });
});
