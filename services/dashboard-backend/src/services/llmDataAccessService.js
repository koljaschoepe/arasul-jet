/**
 * LLM Data Access Service
 * Provides data functions that can be called by the LLM to access Datentabellen
 * Part of the Datentabellen feature
 */

const dataDb = require('../dataDatabase');
const logger = require('../utils/logger');
const axios = require('axios');
const services = require('../config/services');

// LLM Service configuration
const LLM_HOST = services.llm?.host || 'llm-service';
const LLM_PORT = services.llm?.port || 11434;

/**
 * SQL Reserved Keywords - blocked from use in identifiers
 */
const SQL_RESERVED_KEYWORDS = new Set([
    'select', 'insert', 'update', 'delete', 'drop', 'create', 'alter', 'truncate',
    'table', 'index', 'view', 'database', 'schema', 'union', 'where', 'from',
    'join', 'cascade', 'grant', 'revoke', 'exec', 'execute', 'declare'
]);

/**
 * Helper: Validate slug format - strict validation
 */
function isValidSlug(slug) {
    if (!slug || typeof slug !== 'string') return false;
    if (slug.length > 100) return false;
    if (!/^[a-z][a-z0-9_]*$/.test(slug)) return false;
    if (SQL_RESERVED_KEYWORDS.has(slug)) return false;
    return true;
}

/**
 * Available data functions for LLM tool calls
 * These functions can be invoked by the LLM to access user data
 */
