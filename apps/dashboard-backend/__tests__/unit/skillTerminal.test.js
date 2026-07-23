/**
 * Terminal-Werkzeug und Sandbox-Auflösung (Plan 011, Schritt 7).
 *
 * Docker ist hier gemockt — ein echter Daemon steht in der Testumgebung nicht
 * zur Verfügung. Getestet wird deshalb genau das, was OHNE Daemon prüfbar und
 * zugleich sicherheitsrelevant ist: WELCHES Kommando im Container landet, in
 * WELCHEM Arbeitsverzeichnis, mit welchem Zeitlimit, wie die Ausgabe gedeckelt
 * wird — und dass die Sandbox-Auflösung keinen Container mit fremden Ordnern
 * weiterverwendet. Der Beweis, dass ein Befehl auf dem Gerät wirklich läuft,
 * gehört in die Live-Verifikation (§6), nicht hierher.
 */

const mockContainer = {
  inspect: jest.fn(),
  exec: jest.fn(),
  start: jest.fn(),
  remove: jest.fn(),
};
const mockDocker = {
  getContainer: jest.fn(() => mockContainer),
  getImage: jest.fn(() => ({ inspect: jest.fn().mockResolvedValue({}) })),
  createContainer: jest.fn(),
  modem: { demuxStream: jest.fn() },
};

