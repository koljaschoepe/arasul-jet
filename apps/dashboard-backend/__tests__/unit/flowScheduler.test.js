/**
 * Unit-Tests des Flow-Schedulers (Plan 010, Schritt 7).
 * db + runFlow werden injiziert; geprüft: fällige Flüsse werden als Owner
 * gestartet, nicht-fällige nicht, und ein Fluss läuft pro Minute nur EINMAL.
 */

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const scheduler = require('../../src/services/agents/scheduler');

beforeEach(() => {
  jest.clearAllMocks();
  scheduler._internals.lastRunMinute.clear();
});

function mockDb(rows) {
  return { query: jest.fn().mockResolvedValue({ rows }) };
}

test('startet nur fällige Flüsse — als Owner, Trigger schedule', async () => {
  const now = new Date(2026, 6, 15, 9, 5, 0); // Minute 5
  const db = mockDb([
    { id: 1, user_id: 7, schedule_cron: '*/5 * * * *' }, // fällig (5)
    { id: 2, user_id: 8, schedule_cron: '*/10 * * * *' }, // nicht fällig (5%10)
  ]);
  const runFlow = { runById: jest.fn().mockResolvedValue({ result: 'ok' }) };

  await scheduler.tick({ now, db, runFlow });

  expect(runFlow.runById).toHaveBeenCalledTimes(1);
  expect(runFlow.runById).toHaveBeenCalledWith({
    flowId: 1,
    userId: 7,
    trigger: 'schedule',
    input: '',
  });
});

test('derselbe Fluss läuft in derselben Minute nur einmal', async () => {
  const now = new Date(2026, 6, 15, 9, 5, 0);
  const db = mockDb([{ id: 1, user_id: 7, schedule_cron: '* * * * *' }]);
  const runFlow = { runById: jest.fn().mockResolvedValue({ result: 'ok' }) };

  await scheduler.tick({ now, db, runFlow });
  await scheduler.tick({ now, db, runFlow }); // zweiter Tick, gleiche Minute

  expect(runFlow.runById).toHaveBeenCalledTimes(1);
});

test('ungültiger Cron-Ausdruck startet nichts', async () => {
  const now = new Date(2026, 6, 15, 9, 5, 0);
  const db = mockDb([{ id: 3, user_id: 9, schedule_cron: 'kaputt' }]);
  const runFlow = { runById: jest.fn() };
  await scheduler.tick({ now, db, runFlow });
  expect(runFlow.runById).not.toHaveBeenCalled();
});