const DATA_FUNCTIONS = {
    /**
     * Search for products by name or article number
     * @param {string} searchTerm - Name or article number to search for
     * @returns {Array} Matching products (max 5)
     */
    async get_product(searchTerm) {
        if (!searchTerm || typeof searchTerm !== 'string') {
            return { error: 'Search term required' };
        }

        try {
            const result = await dataDb.query(`
                SELECT _id, name, artikel_nr, preis, einheit, beschreibung, bestand
                FROM data_produkte
                WHERE LOWER(name) LIKE LOWER($1)
                   OR LOWER(artikel_nr) LIKE LOWER($1)
                ORDER BY name
                LIMIT 5
            `, [`%${searchTerm}%`]);

            return result.rows.length > 0
                ? result.rows
                : { message: 'Keine Produkte gefunden', searchTerm };
        } catch (err) {
            logger.error('[LLMDataAccess] get_product error:', err.message);
            // Table might not exist yet
            if (err.code === '42P01') {
                return { error: 'Produkttabelle existiert noch nicht' };
            }
            return { error: 'Datenbankfehler' };
        }
    },

    /**
     * Get product price with quantity discount
     * @param {string} productId - Product UUID
     * @param {number} quantity - Order quantity (default: 1)
     * @returns {Object} Product with calculated price
     */
    async get_product_price(productId, quantity = 1) {
        if (!productId) {
            return { error: 'Product ID required' };
        }

        try {
            // First get the product
            const productResult = await dataDb.query(`
                SELECT _id, name, artikel_nr, preis, einheit
                FROM data_produkte
                WHERE _id = $1
            `, [productId]);

            if (productResult.rows.length === 0) {
                return { error: 'Produkt nicht gefunden', productId };
            }

            const product = productResult.rows[0];

            // Try to get quantity discount from staffelpreise table
            try {
                const discountResult = await dataDb.query(`
                    SELECT rabatt_prozent
                    FROM data_staffelpreise
                    WHERE produkt_id = $1 AND ab_menge <= $2
                    ORDER BY ab_menge DESC
                    LIMIT 1
                `, [productId, quantity]);

                const discount = discountResult.rows[0]?.rabatt_prozent || 0;
                const endpreis = product.preis * (1 - discount / 100);

                return {
                    ...product,
                    quantity,
                    rabatt_prozent: discount,
                    endpreis: Math.round(endpreis * 100) / 100,
                    gesamt: Math.round(endpreis * quantity * 100) / 100
                };
            } catch {
                // Staffelpreise table doesn't exist, return without discount
                return {
                    ...product,
                    quantity,
                    rabatt_prozent: 0,
                    endpreis: product.preis,
                    gesamt: Math.round(product.preis * quantity * 100) / 100
                };
            }
        } catch (err) {
            logger.error('[LLMDataAccess] get_product_price error:', err.message);
            return { error: 'Datenbankfehler' };
        }
    },

    /**
     * Check stock level for a product
     * @param {string} productId - Product UUID
     * @returns {Object} Stock information
     */
    async check_stock(productId) {
        if (!productId) {
            return { error: 'Product ID required' };
        }

        try {
            const result = await dataDb.query(`
                SELECT _id, name, bestand, mindestbestand
                FROM data_produkte
                WHERE _id = $1
            `, [productId]);

            if (result.rows.length === 0) {
                return { error: 'Produkt nicht gefunden', productId };
            }

            const product = result.rows[0];
            const bestand = product.bestand || 0;
            const mindest = product.mindestbestand || 0;

            return {
                productId: product._id,
                name: product.name,
                bestand,
                mindestbestand: mindest,
                verfuegbar: bestand > 0,
                nachbestellen: bestand <= mindest
            };
        } catch (err) {
            logger.error('[LLMDataAccess] check_stock error:', err.message);
            if (err.code === '42P01') {
                return { error: 'Produkttabelle existiert noch nicht' };
            }
            return { error: 'Datenbankfehler' };
        }
    },

    /**
     * List products, optionally filtered by category
     * @param {string} category - Optional category filter
     * @returns {Array} Products (max 50)
     */
    async list_products(category = null) {
        try {
            let query = `
                SELECT _id, name, artikel_nr, preis, einheit, kategorie, bestand
                FROM data_produkte
            `;
            const params = [];

            if (category) {
                query += ' WHERE LOWER(kategorie) = LOWER($1)';
                params.push(category);
            }

            query += ' ORDER BY name LIMIT 50';

            const result = await dataDb.query(query, params);
            return result.rows;
        } catch (err) {
            logger.error('[LLMDataAccess] list_products error:', err.message);
            if (err.code === '42P01') {
                return { error: 'Produkttabelle existiert noch nicht' };
            }
            return { error: 'Datenbankfehler' };
        }
    },

    /**
     * Search customers by name, email, or company
     * @param {string} searchTerm - Search term
     * @returns {Array} Matching customers (max 10)
     */
    async search_customers(searchTerm) {
        if (!searchTerm || typeof searchTerm !== 'string') {
            return { error: 'Search term required' };
        }

        try {
            const result = await dataDb.query(`
                SELECT _id, name, email, firma, telefon, adresse
                FROM data_kunden
                WHERE LOWER(name) LIKE LOWER($1)
                   OR LOWER(email) LIKE LOWER($1)
                   OR LOWER(firma) LIKE LOWER($1)
                ORDER BY name
                LIMIT 10
            `, [`%${searchTerm}%`]);

            return result.rows.length > 0
                ? result.rows
                : { message: 'Keine Kunden gefunden', searchTerm };
        } catch (err) {
            logger.error('[LLMDataAccess] search_customers error:', err.message);
            if (err.code === '42P01') {
                return { error: 'Kundentabelle existiert noch nicht' };
            }
            return { error: 'Datenbankfehler' };
        }
    },

    /**
     * Get recent quotes for a customer
     * @param {string} customerEmail - Customer email
     * @returns {Array} Recent quotes (max 10)
     */
    async get_customer_quotes(customerEmail) {
        if (!customerEmail) {
            return { error: 'Customer email required' };
        }

        try {
            const result = await dataDb.query(`
                SELECT id, quote_number, total, currency, status, created_at, valid_until
                FROM dt_quotes
                WHERE customer_email = $1
                ORDER BY created_at DESC
                LIMIT 10
            `, [customerEmail]);

            return result.rows;
        } catch (err) {
            logger.error('[LLMDataAccess] get_customer_quotes error:', err.message);
            return { error: 'Datenbankfehler' };
        }
    },

    /**
     * List available tables
     * @returns {Array} All user-created tables
     */
    async list_tables() {
        try {
            const result = await dataDb.query(`
                SELECT id, name, slug, description, icon, color
                FROM dt_tables
                ORDER BY name
            `);
            return result.rows;
        } catch (err) {
            logger.error('[LLMDataAccess] list_tables error:', err.message);
            return { error: 'Datenbankfehler' };
        }
    },

    /**
     * Query a specific table with filters
     * @param {string} tableSlug - Table slug (e.g., 'produkte')
     * @param {Object} filters - Optional filters { field: value }
     * @param {number} limit - Max rows to return (default: 20, max: 100)
     * @returns {Array} Matching rows
     */
    async query_table(tableSlug, filters = {}, limit = 20) {
        if (!tableSlug || typeof tableSlug !== 'string') {
            return { error: 'Table slug required' };
        }

        // Validate slug format (strict validation with SQL keyword blocking)
        if (!isValidSlug(tableSlug)) {
            return { error: 'Invalid table slug format' };
        }

        // Limit the max rows
        const safeLimit = Math.min(Math.max(1, limit), 100);

        try {
            // Check if table exists
            const tableCheck = await dataDb.query(
                'SELECT id FROM dt_tables WHERE slug = $1',
                [tableSlug]
            );

            if (tableCheck.rows.length === 0) {
                return { error: 'Tabelle nicht gefunden', tableSlug };
            }

            // Build query with filters
            let query = `SELECT * FROM data_${tableSlug}`;
            const params = [];
            const conditions = [];

            // Add filter conditions (basic equality only for safety)
            let paramIndex = 1;
            for (const [field, value] of Object.entries(filters)) {
                // Validate field name format (strict validation)
                if (isValidSlug(field) || field.startsWith('_')) {
                    // Allow system fields (_id, _created_at, etc.)
                    const safeField = field.startsWith('_') && /^_[a-z_]+$/.test(field) ? field : field;
                    conditions.push(`${safeField} = $${paramIndex}`);
                    params.push(value);
                    paramIndex++;
                }
            }

            if (conditions.length > 0) {
                query += ` WHERE ${conditions.join(' AND ')}`;
            }

            query += ` ORDER BY _created_at DESC LIMIT $${paramIndex}`;
            params.push(safeLimit);

            const result = await dataDb.query(query, params);
            return result.rows;
        } catch (err) {
            logger.error('[LLMDataAccess] query_table error:', err.message);
            if (err.code === '42P01') {
                return { error: 'Datentabelle existiert nicht', tableSlug };
            }
            return { error: 'Datenbankfehler' };
        }
    }
};

