/**
 * Unit-Tests der Fluss-Engine (Plan 010, Schritt 4).
 * runAgent wird injiziert; geprüft: lineare Kette, Verzweigung (If/Else mit
 * Zweig-Beschneidung), parallele Zweige, Skip-Propagation, Validierung (Zyklus,
 * unbekannte Referenzen/Typen) und Knoten-Fehler.
 */

const flowEngine = require('../../src/services/agents/flowEngine');
const { ValidationError } = require('../../src/utils/errors');

// Fake-Agent: Ausgabe kodiert agentId + Eingabe, damit Datenfluss prüfbar ist.
function fakeRunAgent(spec = {}) {
  return async ({ agentId, userInput, onEvent }) => {
    if (onEvent) onEvent({ type: 'text', content: `a${agentId}` });
    if (spec[agentId]?.error) return { result: '', error: spec[agentId].error };
    const out = spec[agentId]?.out ?? `out${agentId}[${userInput}]`;
    return { result: out };
  };
}

function agentNode(id, agentId) {
  return { id, type: 'agent', data: { agentId } };
}
function condNode(id, mode, value) {
  return { id, type: 'condition', data: { mode, value } };
}
const edge = (source, target, sourceHandle) => ({ id: `${source}-${target}`, source, target, sourceHandle });

describe('validateGraph', () => {
  test('Zyklus → ValidationError', () => {
    const graph = { nodes: [agentNode('a', 1), agentNode('b', 2)], edges: [edge('a', 'b'), edge('b', 'a')] };
    expect(() => flowEngine.validateGraph(graph)).toThrow(/Zyklus/);
  });
  test('unbekannte Kanten-Referenz → ValidationError', () => {
    const graph = { nodes: [agentNode('a', 1)], edges: [edge('a', 'ghost')] };
    expect(() => flowEngine.validateGraph(graph)).toThrow(ValidationError);
  });
  test('Agent-Knoten ohne agentId → ValidationError', () => {
    const graph = { nodes: [{ id: 'a', type: 'agent', data: {} }], edges: [] };
    expect(() => flowEngine.validateGraph(graph)).toThrow(/agentId/);
  });
  test('leerer Graph → ValidationError', () => {
    expect(() => flowEngine.validateGraph({ nodes: [], edges: [] })).toThrow(/keine Knoten/);
  });
  test('sammelt agentIds', () => {
    const graph = { nodes: [agentNode('a', 5), agentNode('b', 6), condNode('c', 'contains', 'x')], edges: [] };
    expect(flowEngine.validateGraph(graph).agentIds.sort()).toEqual([5, 6]);
  });
});

describe('executeFlow — linear', () => {
  test('A → B: B bekommt A-Ausgabe, Endergebnis = B-Ausgabe', async () => {
    const graph = { nodes: [agentNode('a', 1), agentNode('b', 2)], edges: [edge('a', 'b')] };
    const out = await flowEngine.executeFlow({
      graph,
      userId: 7,
      initialInput: 'START',
      deps: { runAgent: fakeRunAgent() },
    });
    expect(out.nodeOutputs.a).toBe('out1[START]');
    expect(out.nodeOutputs.b).toBe('out2[out1[START]]');
    expect(out.result).toBe('out2[out1[START]]');
  });
});

describe('executeFlow — Verzweigung', () => {
  const graph = {
    nodes: [agentNode('a', 1), condNode('c', 'contains', 'ja'), agentNode('t', 2), agentNode('f', 3)],
    edges: [edge('a', 'c'), edge('c', 't', 'true'), edge('c', 'f', 'false')],
  };

  test('true-Zweig aktiv, false-Zweig übersprungen', async () => {
    const events = [];
    const out = await flowEngine.executeFlow({
      graph,
      userId: 7,
      initialInput: 'x',
      onEvent: e => events.push(e),
      deps: { runAgent: fakeRunAgent({ 1: { out: 'ja bitte' } }) },
    });
    expect(out.nodeOutputs.t).toBe('out2[ja bitte]');
    expect(out.nodeOutputs.f).toBeNull(); // übersprungen
    expect(events.some(e => e.type === 'node_skipped' && e.node === 'f')).toBe(true);
    expect(out.result).toBe('out2[ja bitte]');
  });

  test('false-Zweig aktiv, wenn Bedingung nicht erfüllt', async () => {
    const out = await flowEngine.executeFlow({
      graph,
      userId: 7,
      deps: { runAgent: fakeRunAgent({ 1: { out: 'nein danke' } }) },
    });
    expect(out.nodeOutputs.t).toBeNull();
    expect(out.nodeOutputs.f).toBe('out3[nein danke]');
  });
});

describe('executeFlow — parallele Zweige', () => {
  test('A → B und A → C laufen beide; Endergebnis vereint beide', async () => {
    const graph = {
      nodes: [agentNode('a', 1), agentNode('b', 2), agentNode('c', 3)],
      edges: [edge('a', 'b'), edge('a', 'c')],
    };
    const out = await flowEngine.executeFlow({
      graph,
      userId: 7,
      initialInput: 'S',
      deps: { runAgent: fakeRunAgent() },
    });
    expect(out.nodeOutputs.b).toBe('out2[out1[S]]');
    expect(out.nodeOutputs.c).toBe('out3[out1[S]]');
    // beide Endknoten (b, c) → Ergebnis vereint
    expect(out.result.split('\n\n').sort()).toEqual(['out2[out1[S]]', 'out3[out1[S]]']);
  });

  test('Zusammenführung: D bekommt die vereinten Ausgaben von B und C', async () => {
    const graph = {
      nodes: [agentNode('a', 1), agentNode('b', 2), agentNode('c', 3), agentNode('d', 4)],
      edges: [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')],
    };
    const out = await flowEngine.executeFlow({
      graph,
      userId: 7,
      initialInput: 'S',
      deps: { runAgent: fakeRunAgent() },
    });
    // d's Eingabe = B-Ausgabe + "\n\n" + C-Ausgabe
    expect(out.nodeOutputs.d).toContain('out2[out1[S]]');
    expect(out.nodeOutputs.d).toContain('out3[out1[S]]');
    expect(out.result).toBe(out.nodeOutputs.d);
  });
});

describe('executeFlow — Fehler', () => {
  test('Knoten-Fehler wirft (mit Knoten-ID)', async () => {
    const graph = { nodes: [agentNode('a', 1)], edges: [] };
    await expect(
      flowEngine.executeFlow({
        graph,
        userId: 7,
        deps: { runAgent: fakeRunAgent({ 1: { error: 'Modell kaputt' } }) },
      })
    ).rejects.toThrow(/Knoten "a": Modell kaputt/);
  });

  test('zwei parallele fehlerhafte Zweige → rejectet ohne Hänger', async () => {
    const graph = {
      nodes: [agentNode('a', 1), agentNode('b', 2), agentNode('c', 3)],
      edges: [edge('a', 'b'), edge('a', 'c')],
    };
    await expect(
      flowEngine.executeFlow({
        graph,
        userId: 7,
        deps: { runAgent: fakeRunAgent({ 2: { error: 'B kaputt' }, 3: { error: 'C kaputt' } }) },
      })
    ).rejects.toThrow(/Knoten "[bc]":/);
  });
});
