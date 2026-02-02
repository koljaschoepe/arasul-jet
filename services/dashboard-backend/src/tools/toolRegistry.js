/**
 * Tool Registry
 * Manages and provides access to all available LLM tools
 */

const logger = require('../utils/logger');

class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  /**
   * Register a tool
   * @param {BaseTool} tool - Tool instance
   */
  register(tool) {
    if (this.tools.has(tool.name)) {
      logger.warn(`Tool ${tool.name} is already registered, overwriting`);
    }
    this.tools.set(tool.name, tool);
    logger.debug(`Registered tool: ${tool.name}`);
  }

  /**
   * Get a tool by name
   * @param {string} name - Tool name
   * @returns {BaseTool|null}
   */
  get(name) {
    return this.tools.get(name) || null;
  }

  /**
   * Get all registered tools
   * @returns {BaseTool[]}
   */
  getAll() {
    return Array.from(this.tools.values());
  }

  /**
   * Get all available tools (checks availability)
   * @returns {Promise<BaseTool[]>}
   */
  async getAvailable() {
    const available = [];
    for (const tool of this.tools.values()) {
      try {
        if (await tool.isAvailable()) {
          available.push(tool);
        }
      } catch (error) {
        logger.warn(`Error checking availability of tool ${tool.name}:`, error.message);
      }
    }
    return available;
  }

  /**
   * Execute a tool by name
   * @param {string} name - Tool name
   * @param {Object} params - Tool parameters
   * @param {Object} context - Execution context
   * @returns {Promise<string>} Tool output
   */
  async execute(name, params = {}, context = {}) {
    const tool = this.get(name);
    if (!tool) {
      return `Fehler: Tool "${name}" nicht gefunden. Verfuegbare Tools: ${this.getToolNames().join(', ')}`;
    }

    try {
      const result = await tool.execute(params, context);
      logger.debug(`Tool ${name} executed successfully`);
      return result;
    } catch (error) {
      logger.error(`Error executing tool ${name}:`, error);
      return `Fehler bei ${name}: ${error.message}`;
    }
  }

  /**
   * Get tool names
   * @returns {string[]}
   */
  getToolNames() {
    return Array.from(this.tools.keys());
  }

  /**
   * Generate system prompt section for tools
   * @returns {Promise<string>}
   */
  async generateToolsPrompt() {
    const available = await this.getAvailable();
    if (available.length === 0) {
      return '';
    }

    const toolDescriptions = available
      .map(tool => tool.toPromptDescription())
      .join('\n');

    return `
Du hast Zugriff auf folgende System-Tools. Um ein Tool zu nutzen, antworte mit dem Format:
[TOOL: toolname param1=wert1 param2=wert2]

Verfuegbare Tools:
${toolDescriptions}

Wichtig:
- Nutze Tools nur wenn der Nutzer explizit nach System-Informationen fragt
- Zeige die Tool-Ausgabe formatiert an
- Bei Fehlern erklaere das Problem
`;
  }

  /**
   * Parse tool calls from LLM response
   * @param {string} response - LLM response text
   * @returns {Array<{name: string, params: Object}>}
   */
  parseToolCalls(response) {
    const toolCalls = [];
    const regex = /\[TOOL:\s*(\w+)([^\]]*)\]/gi;
    let match;

    while ((match = regex.exec(response)) !== null) {
      const name = match[1].toLowerCase();
      const paramsStr = match[2].trim();
      const params = {};

      // Parse key=value pairs
      const paramRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
      let paramMatch;
      while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
        const key = paramMatch[1];
        const value = paramMatch[2] || paramMatch[3] || paramMatch[4];
        params[key] = value;
      }

      toolCalls.push({ name, params });
    }

    return toolCalls;
  }

  /**
   * Process tool calls in a response and return results
   * @param {string} response - LLM response with potential tool calls
   * @param {Object} context - Execution context
   * @returns {Promise<{hasTools: boolean, results: Array, cleanResponse: string}>}
   */
  async processToolCalls(response, context = {}) {
    const toolCalls = this.parseToolCalls(response);

    if (toolCalls.length === 0) {
      return { hasTools: false, results: [], cleanResponse: response };
    }

    const results = [];
    for (const call of toolCalls) {
      const result = await this.execute(call.name, call.params, context);
      results.push({
        tool: call.name,
        params: call.params,
        result,
      });
    }

    // Remove tool call markers from response
    const cleanResponse = response.replace(/\[TOOL:[^\]]+\]/gi, '').trim();

    return { hasTools: true, results, cleanResponse };
  }
}

// Singleton instance
const registry = new ToolRegistry();

module.exports = registry;