/**
 * Execute a data function by name
 * @param {string} functionName - Name of the function to call
 * @param {Object} args - Arguments for the function
 * @returns {Promise<any>} Function result
 */
async function executeDataFunction(functionName, args = {}) {
    const func = DATA_FUNCTIONS[functionName];

    if (!func) {
        return {
            error: 'Unknown function',
            functionName,
            availableFunctions: Object.keys(DATA_FUNCTIONS)
        };
    }

    try {
        // Call function with spread arguments
        const argValues = Object.values(args);
        const result = await func(...argValues);

        logger.info(`[LLMDataAccess] Executed ${functionName}`, { args, resultCount: Array.isArray(result) ? result.length : 1 });

        return result;
    } catch (err) {
        logger.error(`[LLMDataAccess] Error executing ${functionName}:`, err.message);
        return { error: 'Function execution failed', details: err.message };
    }
}

/**
 * Get the system prompt extension for LLM with available functions
 * @returns {string} System prompt text describing available functions
 */
function getDataAccessPrompt() {
    return `
VERFÜGBARE DATEN-FUNKTIONEN:
Du kannst auf Benutzerdaten in der Datenbank zugreifen mit folgenden Funktionen:

- get_product(searchTerm): Findet Produkte nach Name oder Artikelnummer
- get_product_price(productId, quantity): Berechnet Preis mit Mengenrabatt
- check_stock(productId): Prüft Lagerbestand eines Produkts
- list_products(category): Listet alle Produkte einer Kategorie
- search_customers(searchTerm): Sucht Kunden nach Name/Email/Firma
- get_customer_quotes(customerEmail): Zeigt Angebote eines Kunden
- list_tables(): Zeigt alle verfügbaren Datentabellen
- query_table(tableSlug, filters, limit): Abfrage einer beliebigen Tabelle

Um eine Funktion aufzurufen, antworte mit:
<function_call>{"name": "get_product", "args": {"searchTerm": "Widget"}}</function_call>

Warte auf das Ergebnis bevor du mit dem Benutzer sprichst.
`;
}

