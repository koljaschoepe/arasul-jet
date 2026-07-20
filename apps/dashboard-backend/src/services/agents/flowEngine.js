/**
 * Fluss-Engine (Plan 010, Schritt 4)
 *
 * Führt einen Fluss-Graphen aus (JSON aus Knoten + Kanten):
 *   - Knoten `agent`     → führt einen Flow-Agenten aus (runFlowAgent), Eingabe
 *                          = zusammengeführte Ausgaben der aktiven Vorgänger
 *                          (bzw. die Fluss-Eingabe bei Start-Knoten).
 *   - Knoten `condition` → wertet eine einfache, SICHERE Bedingung auf dem
 *                          Eingabetext aus (contains / not_contains / equals)
 *                          und aktiviert nur die passenden Ausgangskanten
 *                          (sourceHandle 'true'/'false'). Kein eval.
 *
 * Verzweigung & Parallelität: der Graph wird als DAG ausgeführt. Jeder Knoten
 * ist eine memoisierte Promise, die auf seine Vorgänger wartet — unabhängige
 * Zweige laufen dadurch logisch parallel. Tote Zweige (von einer nicht
 * erfüllten Bedingung) werden übersprungen und reißen ihre Nachfolger nur dann
 * mit, wenn ALLE ihre Eingänge tot sind.
 *
 * Ressourcen-Sicherheit: LOKALE Modell-Aufrufe sind ohnehin durch das GPU-Gate
 * serialisiert (providerRegistry → gpuGate). Cloud-Provider sind das NICHT —
 * deshalb begrenzt zusätzlich ein Concurrency-Limiter die Zahl gleichzeitig
 * laufender Agenten-Knoten (AGENT_FLOW_CONCURRENCY), damit ein einzelner Fluss
 * nicht bis zu MAX_NODES Cloud-Aufrufe parallel auslöst.
 *
 * SSE: jedes Event trägt die Knoten-ID (`node`), damit mehrere Zweige in einen
 * Lauf-Stream gemultiplext werden können.
 */

const { ValidationError, ServiceUnavailableError } = require('../../utils/errors');
const runFlowAgent = require('./runFlowAgent');

const MAX_NODES = 100;
const FLOW_CONCURRENCY = parseInt(process.env.AGENT_FLOW_CONCURRENCY || '4', 10);

/**
 * Einfacher zählender Concurrency-Limiter: höchstens `max` gleichzeitig.
 * @param {number} max
 * @returns {(fn:()=>Promise<any>)=>Promise<any>}
 */
function createLimiter(max) {
  let active = 0;
  const queue = [];
  const pump = () => {
    if (active >= max || queue.length === 0) {
      return;
    }
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        pump();
      });
  };
  return fn =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      pump();
    });
}

/**
 * Graph strukturell validieren: eindeutige IDs, existierende Kanten-Enden,
 * Azyklizität (DAG), und dass jeder agent-Knoten eine agentId nennt. Wirft
 * ValidationError bei Verstoß. Prüft NICHT die Agenten-Eigentümerschaft — das
 * macht der Aufrufer vorab (ownedAgentIds).
 *
 * @param {{nodes:Array, edges:Array}} graph
 * @returns {{nodesById:Map, incoming:Map, outgoing:Map, agentIds:number[]}}
 */
function validateGraph(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];

  if (nodes.length === 0) {
    throw new ValidationError('Fluss hat keine Knoten.');
  }
  if (nodes.length > MAX_NODES) {
    throw new ValidationError(`Fluss hat zu viele Knoten (max. ${MAX_NODES}).`);
  }

  const nodesById = new Map();
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || !n.id) {
      throw new ValidationError('Jeder Knoten braucht eine id.');
    }
    if (nodesById.has(n.id)) {
      throw new ValidationError(`Doppelte Knoten-id: ${n.id}`);
    }
    nodesById.set(n.id, n);
  }

  const incoming = new Map();
  const outgoing = new Map();
  for (const id of nodesById.keys()) {
    incoming.set(id, []);
    outgoing.set(id, []);
  }
  for (const e of edges) {
    if (!nodesById.has(e.source) || !nodesById.has(e.target)) {
      throw new ValidationError(`Kante verweist auf unbekannten Knoten: ${e.source}→${e.target}`);
    }
    outgoing.get(e.source).push(e);
    incoming.get(e.target).push(e);
  }

  // Azyklizität via Kahn-Topologie.
  const indeg = new Map();
  for (const id of nodesById.keys()) {
    indeg.set(id, incoming.get(id).length);
  }
  const queue = [...nodesById.keys()].filter(id => indeg.get(id) === 0);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift();
    visited++;
    for (const e of outgoing.get(id)) {
      indeg.set(e.target, indeg.get(e.target) - 1);
      if (indeg.get(e.target) === 0) {
        queue.push(e.target);
      }
    }
  }
  if (visited !== nodesById.size) {
    throw new ValidationError('Fluss enthält einen Zyklus — nur azyklische Graphen sind erlaubt.');
  }

  const agentIds = [];
  for (const n of nodesById.values()) {
    if (n.type === 'agent') {
      const aid = Number(n.data?.agentId);
      if (!Number.isInteger(aid) || aid <= 0) {
        throw new ValidationError(`Agent-Knoten "${n.id}" nennt keine gültige agentId.`);
      }
      agentIds.push(aid);
    } else if (n.type === 'condition') {
      const mode = n.data?.mode;
      if (!['contains', 'not_contains', 'equals'].includes(mode)) {
        throw new ValidationError(`Bedingungs-Knoten "${n.id}" hat einen ungültigen mode.`);
      }
    } else {
      throw new ValidationError(`Unbekannter Knotentyp "${n.type}" (${n.id}).`);
    }
  }

  return { nodesById, incoming, outgoing, agentIds };
}

