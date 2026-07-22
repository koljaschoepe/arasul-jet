/**
 * Regressionstest für den GPU-Sperr-Deadlock (Plan 011, Schritt 10).
 *
 * Seit Schritt 10 hält der Chat-Stream (streamFromOllama) die EINE GPU-Sperre
 * für seine gesamte Dauer — geteilt mit den Skills. Der Inaktivitäts-Timeout
 * räumt die Stream-Listener ab, BEVOR ein 'error'/'end' feuern könnte. Ohne
 * eine ausdrückliche Auflösung des Stream-Promise kehrte die Funktion nie
 * zurück, und die Sperre bliebe für immer belegt — ein einziger hängender
 * Stream würde Chat UND alle Skills dauerhaft blockieren.
 *
 * Dieser Test treibt den echten streamFromOllama mit einem Stream, der NIE
 * Daten liefert, und einem winzigen Inaktivitäts-Timeout. Er besteht nur, wenn
 * die Funktion trotzdem zurückkehrt und die GPU-Sperre wieder frei ist.
 */

// http.request so mocken, dass es einen Stream liefert, der nie etwas sendet.
// Der `require('stream')` MUSS in der Fabrik stehen — jest verbietet
// Verweise auf Variablen ausserhalb.
jest.mock('http', () => {
  const actual = jest.requireActual('http');
  const { PassThrough } = require('stream');
  return {
    ...actual,
    request: jest.fn((_opts, cb) => {
      const res = new PassThrough();
      res.statusCode = 200;
      // Antwort-Callback mit dem (pausierten, stummen) Stream aufrufen.
      process.nextTick(() => cb(res));
      return { on: jest.fn(), write: jest.fn(), end: jest.fn(), destroy: jest.fn() };
    }),
    Agent: actual.Agent,
  };
});

// Circuit-Breaker durchreichen (kein echtes Ausfall-Handling im Test nötig).
jest.mock('../../src/utils/retry', () => ({
  circuitBreakers: { get: () => ({ execute: fn => fn() }) },
}));

const { streamFromOllama } = require('../../src/services/llm/llmOllamaStream');
const { withGpuLock, _gpuMutex } = require('../../src/services/skills/gpuQueue');

function fakeCtx() {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return {
    deps: {
      database: { query: jest.fn().mockResolvedValue({ rows: [] }) },
      logger,
      llmJobService: {
        registerStream: jest.fn(),
        updateJobContent: jest.fn().mockResolvedValue(undefined),
        errorJob: jest.fn().mockResolvedValue(undefined),
        completeJob: jest.fn().mockResolvedValue(true),
      },
      modelService: { getDefaultModel: jest.fn().mockResolvedValue('m') },
    },
    config: { LLM_SERVICE_URL: 'http://llm:11434' },
    service: {
      notifySubscribers: jest.fn(),
      notifySubscribersBatched: jest.fn(),
      processNext: jest.fn(),
    },
  };
}

describe('streamFromOllama — GPU-Sperre wird immer freigegeben', () => {
  const alterTimeout = process.env.LLM_INACTIVITY_TIMEOUT_MS;
  beforeAll(() => {
    // Winziger Inaktivitäts-Timeout, damit der stumme Stream schnell abbricht.
    process.env.LLM_INACTIVITY_TIMEOUT_MS = '60';
  });
  afterAll(() => {
    if (alterTimeout === undefined) delete process.env.LLM_INACTIVITY_TIMEOUT_MS;
    else process.env.LLM_INACTIVITY_TIMEOUT_MS = alterTimeout;
  });

  it('kehrt bei einem hängenden Stream zurück, statt die Sperre für immer zu halten', async () => {
    const ctx = fakeCtx();
    // Wenn der Deadlock zurück wäre, liefe das hier in den Jest-Timeout.
    await streamFromOllama(ctx, 'job1', 'prompt', false, 0.7, 100, 'model', '', null, null);

    // Kernaussage: Die gemeinsame GPU-Sperre ist wieder frei.
    expect(_gpuMutex._locked).toBe(false);

    // Und ein nachfolgender Aufruf (Chat ODER Skill) kommt durch.
    let lief = false;
    await withGpuLock(async () => {
      lief = true;
    });
    expect(lief).toBe(true);
  }, 4000);

  it('hält die Sperre, solange der Stream läuft — ein zweiter Nutzer wartet', async () => {
    // Der eigentliche Punkt der gemeinsamen Sperre: Während der Stream die GPU
    // hält, darf kein zweiter Nutzer (Chat ODER Skill) hinein.
    const ctx = fakeCtx();
    const streamP = streamFromOllama(ctx, 'job2', 'p', false, 0.7, 100, 'model', '', null, null);

    // Synchron nach dem Start: Der Stream hält die Sperre.
    expect(_gpuMutex._locked).toBe(true);

    let zweiterLief = false;
    const zweiterP = withGpuLock(async () => {
      zweiterLief = true;
    });
    // Der zweite Nutzer darf JETZT noch nicht gelaufen sein — er wartet.
    expect(zweiterLief).toBe(false);

    await Promise.all([streamP, zweiterP]);
    // Nach dem Stream kam er durch.
    expect(zweiterLief).toBe(true);
    expect(_gpuMutex._locked).toBe(false);
  }, 4000);
});
