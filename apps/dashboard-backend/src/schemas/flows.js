/**
 * Zod-Schemas für Flüsse (Plan 010, Schritt 4).
 *
 * Der Graph wird hier nur auf seine FORM geprüft (Knoten/Kanten). Die tiefere
 * Gültigkeit (DAG, existierende Referenzen, eigene Agenten) prüft die
 * Fluss-Engine beim Lauf (flowEngine.validateGraph) und wirft dort klare
 * ValidationError.
 */

const { z } = require('zod');

// React-Flow-Knoten tragen Zusatzfelder (position, width, …) — durchlassen.
const FlowNode = z
  .object({
    id: z.string().trim().min(1).max(100),
    type: z.enum(['agent', 'condition']),
    data: z.record(z.any()).default({}),
  })
  .passthrough();

const FlowEdge = z
  .object({
    id: z.string().trim().min(1).max(100),
    source: z.string().trim().min(1).max(100),
    target: z.string().trim().min(1).max(100),
    sourceHandle: z.string().max(50).nullish(),
  })
  .passthrough();

// Gesamtgröße des Graphen deckeln — `node.data` ist offen (React-Flow-Felder),
// daher greift die Feld-Validierung nicht; ein Byte-Limit verhindert, dass ein
// Fluss über data-Blobs unbegrenzt wächst.
const MAX_GRAPH_BYTES = 256 * 1024;

const FlowGraph = z
  .object({
    nodes: z.array(FlowNode).max(100).default([]),
    edges: z.array(FlowEdge).max(300).default([]),
  })
  .strip()
  .refine(g => JSON.stringify(g).length <= MAX_GRAPH_BYTES, {
    message: `Graph zu groß (max. ${Math.round(MAX_GRAPH_BYTES / 1024)} KiB).`,
  });

const FlowIdParam = z.object({ id: z.coerce.number().int().positive() }).strict();

const CreateFlowBody = z
  .object({
    name: z.string().trim().min(1, 'Name darf nicht leer sein').max(120),
    description: z.string().max(2000).default(''),
    graph: FlowGraph.default({ nodes: [], edges: [] }),
  })
  .strict();

const UpdateFlowBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    graph: FlowGraph.optional(),
  })
  .strict()
  .refine(obj => Object.keys(obj).length > 0, { message: 'Keine Felder zum Aktualisieren' });

const RunFlowBody = z.object({ input: z.string().max(20000).default('') }).strict();

module.exports = {
  FlowNode,
  FlowEdge,
  FlowGraph,
  FlowIdParam,
  CreateFlowBody,
  UpdateFlowBody,
  RunFlowBody,
};
