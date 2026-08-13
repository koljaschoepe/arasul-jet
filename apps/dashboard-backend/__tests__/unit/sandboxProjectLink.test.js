/**
 * Plan 018 — Projekt-Vereinheitlichung: Backend-Kopplungslogik.
 *
 * 1. ensureProjectContainer: liefert einen bereits gekoppelten Container zurück
 *    (created:false), validiert die project_id und wirft NotFound für Geister.
 * 2. backfillProjectLinks: koppelt ungekoppelte Container per Namensgleichheit,
 *    ist idempotent (nichts zu tun → 0/0/0).
 */

jest.mock('../../src/database', () => ({ query: jest.fn(), transaction: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/core/docker', () => ({
  docker: { getContainer: jest.fn(), createContainer: jest.fn(), getImage: jest.fn() },
}));
jest.mock('../../src/services/sandbox/sandboxIdleChecker', () => ({
  checkIdleContainers: jest.fn(),
  startIdleChecker: jest.fn(),
  stopIdleChecker: jest.fn(),
}));
jest.mock('../../src/services/rag/projectService', () => ({
  getProject: jest.fn(),
  listProjects: jest.fn(),
  createProject: jest.fn(),
}));
jest.mock('../../src/services/projects/ablageService', () => ({
  projektOrdner: jest.fn(async () => '/data/projects/x'),
}));

const db = require('../../src/database');
const projectService = require('../../src/services/rag/projectService');
const sandboxService = require('../../src/services/sandbox/sandboxService');
const { backfillProjectLinks } = require('../../src/services/sandbox/sandboxBackfill');
const { ValidationError, NotFoundError } = require('../../src/utils/errors');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ensureProjectContainer', () => {
  it('liefert einen bereits gekoppelten aktiven Container (created:false)', async () => {
    projectService.getProject.mockResolvedValue({ id: 'ws1', name: 'Projekt Eins' });
    const container = { id: 'c1', project_id: 'ws1', status: 'active', slug: 'projekt-eins' };
    db.query.mockResolvedValueOnce({ rows: [container] }); // lookup

    const result = await sandboxService.ensureProjectContainer('ws1', {
      userId: 1,
      userRole: 'admin',
    });

    expect(result).toEqual({ project: container, created: false });
    // Kein Anlegen nötig — createProject (sandbox) läuft nicht.
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('wirft ValidationError ohne project_id', async () => {
    await expect(sandboxService.ensureProjectContainer('', {})).rejects.toBeInstanceOf(
      ValidationError
    );
  });

  it('wirft NotFound für ein unbekanntes Workspace-Projekt', async () => {
    projectService.getProject.mockRejectedValue(new NotFoundError('Projekt nicht gefunden'));
    await expect(
      sandboxService.ensureProjectContainer('ghost', { userId: 1 })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('backfillProjectLinks', () => {
  it('koppelt einen ungekoppelten Container per Namensgleichheit', async () => {
    // 1. unlinked-Query, 2. used-project-ids-Query, dann UPDATE.
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'c1', name: 'Kunden', slug: 'kunden' }] }) // unlinked
      .mockResolvedValueOnce({ rows: [] }) // used project ids
      .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE link
    projectService.listProjects.mockResolvedValue([{ id: 'ws-kunden', name: 'Kunden' }]);

    const res = await backfillProjectLinks();

    expect(res).toEqual({ linked: 1, created: 0, skipped: 0 });
    expect(projectService.createProject).not.toHaveBeenCalled();
    // Der UPDATE koppelt genau das freie, namensgleiche Projekt.
    const updateCall = db.query.mock.calls.find(([sql]) => /UPDATE sandbox_projects SET project_id/.test(sql));
    expect(updateCall[1]).toEqual(['ws-kunden', 'c1']);
  });

  it('ist idempotent: ohne ungekoppelte Container passiert nichts', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // unlinked → leer
    const res = await backfillProjectLinks();
    expect(res).toEqual({ linked: 0, created: 0, skipped: 0 });
    expect(projectService.listProjects).not.toHaveBeenCalled();
  });

  it('legt ein Workspace-Projekt an, wenn kein Name passt', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: 'c9', name: 'Solo', slug: 'solo' }] }) // unlinked
      .mockResolvedValueOnce({ rows: [] }) // used
      .mockResolvedValueOnce({ rowCount: 1 }); // UPDATE link
    projectService.listProjects.mockResolvedValue([]); // kein Match
    projectService.createProject.mockResolvedValue({ id: 'ws-neu', name: 'Solo' });

    const res = await backfillProjectLinks();

    expect(res).toEqual({ linked: 1, created: 1, skipped: 0 });
    expect(projectService.createProject).toHaveBeenCalledWith({ name: 'Solo' });
  });
});
