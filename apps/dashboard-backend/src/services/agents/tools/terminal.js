/**
 * Agent tool: `terminal` — run a one-shot command in the workspace container.
 *
 * A NON-interactive `docker exec` (no TTY): the command runs, its stdout+stderr
 * are captured and demultiplexed, then returned as text. Bounded by a wall-clock
 * timeout and an output-size cap. Uses the same dockerode client the sandbox
 * services use (services/core/docker.js). Never throws into the run loop —
 * a stopped/missing container comes back as a clear error string.
 */

const { Writable } = require('stream');
const BaseTool = require('../../../tools/baseTool');
const { docker } = require('../../core/docker');
const logger = require('../../../utils/logger');

const EXEC_TIMEOUT_MS = parseInt(process.env.AGENT_TERMINAL_TIMEOUT_MS || '30000', 10);
const MAX_OUTPUT_BYTES = 64 * 1024; // 64 KB

/**
 * A Writable that appends chunks up to a shared byte budget, dropping the rest.
 */
function makeCappedSink(state) {
  return new Writable({
    write(chunk, _enc, cb) {
      if (state.total < MAX_OUTPUT_BYTES) {
        const remaining = MAX_OUTPUT_BYTES - state.total;
        state.chunks.push(chunk.length > remaining ? chunk.slice(0, remaining) : chunk);
        state.total += chunk.length;
        if (state.total >= MAX_OUTPUT_BYTES) {
          state.truncated = true;
        }
      } else {
        state.truncated = true;
      }
      cb();
    },
  });
}

class TerminalTool extends BaseTool {
  get name() {
    return 'terminal';
  }

  get description() {
    return 'Fuehrt einen Shell-Befehl im abgeschotteten Workspace-Container aus';
  }

  get parameters() {
    return {
      befehl: {
        type: 'string',
        description: 'Der auszufuehrende Shell-Befehl',
        required: true,
      },
    };
  }

  /**
   * @param {{befehl?:string, command?:string}} params
   * @param {{containerName?:string, containerId?:string}} context
   */
  async execute(params = {}, context = {}) {
    const command = String(params.befehl || params.command || '').trim();
    if (!command) {
      return 'Fehler: "befehl" darf nicht leer sein.';
    }
    const target = context.containerName || context.containerId;
    if (!target) {
      return 'Fehler: Kein Workspace-Container im Kontext.';
    }

    const container = docker.getContainer(target);

    let exec;
    let stream;
    try {
      exec = await container.exec({
        Cmd: ['/bin/sh', '-c', command],
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
      });
      stream = await exec.start({ hijack: true, stdin: false });
    } catch (err) {
      // 404 = container gone, 409 = not running — surface both as text.
      logger.warn(`Agent terminal exec failed on ${target}: ${err.message}`);
      return `Fehler: Container "${target}" nicht erreichbar (${err.message}).`;
    }

    const state = { chunks: [], total: 0, truncated: false };
    const stdout = makeCappedSink(state);
    const stderr = makeCappedSink(state);

    return new Promise(resolve => {
      let settled = false;
      const finish = suffix => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        const output = Buffer.concat(state.chunks).toString('utf8');
        const truncNote = state.truncated
          ? `\n... [Ausgabe gekuerzt bei ${MAX_OUTPUT_BYTES} Bytes]`
          : '';
        resolve(`${output}${truncNote}${suffix || ''}`.trim() || '(keine Ausgabe)');
      };

      const timer = setTimeout(() => {
        try {
          stream.destroy();
        } catch {
          /* ignore */
        }
        finish(`\n... [abgebrochen nach ${EXEC_TIMEOUT_MS} ms Zeitlimit]`);
      }, EXEC_TIMEOUT_MS);

      // Demultiplex the exec stream into stdout/stderr sinks.
      docker.modem.demuxStream(stream, stdout, stderr);

      stream.on('end', () => finish(''));
      stream.on('error', err => finish(`\n... [Stream-Fehler: ${err.message}]`));
    });
  }
}

module.exports = TerminalTool;
