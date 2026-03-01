/**
 * Tools Module
 * Initializes and exports the tool registry with all available tools
 */

const registry = require('./toolRegistry');
const statusTool = require('./statusTool');
const servicesTool = require('./servicesTool');
const logsTool = require('./logsTool');
const workflowsTool = require('./workflowsTool');
const createHelpTool = require('./helpTool');

// Register all tools
registry.register(statusTool);
registry.register(servicesTool);
registry.register(logsTool);
registry.register(workflowsTool);

// Help tool needs registry reference
registry.register(createHelpTool(registry));

module.exports = registry;
