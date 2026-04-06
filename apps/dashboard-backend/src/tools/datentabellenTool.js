/**
 * Datentabellen Tool
 * Query user-defined data tables via natural language
 */

const BaseTool = require('./baseTool');
const logger = require('../utils/logger');
const dataDb = require('../dataDatabase');
const { escapeTableName, escapeIdentifier } = require('../utils/sqlIdentifier');

class DatentabellenTool extends BaseTool {
  get name() {
    return 'query_data';
  }

  get description() {
    return 'Daten aus benutzerdefinierten Tabellen abfragen. Nutze diese Funktion um Tabelleneinträge zu lesen und anzuzeigen.';
  }

  get parameters() {
    return {
      query: {
        description: 'Natürlichsprachliche Anfrage, z.B. "Zeige alle Kunden aus Berlin"',
        required: true,
        type: 'string',
      },
      table: {
        description: 'Tabellenname oder Slug (optional, bei Mehrdeutigkeit)',
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
      // List available tables
      const tablesResult = await dataDb.query(
        'SELECT id, name, slug, description FROM dt_tables ORDER BY name'
      );

      if (tablesResult.rows.length === 0) {
        return 'Keine Datentabellen vorhanden. Erstelle zuerst eine Tabelle im Dashboard unter "Daten".';
      }

      // Find target table
      let targetTable;
      if (table) {
        targetTable = tablesResult.rows.find(
          t => t.name.toLowerCase() === table.toLowerCase() || t.slug === table.toLowerCase()
        );
        if (!targetTable) {
          const names = tablesResult.rows.map(t => `${t.name} (${t.slug})`).join(', ');
          return `Tabelle "${table}" nicht gefunden. Verfügbare Tabellen: ${names}`;
        }
      } else if (tablesResult.rows.length === 1) {
        targetTable = tablesResult.rows[0];
      } else {
        const tableList = tablesResult.rows
          .map(t => `- ${t.name} (${t.slug})${t.description ? `: ${t.description}` : ''}`)
          .join('\n');
        return `**Verfügbare Tabellen:**\n${tableList}\n\nBitte gib den Tabellennamen an, z.B. "Zeige alle Einträge aus Kunden".`;
      }

      // Get table columns
      const fieldsResult = await dataDb.query(
        'SELECT slug, name, field_type FROM dt_fields WHERE table_id = $1 ORDER BY field_order',
        [targetTable.id]
      );
      const fields = fieldsResult.rows;

      // QUERY-FIX: Extract keywords from query and build basic WHERE clause
      // This enables the LLM to actually filter data instead of always returning TOP 20
      const textFields = fields.filter(f =>
        ['text', 'textarea', 'email', 'url', 'phone', 'select'].includes(f.field_type)
      );
      const numberFields = fields.filter(f => ['number', 'currency'].includes(f.field_type));
      const queryLower = query.toLowerCase();

      // Extract potential filter terms (words >2 chars, not common German stop words)
      const stopWords = new Set([
        'und',
        'oder',
        'die',
        'der',
        'das',
        'aus',
        'von',
        'mit',
        'für',
        'ist',
        'sind',
        'alle',
        'zeige',
        'zeig',
        'mir',
        'bitte',
        'einträge',
        'daten',
        'tabelle',
        'show',
        'all',
        'the',
        'from',
      ]);
      const searchTerms = queryLower.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

      let whereClause = '';
      const queryParams = [];
      if (searchTerms.length > 0 && textFields.length > 0) {
        const conditions = [];
        for (const term of searchTerms.slice(0, 3)) {
          // Max 3 terms
          const fieldConditions = textFields.map(f => {
            queryParams.push(`%${term}%`);
            return `${escapeIdentifier(f.slug)}::text ILIKE $${queryParams.length}`;
          });
          conditions.push(`(${fieldConditions.join(' OR ')})`);
        }
        whereClause = `WHERE ${conditions.join(' AND ')}`;
      }

      // Get data (limited to 20 rows, filtered if possible)
      const dataResult = await dataDb.query(
        `SELECT * FROM ${escapeTableName(targetTable.slug)} ${whereClause} ORDER BY _created_at DESC LIMIT 20`,
        queryParams
      );

      if (dataResult.rows.length === 0) {
        return `Tabelle "${targetTable.name}" ist leer.`;
      }

      // Format output
      const lines = [`**${targetTable.name}** (${dataResult.rows.length} Einträge)\n`];

      for (const row of dataResult.rows) {
        const values = fields.map(f => `${f.name}: ${row[f.slug] ?? '-'}`).join(' | ');
        lines.push(`- ${values} (ID: ${row._id})`);
      }

      const countResult = await dataDb.query(
        `SELECT COUNT(*)::int as total FROM ${escapeTableName(targetTable.slug)} ${whereClause}`,
        queryParams
      );
      const total = countResult.rows[0].total;

      if (total > 20) {
        lines.push(`\n_...${total - 20} weitere Einträge im Dashboard_`);
      }

      return lines.join('\n');
    } catch (error) {
      logger.error('[DatentabellenTool] Query error:', error.message);
      return `Fehler bei der Datenabfrage: ${error.message}`;
    }
  }

  async isAvailable() {
    return dataDb.isInitialized();
  }
}

module.exports = new DatentabellenTool();