// Sichere Bedingungs-Auswertung (kein eval).
function evalCondition(data, input) {
  const text = String(input || '').toLowerCase();
  const value = String(data?.value || '').toLowerCase();
  switch (data?.mode) {
    case 'contains':
      return text.includes(value);
    case 'not_contains':
      return !text.includes(value);
    case 'equals':
      return text.trim() === value.trim();
    default:
      return false;
  }
}

// Ist die Kante lebendig? Bei einem Bedingungs-Vorgänger muss der Handle passen.
function edgeIsLive(edge, predResult) {
  if (!predResult.active) {
    return false;
  }
  if (predResult.handle) {
    // 'true'/'false'-Handle muss zum Ergebnis passen.
    return (edge.sourceHandle || 'true') === predResult.handle;
  }
  return true;
}

/**
 * Einen Fluss-Graphen ausführen.
 *
 * @param {object} args
 * @param {{nodes:Array,edges:Array}} args.graph
 * @param {number} args.userId
 * @param {string} [args.initialInput]
 * @param {(evt:object)=>void} [args.onEvent] - Events tragen `node` (Knoten-ID)
 * @param {object} [args.deps] - { runAgent } injizierbar für Tests
 * @returns {Promise<{result:string, nodeOutputs:Object}>}
 */
async function executeFlow({ graph, userId, initialInput = '', onEvent, deps = {} } = {}) {
  const runAgent = deps.runAgent || runFlowAgent.runById;
  const emit = evt => {
    if (typeof onEvent === 'function') {
      try {
        onEvent(evt);
      } catch {
        /* Emitter-Fehler dürfen den Lauf nie kippen */
      }
    }
  };

  const { nodesById, incoming, outgoing } = validateGraph(graph);
  const memo = new Map();
  const limit = createLimiter(FLOW_CONCURRENCY);

  const runNode = nodeId => {
    if (memo.has(nodeId)) {
      return memo.get(nodeId);
    }
    const p = (async () => {
      const inEdges = incoming.get(nodeId) || [];
      let input = initialInput;
      let active = true;

      if (inEdges.length > 0) {
        const preds = await Promise.all(
          inEdges.map(async e => ({ e, res: await runNode(e.source) }))
        );
        const live = preds.filter(({ e, res }) => edgeIsLive(e, res));
        active = live.length > 0;
        input = live.map(({ res }) => res.output).join('\n\n');
      }

      const node = nodesById.get(nodeId);

      if (!active) {
        emit({ type: 'node_skipped', node: nodeId });
        return { output: '', active: false };
      }

      if (node.type === 'condition') {
        const pass = evalCondition(node.data, input);
        emit({ type: 'node_condition', node: nodeId, result: pass ? 'true' : 'false' });
        return { output: input, active: true, handle: pass ? 'true' : 'false' };
      }

      // agent-Knoten — Ausführung durch den Concurrency-Limiter gedeckelt.
      emit({ type: 'node_start', node: nodeId, agentId: node.data.agentId });
      const { result, error } = await limit(() =>
        runAgent({
          agentId: Number(node.data.agentId),
          userId,
          trigger: 'flow',
          userInput: input,
          // Agent-interne Events (status/tool/text/done) mit Knoten-ID anreichern.
          onEvent: evt => emit({ ...evt, node: nodeId }),
        })
      );
      if (error) {
        emit({ type: 'node_error', node: nodeId, message: error });
        // Ein Knoten-Fehler beendet den Fluss (deterministisch, klar meldbar).
        throw new ServiceUnavailableError(`Knoten "${nodeId}": ${error}`);
      }
      emit({ type: 'node_done', node: nodeId });
      return { output: result || '', active: true };
    })();
    memo.set(nodeId, p);
    return p;
  };

  // Alle Knoten anstoßen; unabhängige Zweige laufen dadurch parallel.
  const results = await Promise.all(
    [...nodesById.keys()].map(id => runNode(id).then(r => [id, r]))
  );

  // Endergebnis: Ausgaben der aktiven End-Knoten (keine lebendigen Ausgangskanten).
  const nodeOutputs = {};
  const terminalOutputs = [];
  for (const [id, res] of results) {
    nodeOutputs[id] = res.active ? res.output : null;
    if (!res.active) {
      continue;
    }
    const outs = outgoing.get(id) || [];
    const hasLiveOut = outs.some(e => edgeIsLive(e, res));
    if (!hasLiveOut && res.output) {
      terminalOutputs.push(res.output);
    }
  }

  return { result: terminalOutputs.join('\n\n'), nodeOutputs };
}

module.exports = { executeFlow, validateGraph, _internals: { evalCondition, edgeIsLive } };
