/**
 * Flow-Agent-Tool-Registry (Plan 010, Schritt 3).
 *
 * Baut pro Lauf eine ToolRegistry-Instanz mit genau den Tools, die der Agent
 * deklariert hat — parallel zu, aber getrennt von den Datei-Agenten-Tools
 * (Plan 008). Externe Tools (Netz) werden NUR aufgenommen, wenn der Agent
 * `allow_external` hat; ein rein lokaler Agent erhält so gar kein Netz-Tool.
 */

const globalRegistry = require('../../tools/toolRegistry');
const ToolRegistry = globalRegistry.constructor;
const logger = require('../../utils/logger');

const RagTool = require('./flowTools/ragTool');
const MinioTool = require('./flowTools/minioTool');
const N8nTool = require('./flowTools/n8nTool');
const WebTool = require('./flowTools/webTool');

// Deklarierbare Tools → Klasse.
const TOOL_CLASSES = {
  rag: RagTool,
  minio: MinioTool,
  n8n: N8nTool,
  web: WebTool,
};

// Tools, die das lokale Netz verlassen → nur bei allow_external.
const EXTERNAL_TOOLS = new Set(['web']);

// Allowlist für die Validierung (Service/Route).
const VALID_FLOW_TOOLS = Object.keys(TOOL_CLASSES);

/**
 * Per-Run-Registry aus den deklarierten Tool-Namen bauen.
 * @param {string[]} toolNames
 * @param {{allowExternal?:boolean}} opts
 * @returns {InstanceType<typeof ToolRegistry>}
 */
function buildRegistry(toolNames, { allowExternal = false } = {}) {
  const registry = new ToolRegistry();
  for (const name of toolNames || []) {
    const ToolClass = TOOL_CLASSES[name];
    if (!ToolClass) {
      logger.warn(`Flow-Agent deklariert unbekanntes Tool "${name}" — übersprungen`);
      continue;
    }
    if (EXTERNAL_TOOLS.has(name) && !allowExternal) {
      // Rein lokaler Agent: externes Tool bewusst NICHT aufnehmen.
      logger.info(`Externes Tool "${name}" ohne allow_external ausgelassen`);
      continue;
    }
    registry.register(new ToolClass());
  }
  return registry;
}

module.exports = { buildRegistry, VALID_FLOW_TOOLS, EXTERNAL_TOOLS, TOOL_CLASSES };
