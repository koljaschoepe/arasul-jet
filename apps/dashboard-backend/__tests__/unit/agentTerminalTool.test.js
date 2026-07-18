/**
 * Agent `terminal` tool — unit tests with a mocked docker exec.
 */

// Keep the exec timeout short so the timeout case resolves fast.
process.env.AGENT_TERMINAL_TIMEOUT_MS = '80';

const { EventEmitter } = require('events');

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const mockExec = { start: jest.fn() };
const mockContainer = { exec: jest.fn() };

jest.mock('../../src/services/core/docker', () => ({
  docker: {
    getContainer: jest.fn(() => mockContainer),
    modem: { demuxStream: jest.fn() },
  },
}));

const { docker } = require('../../src/services/core/docker');
const TerminalTool = require('../../src/services/agents/tools/terminal');

function makeStream() {
  const s = new EventEmitter();
  s.destroy = jest.fn();
  return s;
}

describe('TerminalTool (terminal)', () => {
  let tool;
  const ctx = { containerName: 'sandbox-demo' };

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new TerminalTool();
    mockContainer.exec.mockResolvedValue(mockExec);
  });

  it('returns captured stdout output', async () => {
    const stream = makeStream();
    mockExec.start.mockResolvedValue(stream);
    docker.modem.demuxStream.mockImplementation((s, stdout) => {
      stdout.write(Buffer.from('hello world\n'));
      setImmediate(() => s.emit('end'));
    });

    const out = await tool.execute({ befehl: 'echo hello world' }, ctx);
    expect(out).toMatch(/hello world/);
    expect(mockContainer.exec).toHaveBeenCalledWith(
      expect.objectContaining({ Tty: false, Cmd: ['/bin/sh', '-c', 'echo hello world'] })
    );
  });

  it('truncates oversized output with a note', async () => {
    const stream = makeStream();
    mockExec.start.mockResolvedValue(stream);
    docker.modem.demuxStream.mockImplementation((s, stdout) => {
      stdout.write(Buffer.alloc(100 * 1024, 0x61)); // 100 KB of 'a'
      setImmediate(() => s.emit('end'));
    });

    const out = await tool.execute({ befehl: 'yes' }, ctx);
    expect(out).toMatch(/gekuerzt/);
  });

  it('stops at the timeout when the command never ends', async () => {
    const stream = makeStream();
    mockExec.start.mockResolvedValue(stream);
    // demuxStream writes nothing and the stream never emits 'end'.
    docker.modem.demuxStream.mockImplementation(() => {});

    const out = await tool.execute({ befehl: 'sleep 999' }, ctx);
    expect(out).toMatch(/Zeitlimit/);
    expect(stream.destroy).toHaveBeenCalled();
  });

  it('returns an error string when the container is not running (no throw)', async () => {
    const err = new Error('container sandbox-demo is not running');
    err.statusCode = 409;
    mockContainer.exec.mockRejectedValue(err);

    const out = await tool.execute({ befehl: 'ls' }, ctx);
    expect(out).toMatch(/nicht erreichbar/);
  });

  it('errors clearly when no container is in context', async () => {
    const out = await tool.execute({ befehl: 'ls' }, {});
    expect(out).toMatch(/Kein Workspace-Container/);
  });

  it('rejects an empty command', async () => {
    const out = await tool.execute({ befehl: '   ' }, ctx);
    expect(out).toMatch(/darf nicht leer/);
  });
});
