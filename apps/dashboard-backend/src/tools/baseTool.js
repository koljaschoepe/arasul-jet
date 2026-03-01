/**
 * Base Tool Class
 * Abstract base for all LLM-callable tools
 */

class BaseTool {
  constructor() {
    if (this.constructor === BaseTool) {
      throw new Error('BaseTool is abstract and cannot be instantiated directly');
    }
  }

  /**
   * Tool name (used in LLM prompts)
   * @returns {string}
   */
  get name() {
    throw new Error('Tool must implement name getter');
  }

  /**
   * Tool description for LLM
   * @returns {string}
   */
  get description() {
    throw new Error('Tool must implement description getter');
  }

  /**
   * Parameters schema for the tool
   * @returns {Object}
   */
  get parameters() {
    return {};
  }

  /**
   * Execute the tool
   * @param {Object} params - Tool parameters
   * @param {Object} context - Execution context (botId, chatId, userId)
   * @returns {Promise<string>} Tool output
   */
  async execute(params, context) {
    throw new Error('Tool must implement execute method');
  }

  /**
   * Check if tool is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return true;
  }

  /**
   * Format tool for LLM system prompt
   * @returns {string}
   */
  toPromptDescription() {
    let desc = `- ${this.name}: ${this.description}`;
    const params = this.parameters;
    if (Object.keys(params).length > 0) {
      const paramList = Object.entries(params)
        .map(([key, info]) => `${key}${info.required ? '' : '?'}: ${info.description}`)
        .join(', ');
      desc += ` (Parameter: ${paramList})`;
    }
    return desc;
  }
}

module.exports = BaseTool;
