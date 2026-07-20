/**
 * Unit-Tests der Fluss-Zod-Schemas (Plan 010, Schritt 4 Hotfix).
 * Sichert, dass CreateFlowBody/FlowGraph tatsächlich PARSEN — die vorherige
 * z.record(z.any())-Form crashte unter Zod v4 erst zur Laufzeit (500).
 */

const { CreateFlowBody, FlowGraph, UpdateFlowBody } = require('../../src/schemas/flows');

const GRAPH = {
  nodes: [
    { id: 'c', type: 'condition', data: { mode: 'contains', value: 'ja' } },
    { id: 't', type: 'agent', data: { agentId: 4 } },
  ],
  edges: [{ id: 'e1', source: 'c', target: 't', sourceHandle: 'true' }],
};

test('FlowGraph parst einen gültigen Graphen (mit React-Flow-Zusatzfeldern)', () => {
  const withExtras = {
    nodes: [{ id: 'a', type: 'agent', data: { agentId: 1 }, position: { x: 10, y: 20 }, width: 120 }],
    edges: [],
  };
  const parsed = FlowGraph.parse(withExtras);
  expect(parsed.nodes[0].data.agentId).toBe(1);
});

test('CreateFlowBody parst Name + Graph', () => {
  const parsed = CreateFlowBody.parse({ name: 'F', graph: GRAPH });
  expect(parsed.name).toBe('F');
  expect(parsed.graph.nodes).toHaveLength(2);
  expect(parsed.description).toBe('');
});

test('CreateFlowBody ohne graph → Default leerer Graph', () => {
  const parsed = CreateFlowBody.parse({ name: 'F' });
  expect(parsed.graph).toEqual({ nodes: [], edges: [] });
});

test('unbekannter Knotentyp → Parse-Fehler', () => {
  expect(() => FlowGraph.parse({ nodes: [{ id: 'x', type: 'quatsch', data: {} }], edges: [] })).toThrow();
});

test('UpdateFlowBody verlangt mindestens ein Feld', () => {
  expect(() => UpdateFlowBody.parse({})).toThrow();
  expect(UpdateFlowBody.parse({ name: 'Neu' }).name).toBe('Neu');
});

test('zu großer Graph → Parse-Fehler (256 KiB Cap)', () => {
  const big = { nodes: [{ id: 'a', type: 'agent', data: { agentId: 1, blob: 'x'.repeat(300 * 1024) } }], edges: [] };
  expect(() => FlowGraph.parse(big)).toThrow();
});
