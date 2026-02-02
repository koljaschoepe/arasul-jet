/**
 * Logs Tool
 * Retrieves and displays service logs
 */

const BaseTool = require('./baseTool');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

// Whitelist of allowed service names (security)
const ALLOWED_SERVICES = [
  'dashboard-backend',
  'dashboard-frontend',
  'llm-service',
  'embedding-service',
  'postgres-db',
  'metrics-collector',
  'document-indexer',
  'n8n',
  'minio',
  'qdrant',
  'reverse-proxy',
  'backup-service',
  'self-healing-agent',
  'loki',
  'promtail',
];

class LogsTool extends BaseTool {
  get name() {
    return 'logs';
  }

  get description() {
    return 'Zeigt die letzten Log-Eintraege eines Services';
  }

  get parameters() {
    return {
      service: {
        description: 'Name des Services (z.B. llm-service, dashboard-backend)',
        required: true,
      },
      lines: {
        description: 'Anzahl der Zeilen (Standard: 20, Max: 50)',
        required: false,
      },
      errors: {
        description: 'Nur Fehler anzeigen (true/false)',
        required: false,
      },
    };
  }

  async execute(params = {}) {
    const serviceName = params.service;
    const lines = Math.min(parseInt(params.lines) || 20, 50);
    const errorsOnly = params.errors === 'true' || params.errors === true;

    if (!serviceName) {
      return `Bitte gib einen Service-Namen an. Verfuegbare Services:\n${ALLOWED_SERVICES.join(', ')}`;
    }

    // Security: Validate service name
    const sanitizedName = this.sanitizeServiceName(serviceName);
    if (!sanitizedName) {
      return `Ungueltiger Service-Name. Verfuegbare Services:\n${ALLOWED_SERVICES.join(', ')}`;
    }

    try {
      let command = `docker logs ${sanitizedName} --tail ${lines} 2>&1`;

      if (errorsOnly) {
        command += ' | grep -iE "(error|exception|fail|critical)" || echo "Keine Fehler gefunden"';
      }

      const { stdout } = await execAsync(command, { timeout: 10000 });

      if (!stdout.trim()) {
        return `📋 Keine Logs fuer "${sanitizedName}" gefunden`;
      }

      // Truncate if too long for Telegram
      let output = stdout.trim();
      if (output.length > 3500) {
        output = output.substring(0, 3500) + '\n... (gekuerzt)';
      }

      const header = errorsOnly
        ? `📋 **Fehler-Logs: ${sanitizedName}** (${lines} Zeilen)`
        : `📋 **Logs: ${sanitizedName}** (${lines} Zeilen)`;

      return `${header}\n\n\`\`\`\n${output}\n\`\`\``;
    } catch (error) {
      if (error.message.includes('No such container')) {
        return `❌ Container "${sanitizedName}" nicht gefunden`;
      }
      return `Fehler beim Abrufen der Logs: ${error.message}`;
    }
  }

  sanitizeServiceName(name) {
    // Remove any special characters
    const sanitized = name.toLowerCase().replace(/[^a-z0-9-_]/g, '');

    // Check against whitelist
    if (ALLOWED_SERVICES.includes(sanitized)) {
      return sanitized;
    }

    // Try partial match
    const match = ALLOWED_SERVICES.find(
      (s) => s.includes(sanitized) || sanitized.includes(s.replace('-', ''))
    );

    return match || null;
  }

  async isAvailable() {
    try {
      await execAsync('docker --version', { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = new LogsTool();
