/**
 * Datentabellen Tool
 * Query user-defined data tables via natural language
 */

const BaseTool = require('./baseTool');
const logger = require('../utils/logger');
const database = require('../database');

class DatentabellenTool extends BaseTool {
  get name() {
    return 'query_data';
  }

  get description() {
    return 'Daten aus benutzerdefinierten Tabellen abfragen mittels natürlicher Sprache';
  }

  get parameters() {
    return {
      query: {
        description: 'Natürlichsprachliche Anfrage, z.B. "Zeige alle Kunden aus Berlin"',
        required: true,
        type: 'string',
      },
      table: {
        description: 'Tabellenname (optional, bei Mehrdeutigkeit)',
        required: false,
        type: 'string',
      },
    };
  }

  async execute(params = {}) {
    const { query, table } = params;

    if (!query) {
      return 'Fehler: Bitte eine Abfrage angeben.';
    }

    try {
      // List available tables if no specific table given
      const tablesResult = await database.query(
        `SELECT id, name, description FROM custom_tables ORDER BY name`
      );

      if (tablesResult.rows.length === 0) {
        return 'Keine Datentabellen vorhanden. Erstelle zuerst eine Tabelle im Dashboard.';
      }

      // Find target table
      let targetTable;
      if (table) {
        targetTable = tablesResult.rows.find(t => t.name.toLowerCase() === table.toLowerCase());
        if (!targetTable) {
          const names = tablesResult.rows.map(t => t.name).join(', ');
          return `Tabelle "${table}" nicht gefunden. Verfügbare Tabellen: ${names}`;
        }
      } else if (tablesResult.rows.length === 1) {
        targetTable = tablesResult.rows[0];
      } else {
        // List all tables for the user to choose
        const tableList = tablesResult.rows
          .map(t => `• ${t.name}${t.description ? ` - ${t.description}` : ''}`)
          .join('\n');
        return `📋 **Verfügbare Tabellen:**\n${tableList}\n\nBitte gib den Tabellennamen an.`;
      }

      // Get table columns
      const columnsResult = await database.query(
        `SELECT name, field_type, description FROM custom_table_fields
         WHERE table_id = $1 ORDER BY sort_order`,
        [targetTable.id]
      );

      // Get data (limited to 20 rows)
      const dataResult = await database.query(
        `SELECT data FROM custom_table_rows
         WHERE table_id = $1
         ORDER BY created_at DESC LIMIT 20`,
        [targetTable.id]
      );

      if (dataResult.rows.length === 0) {
        return `Tabelle "${targetTable.name}" ist leer.`;
      }

      // Format output
      const columns = columnsResult.rows.map(c => c.name);
      const lines = [`📊 **${targetTable.name}** (${dataResult.rows.length} Einträge)\n`];

      // Simple text table
      for (const row of dataResult.rows) {
        const data = row.data || {};
        const values = columns.map(col => `${col}: ${data[col] ?? '-'}`).join(' | ');
        lines.push(`• ${values}`);
      }

      if (dataResult.rows.length === 20) {
        lines.push('\n_...weitere Einträge im Dashboard_');
      }

      return lines.join('\n');
    } catch (error) {
      if (error.message.includes('does not exist')) {
        return 'Datentabellen-Feature ist nicht verfügbar.';
      }
      logger.error('Datentabellen query error:', error);
      return `Fehler bei der Datenabfrage: ${error.message}`;
    }
  }

  async isAvailable() {
    try {
      await database.query('SELECT 1 FROM custom_tables LIMIT 0');
      return true;
    } catch {
      return false;
    }
  }
}

module.exports = new DatentabellenTool();
