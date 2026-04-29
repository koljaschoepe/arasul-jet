/**
 * Phase 4.6 — in-memory live-stream snapshot.
 *
 * The streaming layer updates `liveStreamingState[jobId]` synchronously per
 * token. The reconnect endpoint reads from there first so it sees tokens
 * that haven't been DB-flushed yet (debounced 150ms). On job completion,
 * the snapshot is dropped because the DB row becomes canonical.
 */

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { createLLMQueueService } = require('../../src/services/llm/llmQueueService');

function makeSvc() {
  // Bypass the heavy lifecycle init — we only exercise the live-stream API.
  return createLLMQueueService({
    database: { query: jest.fn() },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    llmJobService: {},
    modelService: {},
    axios: {},
  });
}

describe('Phase 4.6 — live-stream snapshot', () => {
  test('appendLiveStream accumulates content and increments seq', () => {
    const svc = makeSvc();
    svc.appendLiveStream('job-1', { content: 'Hello ' });
    svc.appendLiveStream('job-1', { content: 'World' });
    svc.appendLiveStream('job-1', { thinking: 'pondering...' });

    const live = svc.getLiveStream('job-1');
    expect(live.content).toBe('Hello World');
    expect(live.thinking).toBe('pondering...');
    expect(live.seq).toBe(3);
    expect(live.updatedAt).toBeGreaterThan(0);
  });

  test('getLiveStream returns null for an unknown jobId', () => {
    const svc = makeSvc();
    expect(svc.getLiveStream('never-existed')).toBeNull();
  });

  test('clearLiveStream wipes the snapshot', () => {
    const svc = makeSvc();
    svc.appendLiveStream('job-2', { content: 'partial' });
    expect(svc.getLiveStream('job-2')).not.toBeNull();
    svc.clearLiveStream('job-2');
    expect(svc.getLiveStream('job-2')).toBeNull();
  });

  test('snapshot is independent across jobs', () => {
    const svc = makeSvc();
    svc.appendLiveStream('a', { content: 'A1' });
    svc.appendLiveStream('b', { content: 'B1' });
    svc.appendLiveStream('a', { content: 'A2' });

    expect(svc.getLiveStream('a').content).toBe('A1A2');
    expect(svc.getLiveStream('b').content).toBe('B1');
    expect(svc.getLiveStream('a').seq).toBe(2);
    expect(svc.getLiveStream('b').seq).toBe(1);
  });

  test('appendLiveStream with no fields still increments seq (heartbeat-safe)', () => {
    const svc = makeSvc();
    svc.appendLiveStream('h');
    svc.appendLiveStream('h');
    const live = svc.getLiveStream('h');
    expect(live.content).toBe('');
    expect(live.thinking).toBe('');
    expect(live.seq).toBe(2);
  });
});
