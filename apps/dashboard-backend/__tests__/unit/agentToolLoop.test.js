/**
 * Agent run loop — unit tests. Ollama HTTP is mocked; the `dateien` tool runs
 * for real against a temp workspace so we can prove a tool executed.
 */

// Small cap so the MAX_ITERATIONS test is fast and deterministic.
process.env.AGENT_MAX_ITERATIONS = '3';

const path = require('path');
const os = require('os');
const fs = require('fs').promises;

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// axios is the transport for the Ollama /api/chat call.
jest.mock('axios', () => ({ post: jest.fn() }));

// Neutralize heavy tool deps that load at require-time (rag/terminal tools).
jest.mock('../../src/services/rag/ragCore', () => ({
  getEmbedding: jest.fn(),
  hybridSearch: jest.fn(),
}));
jest.mock('../../src/services/core/docker', () => ({
  docker: { getContainer: jest.fn(), modem: { demuxStream: jest.fn() } },
}));

const axios = require('axios');
const { runAgent, MAX_ITERATIONS } = require('../../src/services/agents/toolLoop');

const okMessage = message => ({ data: { message } });

describe('runAgent', () => {
  let dir;

  beforeEach(async () => {
    jest.clearAllMocks();
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-loop-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('picked up the lowered MAX_ITERATIONS', () => {
    expect(MAX_ITERATIONS).toBe(3);
  });

  it('runs a tool call then a final text answer, firing events in order', async () => {
    // Turn 1: model asks to write a file. Turn 2: model answers in plain text.
    axios.post
      .mockResolvedValueOnce(
        okMessage({
          content: '',
          tool_calls: [
            {
              function: {
                name: 'dateien',
                arguments: { aktion: 'write', pfad: 'out.txt', inhalt: 'hallo' },
              },
            },
          ],
        })
      )
      .mockResolvedValueOnce(okMessage({ content: 'Fertig.' }));

    const agent = {
      name: 'T',
      model: 'llama3.2',
      tools: ['dateien'],
      systemPrompt: 'Du bist ein Agent.',
    };

    const events = [];
    const result = await runAgent({
      agent,
      userInput: 'Schreibe out.txt',
      context: { hostPath: dir },
      onEvent: e => events.push(e),
    });

    // The tool really ran.
    const written = await fs.readFile(path.join(dir, 'out.txt'), 'utf8');
    expect(written).toBe('hallo');

    // Event order.
    expect(events.map(e => e.type)).toEqual(['tool_start', 'tool_result', 'text', 'done']);
    expect(events[0]).toMatchObject({ type: 'tool_start', tool: 'dateien' });
    expect(events[1].type).toBe('tool_result');
    expect(events[2]).toMatchObject({ type: 'text', content: 'Fertig.' });
    expect(events[3]).toMatchObject({ type: 'done', result: 'Fertig.' });

    expect(result.result).toBe('Fertig.');
    expect(result.iterations).toBe(2);
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it('terminates with a truncation note when the model keeps calling tools', async () => {
    // Always return a tool_call → never converges.
    axios.post.mockResolvedValue(
      okMessage({
        content: '',
        tool_calls: [
          { function: { name: 'dateien', arguments: { aktion: 'list', pfad: '.' } } },
        ],
      })
    );

    const agent = {
      name: 'Loop',
      model: 'llama3.2',
      tools: ['dateien'],
      systemPrompt: 'x',
    };

    const events = [];
    const result = await runAgent({
      agent,
      userInput: 'liste',
      context: { hostPath: dir },
      onEvent: e => events.push(e),
    });

    expect(axios.post).toHaveBeenCalledTimes(3); // == MAX_ITERATIONS
    expect(result.truncated).toBe(true);
    const done = events.filter(e => e.type === 'done');
    expect(done).toHaveLength(1);
    expect(done[0].truncated).toBe(true);
  });

  it('emits an error event and returns when the Ollama call fails', async () => {
    axios.post.mockRejectedValue(new Error('connection refused'));
    const agent = { name: 'E', model: 'm', tools: [], systemPrompt: 'x' };

    const events = [];
    const result = await runAgent({
      agent,
      userInput: 'hi',
      context: { hostPath: dir },
      onEvent: e => events.push(e),
    });

    expect(events.some(e => e.type === 'error')).toBe(true);
    expect(result.error).toMatch(/connection refused/);
  });
});