/**
 * Parse function calls from LLM response
 * @param {string} response - LLM response text
 * @returns {Array} Parsed function calls
 */
function parseFunctionCalls(response) {
    const calls = [];
    const regex = /<function_call>([\s\S]*?)<\/function_call>/g;
    let match;

    while ((match = regex.exec(response)) !== null) {
        try {
            const parsed = JSON.parse(match[1]);
            if (parsed.name && typeof parsed.name === 'string') {
                calls.push({
                    name: parsed.name,
                    args: parsed.args || {}
                });
            }
        } catch (e) {
            logger.warn('[LLMDataAccess] Failed to parse function call:', match[1]);
        }
    }

    return calls;
}

// ============================================================
// SQL Generation Layer (Phase 3)
// ============================================================

/**
 * Dangerous SQL keywords that are NEVER allowed
 */
const DANGEROUS_SQL_KEYWORDS = [
    'insert', 'update', 'delete', 'drop', 'create', 'alter', 'truncate',
    'grant', 'revoke', 'exec', 'execute', 'declare', 'set', 'call',
    'merge', 'replace', 'into', 'lock', 'unlock', 'rename', 'backup'
];

/**
 * Get the schema of a table including all field definitions
 * @param {string} tableSlug - Table slug
 * @returns {Object} Table schema with fields
 */
async function getTableSchema(tableSlug) {
    if (!tableSlug || !isValidSlug(tableSlug)) {
        return { error: 'Invalid table slug' };
    }

    try {
        // Get table metadata
        const tableResult = await dataDb.query(
            'SELECT id, name, slug, description FROM dt_tables WHERE slug = $1',
            [tableSlug]
        );

        if (tableResult.rows.length === 0) {
            return { error: 'Table not found', tableSlug };
        }

        const table = tableResult.rows[0];

        // Get fields
        const fieldsResult = await dataDb.query(`
            SELECT slug, name, field_type, is_required, is_unique, options
            FROM dt_fields
            WHERE table_id = $1
            ORDER BY field_order
        `, [table.id]);

        // Get sample data (first 3 rows)
        let sampleData = [];
        try {
            const sampleResult = await dataDb.query(
                `SELECT * FROM data_${tableSlug} ORDER BY _created_at DESC LIMIT 3`
            );
            sampleData = sampleResult.rows;
        } catch (e) {
            // Table might be empty
        }

        return {
            table: {
                name: table.name,
                slug: table.slug,
                description: table.description,
                dataTable: `data_${table.slug}`
            },
            fields: fieldsResult.rows.map(f => ({
                column: f.slug,
                name: f.name,
                type: f.field_type,
                required: f.is_required,
                unique: f.is_unique
            })),
            systemFields: [
                { column: '_id', name: 'ID', type: 'uuid' },
                { column: '_created_at', name: 'Erstellt', type: 'timestamp' },
                { column: '_updated_at', name: 'Aktualisiert', type: 'timestamp' }
            ],
            sampleData
        };
    } catch (err) {
        logger.error('[LLMDataAccess] getTableSchema error:', err.message);
        return { error: 'Database error' };
    }
}

/**
 * Get schemas for all tables
 * @returns {Array} Array of table schemas
 */
