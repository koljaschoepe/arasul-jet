/**
 * Alerts Tool
 * Check and manage system alerts via Telegram
 */

const BaseTool = require('./baseTool');
const logger = require('../utils/logger');
const database = require('../database');

class AlertsTool extends BaseTool {
  get name() {
    return 'check_alerts';
  }

  get description() {
    return 'Unbestätigte System-Alerts anzeigen und verwalten';
  }

  get parameters() {
    return {
      action: {
        description: 'list (Standard), acknowledge, oder stats',
        required: false,
        type: 'string',
        enum: ['list', 'acknowledge', 'stats'],
      },
      alert_id: {
        description: 'Alert-ID zum Bestätigen (nur bei action=acknowledge)',
        required: false,
        type: 'string',
      },
    };
  }

  async execute(params = {}) {
    const action = (params.action || 'list').toLowerCase();

    try {
      switch (action) {
        case 'list':
          return await this.listAlerts();
        case 'acknowledge':
          return await this.acknowledgeAlert(params.alert_id);
        case 'stats':
          return await this.getStats();
        default:
          return await this.listAlerts();
      }
    } catch (error) {
      if (error.message.includes('does not exist')) {
        return 'Alert-System ist nicht verfügbar.';
      }
      logger.error('Alerts tool error:', error);
      return `Fehler: ${error.message}`;
    }
  }

  async listAlerts() {
    const result = await database.query(
      `SELECT id, alert_type, severity, message, metric_value, threshold_value, created_at
       FROM alert_history
       WHERE acknowledged_at IS NULL
       ORDER BY created_at DESC
       LIMIT 10`
    );

    if (result.rows.length === 0) {
      return '✅ Keine offenen Alerts.';
    }

    const severityIcon = {
      critical: '🔴',
      warning: '🟡',
      info: '🔵',
    };

    const lines = [`🚨 **${result.rows.length} offene Alerts:**\n`];
    for (const alert of result.rows) {
      const icon = severityIcon[alert.severity] || '⚪';
      const time = new Date(alert.created_at).toLocaleString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
      lines.push(`${icon} #${alert.id} [${alert.severity}] ${alert.alert_type}: ${alert.message}`);
      if (alert.metric_value != null) {
        lines.push(`   Wert: ${alert.metric_value} (Schwelle: ${alert.threshold_value})`);
      }
      lines.push(`   ${time}`);
    }

    lines.push('\n_Bestätigen: action=acknowledge alert_id=<ID>_');
    return lines.join('\n');
  }

  async acknowledgeAlert(alertId) {
    if (!alertId) {
      return 'Fehler: alert_id ist erforderlich zum Bestätigen.';
    }

    const result = await database.query(
      `UPDATE alert_history
       SET acknowledged_at = NOW(), acknowledged_by = 'telegram'
       WHERE id = $1 AND acknowledged_at IS NULL
       RETURNING id, alert_type`,
      [parseInt(alertId)]
    );

    if (result.rows.length === 0) {
      return `Alert #${alertId} nicht gefunden oder bereits bestätigt.`;
    }

    return `✅ Alert #${alertId} (${result.rows[0].alert_type}) bestätigt.`;
  }

  async getStats() {
    const result = await database.query(`
      SELECT
        COUNT(*) FILTER (WHERE acknowledged_at IS NULL) as open_count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
        COUNT(*) FILTER (WHERE severity = 'critical' AND acknowledged_at IS NULL) as critical_open,
        COUNT(*) FILTER (WHERE severity = 'warning' AND acknowledged_at IS NULL) as warning_open
      FROM alert_history
    `);

    const stats = result.rows[0];
    return [
      '📊 **Alert-Statistiken**\n',
      `🔓 Offen: ${stats.open_count}`,
      `🔴 Kritisch (offen): ${stats.critical_open}`,
      `🟡 Warnungen (offen): ${stats.warning_open}`,
      `📅 Letzte 24h: ${stats.last_24h}`,
    ].join('\n');
  }

  async isAvailable() {
    try {
      await database.query('SELECT 1 FROM alert_history LIMIT 0');
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = new AlertsTool();