jest.mock('../../src/services/core/docker', () => ({ docker: mockDocker }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { EventEmitter } = require('events');
const TerminalTool = require('../../src/services/skills/tools/terminal');
const sandboxResolve = require('../../src/services/skills/sandboxResolve');

/** Ein exec-Doppel, das `stuecke` ausgibt und mit `exitCode` endet. */
function execDoppel(stuecke, exitCode = 0) {
  const stream = new EventEmitter();
  stream.destroy = jest.fn();
  const exec = {
    start: jest.fn().mockResolvedValue(stream),
    inspect: jest.fn().mockResolvedValue({ ExitCode: exitCode }),
  };
  // demuxStream: sofort in die Senke schreiben, dann den Strom beenden.
  mockDocker.modem.demuxStream.mockImplementation((s, out) => {
    process.nextTick(() => {
      for (const stueck of stuecke) {
        out.write(Buffer.from(stueck));
      }
      s.emit('end');
    });
  });
  return exec;
}

const ctx = { containerId: 'abc123', cwd: '/arasul/workspace/berichte' };

beforeEach(() => {
  jest.clearAllMocks();
  sandboxResolve._reset();
  mockDocker.getContainer.mockReturnValue(mockContainer);
  mockDocker.getImage.mockReturnValue({ inspect: jest.fn().mockResolvedValue({}) });
});

describe('TerminalTool — Eingabeprüfung', () => {
  const tool = new TerminalTool();

  it('weist einen leeren Befehl ab', async () => {
    expect(await tool.execute({ befehl: '   ' }, ctx)).toMatch(/darf nicht leer sein/i);
    expect(mockContainer.exec).not.toHaveBeenCalled();
  });

  it('weist einen übermäßig langen Befehl ab', async () => {
    const out = await tool.execute({ befehl: 'a'.repeat(5000) }, ctx);
    expect(out).toMatch(/länger als/i);
    expect(mockContainer.exec).not.toHaveBeenCalled();
  });

  it('meldet einen fehlenden Container als Ursache, statt abzustürzen', async () => {
    const out = await tool.execute({ befehl: 'ls' }, { cwd: '/x' });
    expect(out).toMatch(/kein Sandbox-Container/i);
  });

  it('meldet ein fehlendes Arbeitsverzeichnis', async () => {
    const out = await tool.execute({ befehl: 'ls' }, { containerId: 'abc' });
    expect(out).toMatch(/kein Arbeitsverzeichnis/i);
  });
});

describe('TerminalTool — was im Container ankommt', () => {
  const tool = new TerminalTool();

  it('führt den Befehl im Arbeitsverzeichnis des Skills aus', async () => {
    mockContainer.exec.mockResolvedValue(execDoppel(['hallo\n']));
    await tool.execute({ befehl: 'ls -la' }, ctx);

    const arg = mockContainer.exec.mock.calls[0][0];
    expect(arg.WorkingDir).toBe('/arasul/workspace/berichte');
    expect(arg.Tty).toBe(false);
  });

  it('setzt das Zeitlimit IM Container durch (timeout mit KILL-Nachschlag)', async () => {
    mockContainer.exec.mockResolvedValue(execDoppel(['ok']));
    await tool.execute({ befehl: 'sleep 5' }, { ...ctx, timeoutS: 30 });

    const cmd = mockContainer.exec.mock.calls[0][0].Cmd;
    expect(cmd.slice(0, 4)).toEqual(['timeout', '-k', '5s', '30s']);
    expect(cmd.slice(4, 6)).toEqual(['/bin/bash', '-lc']);
  });

  it('reicht den Befehl als EIGENES argv-Element durch (keine Zeichenkette gebastelt)', async () => {
    // Das ist der Punkt, an dem eine Verkettung zur Einschleusung würde: Der
    // Befehl darf nie in eine zusammengebaute Shell-Zeile geraten.
    mockContainer.exec.mockResolvedValue(execDoppel(['x']));
    const boeser = `echo 'a'; rm -rf /`;
    await tool.execute({ befehl: boeser }, ctx);

    const cmd = mockContainer.exec.mock.calls[0][0].Cmd;
    expect(cmd[cmd.length - 1]).toBe(boeser);
    expect(cmd).toHaveLength(7); // timeout -k 5s <n>s /bin/bash -lc <befehl>
  });

  it('deckelt das Zeitlimit nach oben', async () => {
    mockContainer.exec.mockResolvedValue(execDoppel(['x']));
    await tool.execute({ befehl: 'ls' }, { ...ctx, timeoutS: 99999 });
    expect(mockContainer.exec.mock.calls[0][0].Cmd[3]).toBe('900s');
  });

  it('nimmt bei fehlendem Zeitlimit den Standardwert', async () => {
    mockContainer.exec.mockResolvedValue(execDoppel(['x']));
    await tool.execute({ befehl: 'ls' }, ctx);
    expect(mockContainer.exec.mock.calls[0][0].Cmd[3]).toBe('120s');
  });
});

describe('TerminalTool — Ausgabe', () => {
  const tool = new TerminalTool();

  it('gibt Ausgabe samt Exit-Code zurück', async () => {
    mockContainer.exec.mockResolvedValue(execDoppel(['datei-a\ndatei-b\n'], 0));
    const out = await tool.execute({ befehl: 'ls' }, ctx);
    expect(out).toMatch(/Exit-Code: 0/);
    expect(out).toContain('datei-a');
  });

  it('behält den Exit-Code eines fehlgeschlagenen Befehls', async () => {
    mockContainer.exec.mockResolvedValue(execDoppel(['bash: nope: not found\n'], 127));
    const out = await tool.execute({ befehl: 'nope' }, ctx);
    expect(out).toMatch(/Exit-Code: 127/);
    expect(out).toContain('not found');
  });

  it('meldet den Zeitlimit-Abbruch als solchen, nicht als Exit-Code 124', async () => {
    mockContainer.exec.mockResolvedValue(execDoppel([''], 124));
    const out = await tool.execute({ befehl: 'sleep 999' }, { ...ctx, timeoutS: 10 });
    expect(out).toMatch(/Zeitlimit von 10s/i);
  });

  it('kürzt eine überlange Ausgabe und sagt es dazu', async () => {
    const riesig = 'x'.repeat(TerminalTool.MAX_OUTPUT_BYTES + 5000);
    mockContainer.exec.mockResolvedValue(execDoppel([riesig], 0));
    const out = await tool.execute({ befehl: 'cat gross.log' }, ctx);
    expect(out).toMatch(/gekuerzt bei/i);
    expect(Buffer.byteLength(out, 'utf8')).toBeLessThan(TerminalTool.MAX_OUTPUT_BYTES + 500);
  });

  it('sagt "keine Ausgabe" statt eine leere Antwort zu liefern', async () => {
    mockContainer.exec.mockResolvedValue(execDoppel([''], 0));
    const out = await tool.execute({ befehl: 'touch leer' }, ctx);
    expect(out).toMatch(/keine Ausgabe/i);
  });

  it('meldet einen verschwundenen Container mit klarer Ursache', async () => {
    const err = new Error('no such container');
    err.statusCode = 404;
    mockContainer.exec.mockRejectedValue(err);
    const out = await tool.execute({ befehl: 'ls' }, ctx);
    expect(out).toMatch(/existiert nicht mehr/i);
  });
});

describe('sandboxResolve — Pfadübersetzung', () => {
  const mounts = [
    { Source: '/home/arasul/arasul/arasul-jet/data/skills', Destination: '/arasul/skills' },
    { Source: '/home/arasul/arasul/arasul-jet/data', Destination: '/arasul' },
  ];

  beforeEach(() => {
    mockDocker.getContainer.mockReturnValue({
      ...mockContainer,
      inspect: jest.fn().mockResolvedValue({ Mounts: mounts }),
    });
  });

  it('übersetzt einen Backend-Pfad in den Host-Pfad', async () => {
    await expect(sandboxResolve.toHostPath('/arasul/skills/bericht')).resolves.toBe(
      '/home/arasul/arasul/arasul-jet/data/skills/bericht'
    );
  });

  it('nimmt den SPEZIELLSTEN Mount, nicht den erstbesten', async () => {
    // /arasul/skills liegt innerhalb von /arasul — der längere Treffer gewinnt,
    // sonst zeigt die Übersetzung auf den falschen Host-Ordner.
    await expect(sandboxResolve.toHostPath('/arasul/skills')).resolves.toBe(
      '/home/arasul/arasul/arasul-jet/data/skills'
    );
  });

  it('weist einen Pfad ab, der in keinem Mount liegt', async () => {
    await expect(sandboxResolve.toHostPath('/etc/passwd')).rejects.toThrow(/nicht als Mount/i);
  });
});

describe('sandboxResolve — Container-Lebenszyklus', () => {
  const mounts = [{ Source: '/host/data', Destination: '/arasul' }];
  const roots = ['/arasul/berichte'];
  const erwarteterBind = '/host/data/berichte:/arasul/berichte:rw';

  /** getContainer liefert je nach Namen den Selbst- oder den Sandbox-Doppel. */
  function verdrahte(sandboxInspect) {
    mockDocker.getContainer.mockImplementation(name => {
      if (name === 'dashboard-backend') {
        return { inspect: jest.fn().mockResolvedValue({ Mounts: mounts }) };
      }
      return { ...mockContainer, inspect: sandboxInspect };
    });
  }

  it('legt die Skill-Ordner an, BEVOR Docker sie als root anlegen würde', async () => {
    // Live auf dem Jetson gefunden (Plan 012 Phase E): fehlt das Quell-
    // verzeichnis eines Bind-Mounts, legt der Docker-Daemon es als root an.
    // Das Backend (uid 1000) kann danach nicht mehr hineinschreiben —
    // `dateien_schreiben` scheiterte mit EACCES. Deshalb muss ensureSkillSandbox
    // die Ordner selbst anlegen, bevor der Container entsteht.
    const fs = require('fs');
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    verdrahte(
      jest.fn().mockResolvedValue({
        Id: 'sandbox-1',
        State: { Running: true },
        HostConfig: { Binds: [erwarteterBind] },
      })
    );

    await sandboxResolve.ensureSkillSandbox(roots);

    expect(mkdirSpy).toHaveBeenCalledWith('/arasul/berichte', { recursive: true });
    mkdirSpy.mockRestore();
  });

  it('ein fehlgeschlagenes Anlegen bricht den Lauf nicht ab', async () => {
    const fs = require('fs');
    const mkdirSpy = jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      throw new Error('EROFS: read-only file system');
    });
    verdrahte(
      jest.fn().mockResolvedValue({
        Id: 'sandbox-1',
        State: { Running: true },
        HostConfig: { Binds: [erwarteterBind] },
      })
    );

    const res = await sandboxResolve.ensureSkillSandbox(roots);
    expect(res.containerId).toBe('sandbox-1');
    mkdirSpy.mockRestore();
  });

  it('verwendet einen laufenden Container mit GENAU den passenden Ordnern weiter', async () => {
    verdrahte(
      jest.fn().mockResolvedValue({
        Id: 'sandbox-1',
        State: { Running: true },
        HostConfig: { Binds: [erwarteterBind] },
      })
    );
    const res = await sandboxResolve.ensureSkillSandbox(roots);
    expect(res.containerId).toBe('sandbox-1');
    expect(res.cwd).toBe('/arasul/berichte');
    expect(mockDocker.createContainer).not.toHaveBeenCalled();
    expect(mockContainer.remove).not.toHaveBeenCalled();
  });

  it('startet einen gestoppten, aber passenden Container neu', async () => {
    verdrahte(
      jest.fn().mockResolvedValue({
        Id: 'sandbox-1',
        State: { Running: false },
        HostConfig: { Binds: [erwarteterBind] },
      })
    );
    const res = await sandboxResolve.ensureSkillSandbox(roots);
    expect(res.containerId).toBe('sandbox-1');
    expect(mockContainer.start).toHaveBeenCalled();
    expect(mockDocker.createContainer).not.toHaveBeenCalled();
  });

  it('baut neu auf, wenn der Container ANDERE Ordner hat', async () => {
    verdrahte(
      jest.fn().mockResolvedValue({
        Id: 'sandbox-alt',
        State: { Running: true },
        HostConfig: { Binds: ['/host/data/anderes:/arasul/anderes:rw'] },
      })
    );
    mockDocker.createContainer.mockResolvedValue({ id: 'sandbox-neu', start: jest.fn() });

    const res = await sandboxResolve.ensureSkillSandbox(roots);
    expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
    expect(res.containerId).toBe('sandbox-neu');
  });

  it('baut neu auf, wenn der Container ZUSÄTZLICHE Ordner hat', async () => {
    // Der eigentliche Sicherheitspunkt: Ein Container, in dem noch die Ordner
    // eines anderen Skills hängen, darf NICHT weiterverwendet werden — sonst
    // käme dieser Skill per `cd` an fremde Dateien.
    verdrahte(
      jest.fn().mockResolvedValue({
        Id: 'sandbox-alt',
        State: { Running: true },
        HostConfig: { Binds: [erwarteterBind, '/host/data/fremd:/arasul/fremd:rw'] },
      })
    );
    mockDocker.createContainer.mockResolvedValue({ id: 'sandbox-neu', start: jest.fn() });

    const res = await sandboxResolve.ensureSkillSandbox(roots);
    expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
    expect(res.containerId).toBe('sandbox-neu');
  });

  it('legt einen Container an, wenn keiner existiert — gehärtet', async () => {
    const fehlt = new Error('no such container');
    fehlt.statusCode = 404;
    verdrahte(jest.fn().mockRejectedValue(fehlt));
    mockDocker.createContainer.mockResolvedValue({ id: 'sandbox-neu', start: jest.fn() });

    await sandboxResolve.ensureSkillSandbox(roots);
    const cfg = mockDocker.createContainer.mock.calls[0][0];
    expect(cfg.HostConfig.Binds).toEqual([erwarteterBind]);
    expect(cfg.WorkingDir).toBe('/arasul/berichte');
    expect(cfg.HostConfig.CapDrop).toEqual(['ALL']);
    expect(cfg.HostConfig.SecurityOpt).toContain('no-new-privileges:true');
    expect(cfg.HostConfig.NetworkMode).toBe('bridge');
    expect(cfg.HostConfig.PidsLimit).toBeGreaterThan(0);
  });

  it('nennt das fehlende Sandbox-Image als Ursache, statt abzustürzen', async () => {
    const fehlt = new Error('no such image');
    fehlt.statusCode = 404;
    mockDocker.getImage.mockReturnValue({ inspect: jest.fn().mockRejectedValue(fehlt) });
    verdrahte(jest.fn().mockResolvedValue({}));

    await expect(sandboxResolve.ensureSkillSandbox(roots)).rejects.toThrow(
      /Sandbox-Image .* fehlt/i
    );
  });

  it('weist einen Skill-Ordner ab, der im Backend gar nicht gemountet ist', async () => {
    verdrahte(jest.fn().mockResolvedValue({}));
    await expect(sandboxResolve.ensureSkillSandbox(['/irgendwo/anders'])).rejects.toThrow(
      /nicht als Mount/i
    );
  });
});
