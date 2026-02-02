/**
 * Status Tool
 * Provides system metrics: CPU, RAM, GPU, Temperature, Disk
 */

const BaseTool = require('./baseTool');
const axios = require('axios');

const METRICS_URL = process.env.METRICS_URL || 'http://metrics-collector:9100';

class StatusTool extends BaseTool {
  get name() {
    return 'status';
  }

  get description() {
    return 'Zeigt System-Metriken (CPU, RAM, GPU, Temperatur, Speicher)';
  }

  get parameters() {
    return {
      component: {
        description: 'Optional: cpu, ram, gpu, temp, disk oder all (Standard)',
        required: false,
      },
    };
  }

  async execute(params = {}) {
    const component = (params.component || 'all').toLowerCase();

    try {
      const response = await axios.get(`${METRICS_URL}/metrics/live`, {
        timeout: 5000,
      });
      const metrics = response.data;

      if (component === 'all') {
        return this.formatAllMetrics(metrics);
      }

      switch (component) {
        case 'cpu':
          return `🖥️ CPU: ${metrics.cpu?.toFixed(1) || 'N/A'}%`;
        case 'ram':
          return `💾 RAM: ${metrics.ram?.toFixed(1) || 'N/A'}%`;
        case 'gpu':
          return `🎮 GPU: ${metrics.gpu?.toFixed(1) || 'N/A'}%`;
        case 'temp':
        case 'temperature':
          return `🌡️ Temperatur: ${metrics.temperature?.toFixed(0) || 'N/A'}°C`;
        case 'disk':
        case 'storage':
          return this.formatDisk(metrics.disk);
        default:
          return this.formatAllMetrics(metrics);
      }
    } catch (error) {
      return `Fehler beim Abrufen der System-Metriken: ${error.message}`;
    }
  }

  formatAllMetrics(metrics) {
    const lines = [
      '📊 **System Status**',
      '',
      `🖥️ CPU: ${metrics.cpu?.toFixed(1) || 'N/A'}%`,
      `💾 RAM: ${metrics.ram?.toFixed(1) || 'N/A'}%`,
      `🎮 GPU: ${metrics.gpu?.toFixed(1) || 'N/A'}%`,
      `🌡️ Temperatur: ${metrics.temperature?.toFixed(0) || 'N/A'}°C`,
    ];

    if (metrics.disk) {
      lines.push('', this.formatDisk(metrics.disk));
    }

    return lines.join('\n');
  }

  formatDisk(disk) {
    if (!disk) return '💿 Speicher: N/A';

    const usedGB = (disk.used / 1024 / 1024 / 1024).toFixed(0);
    const totalGB = ((disk.used + disk.free) / 1024 / 1024 / 1024).toFixed(0);
    const percent = disk.percent?.toFixed(0) || 'N/A';

    return `💿 Speicher: ${usedGB}/${totalGB} GB (${percent}%)`;
  }

  async isAvailable() {
    try {
      await axios.get(`${METRICS_URL}/health`, { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = new StatusTool();
