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
        ['merge --no-edit origin/main', { code: 1, stdout: 'CONFLICT' }],
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

  test('Repo gewechselt (origin weicht ab) → alter Checkout wird neu geklont', async () => {
    const store = fakeStore(kopplung());
    const run = fakeRun([
      // origin zeigt noch auf das ALTE Repo → Drift → Neu-Klon erzwingen.
      ['remote get-url origin', { stdout: 'https://github.com/o/ALT' }],
      ['rev-parse --abbrev-ref HEAD', { stdout: 'main' }],
      ['status --porcelain', { stdout: '' }],
      ['rev-parse --verify origin/main', { code: 0, stdout: 'deadbeef' }],
      ['rev-parse --short HEAD', { stdout: 'abc1234' }],
    ]);

    await gitSyncService.synchronisiere({ projectId: 'p1' }, { run, store });

    expect(run.rief('clone')).toBe(true); // frisch geklont gegen die richtige Ferne
    expect(run.rief('push origin HEAD:main')).toBe(true);
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
