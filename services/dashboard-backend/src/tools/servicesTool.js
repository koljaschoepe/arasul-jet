/**
 * Services Tool
 * Provides Docker container status and management
 */

const BaseTool = require('./baseTool');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

class ServicesTool extends BaseTool {
  get name() {
    return 'services';
  }

  get description() {
    return 'Zeigt Docker-Container Status und Gesundheit';
  }

  get parameters() {
    return {
      service: {
        description: 'Optional: Name eines spezifischen Services',
        required: false,
      },
    };
  }

  async execute(params = {}) {
    const serviceName = params.service;

    try {
      if (serviceName) {
        return await this.getServiceStatus(serviceName);
      }
      return await this.getAllServices();
    } catch (error) {
      return `Fehler beim Abrufen der Services: ${error.message}`;
    }
  }

  async getAllServices() {
    try {
      const { stdout } = await execAsync(
        'docker ps --format "{{.Names}}|{{.Status}}|{{.State}}" 2>/dev/null',
        { timeout: 10000 }
      );

      if (!stdout.trim()) {
        return '❌ Keine Container gefunden';
      }

      const lines = stdout.trim().split('\n');
      const services = lines.map((line) => {
        const [name, status, state] = line.split('|');
        const icon = state === 'running' ? '✅' : '❌';
        const healthMatch = status.match(/\((healthy|unhealthy)\)/);
        const health = healthMatch ? (healthMatch[1] === 'healthy' ? '💚' : '💔') : '';
        return `${icon} ${name} ${health}`;
      });

      const running = services.filter((s) => s.startsWith('✅')).length;
      const total = services.length;

      return [
        '🐳 **Docker Services**',
        '',
        `Laufend: ${running}/${total}`,
        '',
        ...services,
      ].join('\n');
    } catch (error) {
      // Fallback: Try docker compose ps
      try {
        const { stdout } = await execAsync(
          'docker compose ps --format "{{.Name}}|{{.Status}}|{{.Health}}" 2>/dev/null',
          { timeout: 10000, cwd: '/app' }
        );
        return this.parseComposeOutput(stdout);
      } catch {
        return `Fehler: ${error.message}`;
      }
    }
  }

  async getServiceStatus(serviceName) {
    try {
      const { stdout } = await execAsync(
        `docker ps -a --filter "name=${serviceName}" --format "{{.Names}}|{{.Status}}|{{.State}}|{{.Ports}}" 2>/dev/null`,
        { timeout: 5000 }
      );

      if (!stdout.trim()) {
        return `❌ Service "${serviceName}" nicht gefunden`;
      }

      const [name, status, state, ports] = stdout.trim().split('|');
      const icon = state === 'running' ? '✅' : '❌';

      const lines = [
        `${icon} **${name}**`,
        '',
        `Status: ${status}`,
        `State: ${state}`,
      ];

      if (ports) {
        lines.push(`Ports: ${ports}`);
      }

      // Get container stats
      try {
        const { stdout: stats } = await execAsync(
          `docker stats ${name} --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}" 2>/dev/null`,
          { timeout: 5000 }
        );
        if (stats.trim()) {
          const [cpu, mem] = stats.trim().split('|');
          lines.push('', `CPU: ${cpu}`, `RAM: ${mem}`);
        }
      } catch {
        // Stats not available
      }

      return lines.join('\n');
    } catch (error) {
      return `Fehler bei Service "${serviceName}": ${error.message}`;
    }
  }

  parseComposeOutput(stdout) {
    if (!stdout.trim()) {
      return '❌ Keine Services gefunden';
    }

    const lines = stdout.trim().split('\n');
    const services = lines.map((line) => {
      const parts = line.split('|');
      const name = parts[0] || 'unknown';
      const status = parts[1] || '';
      const health = parts[2] || '';

      const isRunning = status.toLowerCase().includes('up');
      const icon = isRunning ? '✅' : '❌';
      const healthIcon = health === 'healthy' ? '💚' : health === 'unhealthy' ? '💔' : '';

      return `${icon} ${name} ${healthIcon}`;
    });

    return ['🐳 **Docker Services**', '', ...services].join('\n');
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

module.exports = new ServicesTool();
