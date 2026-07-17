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

  // Security regression (Plan 008 code-review Critical): the `terminal` tool can
  // create a symlink inside the workspace; the `dateien` tool must NOT follow it
  // out of the jail — a purely lexical check would wrongly allow it.
  it('rejects reading through a symlink that points outside the workspace', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-outside-'));
    try {
      await fs.writeFile(path.join(outside, 'secret.txt'), 'top-secret');
      await fs.symlink(path.join(outside, 'secret.txt'), path.join(dir, 'escape.txt'));
      const r = await tool.execute({ aktion: 'read', pfad: 'escape.txt' }, ctx);
      expect(r).toMatch(/Symlink/);
      expect(r).not.toMatch(/top-secret/);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('rejects writing through a symlink (incl. dangling) that points outside', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-outside-'));
    try {
      // Dangling symlink → target does not exist yet; a naive writer would create it outside.
      await fs.symlink(path.join(outside, 'planted.txt'), path.join(dir, 'escape.txt'));
      const r = await tool.execute({ aktion: 'write', pfad: 'escape.txt', inhalt: 'x' }, ctx);
      expect(r).toMatch(/Symlink/);
      let planted = false;
      try {
        await fs.access(path.join(outside, 'planted.txt'));
        planted = true;
      } catch {
        planted = false;
      }
      expect(planted).toBe(false);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it('rejects reading through a symlinked parent directory that points outside', async () => {
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-outside-'));
    try {
      await fs.writeFile(path.join(outside, 'secret.txt'), 'top-secret');
      await fs.symlink(outside, path.join(dir, 'link'));
      const r = await tool.execute({ aktion: 'read', pfad: 'link/secret.txt' }, ctx);
      expect(r).toMatch(/Symlink/);
      expect(r).not.toMatch(/top-secret/);
    } finally {
      await fs.rm(outside, { recursive: true, force: true });
    }
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
