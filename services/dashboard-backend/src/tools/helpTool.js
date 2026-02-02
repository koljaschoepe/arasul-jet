/**
 * Help Tool
 * Provides information about available tools
 */

const BaseTool = require('./baseTool');

class HelpTool extends BaseTool {
  constructor(registry) {
    super();
    this.registry = registry;
  }

  get name() {
    return 'help';
  }

  get description() {
    return 'Zeigt alle verfuegbaren Tools und deren Nutzung';
  }

  get parameters() {
    return {
      tool: {
        description: 'Optional: Name eines Tools fuer Details',
        required: false,
      },
    };
  }

  async execute(params = {}) {
    const toolName = params.tool;

    if (toolName) {
      return this.getToolHelp(toolName);
    }

    return this.getAllToolsHelp();
  }

  getToolHelp(toolName) {
    const tool = this.registry.get(toolName.toLowerCase());

    if (!tool) {
      return `❌ Tool "${toolName}" nicht gefunden.\n\nVerfuegbare Tools: ${this.registry.getToolNames().join(', ')}`;
    }

    const lines = [
      `🔧 **${tool.name}**`,
      '',
      tool.description,
      '',
    ];

    const params = tool.parameters;
    if (Object.keys(params).length > 0) {
      lines.push('**Parameter:**');
      for (const [key, info] of Object.entries(params)) {
        const required = info.required ? '(erforderlich)' : '(optional)';
        lines.push(`- \`${key}\` ${required}: ${info.description}`);
      }
      lines.push('');
    }

    lines.push('**Beispiel:**');
    lines.push(`\`[TOOL: ${tool.name}]\``);

    return lines.join('\n');
  }

  getAllToolsHelp() {
    const tools = this.registry.getAll().filter((t) => t.name !== 'help');

    const lines = [
      '🛠️ **Verfuegbare System-Tools**',
      '',
      'Du kannst mich nach folgenden Informationen fragen:',
      '',
    ];

    for (const tool of tools) {
      lines.push(`• **${tool.name}** - ${tool.description}`);
    }

    lines.push('');
    lines.push('Beispiele:');
    lines.push('- "Wie ist der System-Status?"');
    lines.push('- "Zeige mir die laufenden Services"');
    lines.push('- "Zeige die Logs vom LLM-Service"');
    lines.push('- "Welche Workflows sind aktiv?"');

    return lines.join('\n');
  }
}

// Export factory function since it needs registry
module.exports = (registry) => new HelpTool(registry);