async function getAllTableSchemas() {
    try {
        const tablesResult = await dataDb.query(
            'SELECT slug FROM dt_tables ORDER BY name'
        );

        const schemas = [];
        for (const row of tablesResult.rows) {
            const schema = await getTableSchema(row.slug);
            if (!schema.error) {
                schemas.push(schema);
            }
        }

        return schemas;
    } catch (err) {
        logger.error('[LLMDataAccess] getAllTableSchemas error:', err.message);
        return [];
    }
}

/**
 * Build the prompt for SQL generation
 * @param {string} query - Natural language query
 * @param {Object} schema - Table schema
 * @returns {string} Prompt for LLM
 */
function buildSQLPrompt(query, schema) {
    const fieldsList = schema.fields.map(f =>
        `  - ${f.column} (${f.name}): ${f.type}${f.required ? ', Pflichtfeld' : ''}`
    ).join('\n');

    const systemFieldsList = schema.systemFields.map(f =>
        `  - ${f.column} (${f.name}): ${f.type}`
    ).join('\n');

    const sampleDataStr = schema.sampleData.length > 0
        ? `\nBeispieldaten:\n${JSON.stringify(schema.sampleData.slice(0, 2), null, 2)}`
        : '';

    return `Du bist ein SQL-Experte. Generiere eine PostgreSQL SELECT-Abfrage basierend auf der Benutzeranfrage.

TABELLE: ${schema.table.dataTable}
Beschreibung: ${schema.table.description || schema.table.name}

SPALTEN:
${fieldsList}

SYSTEMSPALTEN:
${systemFieldsList}
${sampleDataStr}

REGELN:
1. NUR SELECT-Statements - KEINE INSERT, UPDATE, DELETE, DROP oder andere modifizierende Befehle
2. Verwende die exakten Spaltennamen (slug-Namen wie oben)
3. Für Text-Suche: ILIKE mit % für partielle Übereinstimmung
4. Für Zahlenvergleiche: Korrekte Operatoren (>, <, =, >=, <=)
5. Datum-Formate: 'YYYY-MM-DD' oder Funktionen wie NOW(), DATE_TRUNC
6. Standard-Limit: 100 Zeilen (anpassen wenn vom Benutzer gewünscht)
7. Sortierung nach _created_at DESC wenn nicht anders gewünscht
8. Bei Aggregationen: GROUP BY für nicht-aggregierte Spalten

BENUTZERANFRAGE: "${query}"

Antworte NUR mit einem JSON-Objekt in diesem Format:
{
  "sql": "SELECT ... FROM ${schema.table.dataTable} ...",
  "explanation": "Kurze Erklärung was die Abfrage macht"
}`;
}

/**
 * Validate SQL to ensure it's safe (only SELECT, no dangerous keywords)
 * @param {string} sql - SQL to validate
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateSQL(sql) {
    if (!sql || typeof sql !== 'string') {
        return { valid: false, error: 'SQL is required' };
    }

    const trimmedSQL = sql.trim().toLowerCase();

    // Must start with SELECT
    if (!trimmedSQL.startsWith('select')) {
        return { valid: false, error: 'Only SELECT statements are allowed' };
    }

    // Check for dangerous keywords
    for (const keyword of DANGEROUS_SQL_KEYWORDS) {
        // Check for keyword as whole word (with word boundaries)
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(trimmedSQL)) {
            return { valid: false, error: `Forbidden SQL keyword: ${keyword}` };
        }
    }

    // Check for comments (could hide malicious SQL)
    if (trimmedSQL.includes('--') || trimmedSQL.includes('/*')) {
        return { valid: false, error: 'SQL comments are not allowed' };
    }

    // Check for multiple statements
    if (trimmedSQL.includes(';') && trimmedSQL.indexOf(';') < trimmedSQL.length - 1) {
        return { valid: false, error: 'Multiple SQL statements are not allowed' };
    }

    return { valid: true };
}

/**
 * Generate and execute SQL from natural language query
 * @param {string} query - Natural language query
 * @param {string} tableSlug - Target table slug (optional - if not provided, tries to infer)
 * @returns {Object} { sql, results, explanation, rowCount }
 */
