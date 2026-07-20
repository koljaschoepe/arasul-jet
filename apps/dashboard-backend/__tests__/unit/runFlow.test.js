/**
 * Unit-Tests des Fluss-Runners (Plan 010, Schritt 4).
 * Kern: Validierung (Graph/Agenten-Eigentümerschaft) passiert VOR dem ersten
 * SSE-Frame und PROPAGIERT (kein Fangen) → echte HTTP 400/404 statt error-Frame.
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));
jest.mock('../../src/services/agents/flowsService', () => ({
  getFlow: jest.fn(),
  assertAgentsOwned: jest.fn(),
  persistFlowRun: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/agents/flowEngine', () => ({
  validateGraph: jest.fn(),
  executeFlow: jest.fn(),
}));

const flowsService = require('../../src/services/agents/flowsService');
const flowEngine = require('../../src/services/agents/flowEngine');
const runFlow = require('../../src/services/agents/runFlow');
const { NotFoundError, ValidationError } = require('../../src/utils/errors');

const FLOW = { id: 3, name: 'F', graph: { nodes: [{ id: 'a', type: 'agent', data: { agentId: 1 } }], edges: [] } };

beforeEach(() => jest.clearAllMocks());

test('erfolgreicher Lauf: flow_start → flow_done, letzter Lauf persistiert', async () => {
  flowsService.getFlow.mockResolvedValue(FLOW);
  flowEngine.validateGraph.mockReturnValue({ agentIds: [1] });
  flowsService.assertAgentsOwned.mockResolvedValue(undefined);
  flowEngine.executeFlow.mockResolvedValue({ result: 'ENDE' });

  const events = [];
  const out = await runFlow.runById({ flowId: 3, userId: 7, input: 'x', onEvent: e => events.push(e) });

  expect(out).toEqual({ result: 'ENDE' });
  expect(events.map(e => e.type)).toEqual(['flow_start', 'flow_done']);
  expect(flowsService.persistFlowRun).toHaveBeenCalledWith(3, 7, expect.objectContaining({ status: 'done' }));
});

test('ungültiger Graph (ValidationError) PROPAGIERT vor dem ersten Frame', async () => {
  flowsService.getFlow.mockResolvedValue(FLOW);
  flowEngine.validateGraph.mockImplementation(() => {
    throw new ValidationError('Zyklus');
  });

  const events = [];
  await expect(runFlow.runById({ flowId: 3, userId: 7, onEvent: e => events.push(e) })).rejects.toThrow(
    ValidationError
  );
  // Kein SSE-Frame emittiert → der Stream bleibt zu, asyncHandler liefert 400.
  expect(events).toHaveLength(0);
  expect(flowEngine.executeFlow).not.toHaveBeenCalled();
});

test('fremder Agent (assertAgentsOwned wirft) PROPAGIERT vor dem ersten Frame', async () => {
  flowsService.getFlow.mockResolvedValue(FLOW);
  flowEngine.validateGraph.mockReturnValue({ agentIds: [99] });
  flowsService.assertAgentsOwned.mockRejectedValue(new ValidationError('fremder Agent'));

  const events = [];
  await expect(runFlow.runById({ flowId: 3, userId: 7, onEvent: e => events.push(e) })).rejects.toThrow(
    ValidationError
  );
  expect(events).toHaveLength(0);
});

test('unbekannter Fluss (NotFoundError) PROPAGIERT', async () => {
  flowsService.getFlow.mockRejectedValue(new NotFoundError('Fluss nicht gefunden'));
  await expect(runFlow.runById({ flowId: 9, userId: 7, onEvent: () => {} })).rejects.toThrow(NotFoundError);
});

test('Laufzeitfehler während der Ausführung → flow_error (gefangen, kein Wurf)', async () => {
  flowsService.getFlow.mockResolvedValue(FLOW);
  flowEngine.validateGraph.mockReturnValue({ agentIds: [1] });
  flowsService.assertAgentsOwned.mockResolvedValue(undefined);
  flowEngine.executeFlow.mockRejectedValue(new Error('Knoten "a": Modell kaputt'));

  const events = [];
  const out = await runFlow.runById({ flowId: 3, userId: 7, onEvent: e => events.push(e) });
  expect(out.error).toMatch(/Modell kaputt/);
  expect(events.map(e => e.type)).toEqual(['flow_start', 'flow_error']);
});
