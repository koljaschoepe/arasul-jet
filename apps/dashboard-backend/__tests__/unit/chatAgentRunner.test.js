/**
 * Chat-Agent (2026-07-28): Streaming-Runde über /api/chat.
 *
 * Getestet wird der NDJSON-Parser der Runde: Antwort-Token fließen über
 * onToken, tool_calls werden gesammelt, ein `error`-Frame bricht ab. Der
 * Ollama-Stream ist ein PassThrough — kein echtes Netz, keine GPU.
 */

const { PassThrough } = require('stream');

jest.mock('axios');
const axios = require('axios');

const { streamChatRound } = require('../../src/services/llm/chatAgentRunner');

function fakeStream(lines) {
  const stream = new PassThrough();
  process.nextTick(() => {
    for (const line of lines) {
      stream.write(`${JSON.stringify(line)}\n`);
    }
    stream.end();
  });
  return stream;
}

describe('chatAgentRunner.streamChatRound', () => {
  test('streamt Antwort-Token und liefert den Gesamt-Inhalt', async () => {
    axios.post.mockResolvedValueOnce({
      data: fakeStream([
        { message: { content: 'Hallo ' } },
        { message: { content: 'Welt' } },
        { message: {}, done: true },
      ]),
    });

    const tokens = [];
    const { content, toolCalls } = await streamChatRound({
      model: 'qwen3:8b',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [],
      onToken: t => tokens.push(t),
    });

    expect(content).toBe('Hallo Welt');
    expect(tokens).toEqual(['Hallo ', 'Welt']);
    expect(toolCalls).toEqual([]);
  });

  test('sammelt tool_calls aus dem Stream', async () => {
    const call = { function: { name: 'rag_suche', arguments: { frage: 'Bachelorarbeit' } } };
    axios.post.mockResolvedValueOnce({
      data: fakeStream([{ message: { tool_calls: [call] } }, { message: {}, done: true }]),
    });

    const { content, toolCalls } = await streamChatRound({
      model: 'qwen3:8b',
      messages: [],
      tools: [{ type: 'function', function: { name: 'rag_suche' } }],
      onToken: () => {},
    });

    expect(content).toBe('');
    expect(toolCalls).toEqual([call]);
  });

  test('ein error-Frame bricht die Runde mit Fehler ab', async () => {
    axios.post.mockResolvedValueOnce({
      data: fakeStream([{ error: 'model "x" does not support tools' }]),
    });

    await expect(
      streamChatRound({ model: 'x', messages: [], tools: [], onToken: () => {} })
    ).rejects.toThrow(/does not support tools/);
  });
});