async function generateAndExecuteSQL(query, tableSlug = null) {
    if (!query || typeof query !== 'string' || query.trim().length < 3) {
        return { error: 'Query is too short or empty' };
    }

    logger.info(`[LLMDataAccess] SQL Generation request: "${query}" for table: ${tableSlug || 'auto'}`);

    try {
        // Get table schema
        let schema;
        if (tableSlug) {
            schema = await getTableSchema(tableSlug);
            if (schema.error) {
                return schema;
            }
        } else {
            // Try to find the best matching table
            const allSchemas = await getAllTableSchemas();
            if (allSchemas.length === 0) {
                return { error: 'No tables found in database' };
            }
            // For now, use the first table - could be enhanced with semantic matching
            schema = allSchemas[0];
        }

        // Build prompt
        const prompt = buildSQLPrompt(query, schema);

        // Call LLM
        let llmResponse;
        try {
            const response = await axios.post(
                `http://${LLM_HOST}:${LLM_PORT}/api/generate`,
                {
                    model: 'gemma3:4b', // Use a capable model
                    prompt: prompt,
                    stream: false,
                    options: {
                        temperature: 0.1, // Low temperature for deterministic output
                        num_predict: 500
                    }
                },
                { timeout: 60000 }
            );

            llmResponse = response.data.response;
        } catch (err) {
            logger.error('[LLMDataAccess] LLM request failed:', err.message);
            return { error: 'LLM service not available' };
        }

        // Parse LLM response
        let parsed;
        try {
            // Extract JSON from response (might have extra text)
            const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }
            parsed = JSON.parse(jsonMatch[0]);
        } catch (err) {
            logger.error('[LLMDataAccess] Failed to parse LLM response:', llmResponse);
            return { error: 'Failed to parse LLM response' };
        }

        if (!parsed.sql) {
            return { error: 'LLM did not generate SQL' };
        }

        // Validate SQL
        const validation = validateSQL(parsed.sql);
        if (!validation.valid) {
            logger.warn(`[LLMDataAccess] SQL validation failed: ${validation.error}`);
            return { error: validation.error };
        }

        // Execute SQL
        let results;
        try {
            const result = await dataDb.query(parsed.sql);
            results = result.rows;
        } catch (err) {
            logger.error('[LLMDataAccess] SQL execution failed:', err.message);
            return {
                error: 'SQL execution failed',
                sql: parsed.sql,
                details: err.message
            };
        }

        logger.info(`[LLMDataAccess] SQL executed successfully, ${results.length} rows returned`);

        return {
            success: true,
            sql: parsed.sql,
            explanation: parsed.explanation || 'Abfrage erfolgreich ausgeführt',
            results: results,
            rowCount: results.length,
            table: schema.table.name
        };

    } catch (err) {
        logger.error('[LLMDataAccess] generateAndExecuteSQL error:', err.message);
        return { error: 'Internal error during SQL generation' };
    }
}

/**
 * Execute a raw SQL query (SELECT only, with validation)
 * @param {string} sql - SQL query
 * @returns {Object} Query results
 */
async function executeValidatedSQL(sql) {
    const validation = validateSQL(sql);
    if (!validation.valid) {
        return { error: validation.error };
    }

    try {
        const result = await dataDb.query(sql);
        return {
            success: true,
            results: result.rows,
            rowCount: result.rows.length
        };
    } catch (err) {
        logger.error('[LLMDataAccess] executeValidatedSQL error:', err.message);
        return { error: 'SQL execution failed', details: err.message };
    }
}

module.exports = {
    DATA_FUNCTIONS,
    executeDataFunction,
    getDataAccessPrompt,
    parseFunctionCalls,
    // SQL Generation (Phase 3)
    getTableSchema,
    getAllTableSchemas,
    validateSQL,
    generateAndExecuteSQL,
    executeValidatedSQL
};
