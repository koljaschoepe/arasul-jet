/**
 * „Nur eigene Flows" (Phase C6).
 *
 * Der Satz der Phase, gemessen an der Stelle, an der er zaehlt: der externen
 * Schnittstelle. Ein Schluessel gehoert entweder einem Menschen oder einer App
 * und ihrem Stand (Migration 171), und WELCHE Flows er sieht, entscheidet
 * nicht eine Pruefung in der Route, sondern die Quelle, in der gesucht wird.
 *
 * Der Unterschied ist nicht akademisch: eine Pruefung kann man an einer von
 * drei Routen vergessen. Eine App, die in einem anderen Namensraum sucht,
 * kann den Flow einer anderen App nicht einmal benennen.
 */
const express = require('express');
const request = require('supertest');

jest.mock('../../src/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/llm/llmQueueService', () => ({ enqueue: jest.fn() }));
jest.mock('../../src/services/llm/llmJobService', () => ({ getJob: jest.fn() }));
jest.mock('../../src/services/llm/modelService', () => ({
  getInstalledModels: jest.fn(),
  getDefaultModel: jest.fn(),
  getLoadedModel: jest.fn(),
}));
jest.mock('../../src/services/documents/extractionService', () => ({}));
// `FLOWS_DIR` muss mit: `vorlagenStore` baut daraus beim Laden einen Pfad,
// und ohne ihn faellt schon das `require` der Route um.
jest.mock('../../src/services/flows/flowRegistry', () => ({
  listFlows: jest.fn(),
  loadFlow: jest.fn(),
  FLOWS_DIR: '/tmp/arasul-flowtrigger-test',
}));
jest.mock('../../src/services/flows/flowRunner', () => ({ starten: jest.fn() }));
jest.mock('../../src/services/flows/runStore', () => ({ getRun: jest.fn() }));
jest.mock('../../src/services/app/appFlows', () => ({ liste: jest.fn(), lade: jest.fn() }));

// Der Schluessel kommt aus einer Kopfzeile des Tests: `app` heisst „Schluessel
// einer App", alles andere „Schluessel eines Menschen". Das ist genau die
// Unterscheidung, die `middleware/apiKeyAuth.js` aus `api_keys.app_id` trifft.
jest.mock('../../src/middleware/apiKeyAuth', () => ({
  requireApiKey: (req, res, next) => {
    const wer = req.headers['x-api-key'];
    req.apiKey =
      wer === 'app'
        ? { id: 2, userId: 1, name: 'App urlaub (live)', appId: 'urlaub', stand: 'live' }
        : { id: 1, userId: 1, name: 'Mensch', appId: null, stand: null };
    next();
  },
  requireEndpoint: () => (req, res, next) => next(),
  generateApiKey: jest.fn(),
}));

const flowRegistry = require('../../src/services/flows/flowRegistry');
const flowRunner = require('../../src/services/flows/flowRunner');
const runStore = require('../../src/services/flows/runStore');
const appFlows = require('../../src/services/app/appFlows');
const { errorHandler } = require('../../src/middleware/errorHandler');
const { NotFoundError } = require('../../src/utils/errors');

function server() {
  const a = express();
  a.use(express.json());
  a.use('/api/v1/external', require('../../src/routes/external/externalApi'));
  a.use(errorHandler);
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('GET /flows', () => {
  it('zeigt einer App NUR ihre eigenen Flows, im Stand ihres Containers', async () => {
    appFlows.liste.mockResolvedValue([{ name: 'bericht', modell: 'qwen3:14b-q8' }]);
    const res = await request(server()).get('/api/v1/external/flows').set('x-api-key', 'app');

    expect(res.status).toBe(200);
    expect(res.body.app).toBe('urlaub');
    expect(res.body.stand).toBe('live');
    expect(res.body.flows).toEqual([{ name: 'bericht', modell: 'qwen3:14b-q8' }]);
    expect(appFlows.liste).toHaveBeenCalledWith({ appId: 'urlaub', stand: 'live' });
    // Die Flows der Plattform bekommt sie gar nicht erst zu Gesicht.
    expect(flowRegistry.listFlows).not.toHaveBeenCalled();
  });

  it('zeigt einem Menschen die Flows der Plattform', async () => {
    flowRegistry.listFlows.mockResolvedValue({ flows: [{ name: 'recherche' }], fehlerhaft: [] });
    const res = await request(server()).get('/api/v1/external/flows').set('x-api-key', 'mensch');

    expect(res.status).toBe(200);
    expect(res.body.flows[0].name).toBe('recherche');
    expect(appFlows.liste).not.toHaveBeenCalled();
  });
});

describe('POST /flows/:name/run', () => {
  it('startet den Flow der eigenen App und schreibt App und Stand an den Lauf', async () => {
    appFlows.lade.mockResolvedValue({ name: 'bericht', argumente: [] });
    flowRunner.starten.mockResolvedValue({ runId: 5 });

    const res = await request(server())
      .post('/api/v1/external/flows/bericht/run')
      .set('x-api-key', 'app')
      .send({ wait_for_result: false });

    expect(res.status).toBe(202);
    expect(res.body.run_id).toBe(5);
    expect(flowRunner.starten).toHaveBeenCalledWith({
      flowName: 'bericht',
      args: {},
      userId: 1,
      appId: 'urlaub',
      stand: 'live',
    });
  });

  it('findet den Flow einer FREMDEN App nicht -- 404 statt Start', async () => {
    // Das eigentliche Mass der Phase. `lade` sucht mit App und Stand im WHERE;
    // ein Name, der einer anderen App gehoert, hat hier keinen Treffer.
    appFlows.lade.mockRejectedValue(new NotFoundError('App urlaub hat im live-Stand keinen Flow "fremd"'));

    const res = await request(server())
      .post('/api/v1/external/flows/fremd/run')
      .set('x-api-key', 'app')
      .send({ wait_for_result: false });

    expect(res.status).toBe(404);
    expect(flowRunner.starten).not.toHaveBeenCalled();
  });

  it('geht mit dem Schluessel eines Menschen weiter ueber die Registry', async () => {
    flowRegistry.loadFlow.mockResolvedValue({ name: 'recherche', argumente: [] });
    flowRunner.starten.mockResolvedValue({ runId: 6 });

    await request(server())
      .post('/api/v1/external/flows/recherche/run')
      .set('x-api-key', 'mensch')
      .send({ wait_for_result: false });

    expect(flowRegistry.loadFlow).toHaveBeenCalledWith('recherche');
    expect(flowRunner.starten).toHaveBeenCalledWith(
      expect.objectContaining({ appId: null, stand: null })
    );
  });
});

describe('GET /flows/runs/:id', () => {
  it('engt den Abruf eines Laufs auf App und Stand ein', async () => {
    // Der Schluessel einer App gehoert dem Administrator, der sie eingespielt
    // hat. Ueber `user_id` allein saehe die App dessen eigene Laeufe und die
    // jeder anderen App desselben Geraets.
    runStore.getRun.mockResolvedValue({ status: 'fertig', result: 'da', steps_used: 3 });

    const res = await request(server()).get('/api/v1/external/flows/runs/5').set('x-api-key', 'app');

    expect(res.status).toBe(200);
    expect(runStore.getRun).toHaveBeenCalledWith({
      runId: 5,
      userId: 1,
      appId: 'urlaub',
      stand: 'live',
    });
  });
});
