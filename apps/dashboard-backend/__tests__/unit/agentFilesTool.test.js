/**
 * Agent `dateien` tool — unit tests against a real temp workspace.
 */

const path = require('path');
const os = require('os');
const fs = require('fs').promises;

const FilesTool = require('../../src/services/agents/tools/files');

describe('FilesTool (dateien)', () => {
  let dir;
  let tool;
  let ctx;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-files-'));
    tool = new FilesTool();
    ctx = { hostPath: dir };
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('exposes the expected tool identity', () => {
    expect(tool.name).toBe('dateien');
    expect(tool.parameters.aktion.enum).toEqual(['list', 'read', 'write']);
  });

  it('writes then reads a file', async () => {
    const w = await tool.execute({ aktion: 'write', pfad: 'notes/a.txt', inhalt: 'hallo' }, ctx);
    expect(w).toMatch(/geschrieben/);
    const onDisk = await fs.readFile(path.join(dir, 'notes', 'a.txt'), 'utf8');
    expect(onDisk).toBe('hallo');

    const r = await tool.execute({ aktion: 'read', pfad: 'notes/a.txt' }, ctx);
    expect(r).toBe('hallo');
  });

  it('lists directory entries', async () => {
    await fs.writeFile(path.join(dir, 'x.txt'), '1');
    await fs.mkdir(path.join(dir, 'sub'));
    const out = await tool.execute({ aktion: 'list', pfad: '.' }, ctx);
    expect(out).toMatch(/x\.txt/);
    expect(out).toMatch(/d sub/);
  });

  it('returns a clear error reading a missing file (no throw)', async () => {
    const r = await tool.execute({ aktion: 'read', pfad: 'nope.txt' }, ctx);
    expect(r).toMatch(/existiert nicht/);
  });

  it('rejects a ../escape read', async () => {
    const r = await tool.execute({ aktion: 'read', pfad: '../escape.txt' }, ctx);
    expect(r).toMatch(/ausserhalb/);
  });

  it('rejects a ../escape write (nothing written outside)', async () => {
    const r = await tool.execute(
      { aktion: 'write', pfad: '../../evil.txt', inhalt: 'x' },
      ctx
    );
    expect(r).toMatch(/ausserhalb/);
  });

  it('rejects an absolute path outside the workspace', async () => {
    const r = await tool.execute({ aktion: 'read', pfad: '/etc/passwd' }, ctx);
    expect(r).toMatch(/ausserhalb/);
  });

  it('rejects an unknown aktion', async () => {
    const r = await tool.execute({ aktion: 'delete', pfad: 'x' }, ctx);
    expect(r).toMatch(/Unbekannte aktion/);
  });

  it('errors clearly when no workspace path is in context', async () => {
    const r = await tool.execute({ aktion: 'list' }, {});
    expect(r).toMatch(/Kein Workspace-Pfad/);
  });
});
