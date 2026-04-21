const { z } = require('zod');

const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'currency',
  'date',
  'datetime',
  'select',
  'multiselect',
  'checkbox',
  'relation',
  'file',
  'image',
  'email',
  'url',
  'phone',
  'formula',
];
const TABLE_STATUSES = ['active', 'draft', 'archived'];

// POST /query/natural
const NaturalQueryBody = z
  .object({
    query: z
      .string({ error: 'Query parameter is required' })
      .trim()
      .min(5, 'Query is too short (minimum 5 characters)')
      .max(5000),
    tableSlug: z.string().trim().max(200).optional().nullable(),
  })
  .strict();

// POST /query/sql
const SqlQueryBody = z
  .object({
    sql: z
      .string({ error: 'SQL parameter is required' })
      .trim()
      .min(1, 'SQL parameter is required')
      .max(20000),
  })
  .strict();

// POST /tables
const CreateTableBody = z
  .object({
    name: z
      .string({ error: 'Tabellenname erforderlich' })
      .trim()
      .min(1, 'Tabellenname erforderlich')
      .max(200),
    description: z.string().max(5000).optional().nullable(),
    icon: z.string().max(50).optional().nullable(),
    color: z.string().max(50).optional().nullable(),
    category: z.string().max(100).optional().nullable(),
    space_id: z.union([z.string(), z.number()]).optional().nullable(),
    createDefaultField: z.boolean().optional(),
  })
  .strict();

// PATCH /tables/:slug
const UpdateTableBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).optional().nullable(),
    icon: z.string().max(50).optional().nullable(),
    color: z.string().max(50).optional().nullable(),
    category: z.string().max(100).optional().nullable(),
    space_id: z.union([z.string(), z.number()]).optional().nullable(),
    status: z
      .string()
      .refine(v => TABLE_STATUSES.includes(v), {
        message: `Ungültiger Status. Erlaubt: ${TABLE_STATUSES.join(', ')}`,
      })
      .optional(),
  })
  .strict();

// POST /tables/:slug/fields
const CreateFieldBody = z
  .object({
    name: z
      .string({ error: 'Feldname erforderlich' })
      .trim()
      .min(1, 'Feldname erforderlich')
      .max(200),
    field_type: z
      .string({ error: 'Feldtyp erforderlich' })
      .refine(v => FIELD_TYPES.includes(v), { message: 'Ungültiger Feldtyp' }),
    unit: z.string().max(50).optional().nullable(),
    is_required: z.boolean().optional(),
    is_unique: z.boolean().optional(),
    is_primary_display: z.boolean().optional(),
    default_value: z.unknown().optional(),
    options: z.unknown().optional(),
    validation: z.unknown().optional(),
  })
  .strict();

// PATCH /tables/:slug/fields/:fieldSlug
const UpdateFieldBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    field_type: z
      .string()
      .refine(v => FIELD_TYPES.includes(v), { message: 'Ungültiger Feldtyp' })
      .optional(),
    unit: z.string().max(50).optional().nullable(),
    is_required: z.boolean().optional(),
    is_primary_display: z.boolean().optional(),
    default_value: z.unknown().optional(),
    options: z.unknown().optional(),
    validation: z.unknown().optional(),
  })
  .strict();

// POST /tables/:slug/rows/bulk
const BulkCreateRowsBody = z
  .object({
    rows: z
      .array(z.record(z.string(), z.unknown()), {
        error: 'Keine Daten zum Importieren',
      })
      .min(1, 'Keine Daten zum Importieren')
      .max(1000, 'Maximal 1000 Zeilen pro Import'),
  })
  .strict();

// DELETE /tables/:slug/rows/bulk
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BulkDeleteRowsBody = z
  .object({
    ids: z
      .array(z.string().regex(UUID_REGEX, 'Ungültige ID'), {
        error: 'Keine IDs zum Löschen angegeben',
      })
      .min(1, 'Keine IDs zum Löschen angegeben')
      .max(100, 'Maximal 100 Zeilen pro Löschvorgang'),
  })
  .strict();

// Rows are dynamic-column (user-defined fields), so only enforce object-shape.
// Per-field validation happens in the route against the fields table.
const CreateRowBody = z
  .record(z.string().max(200), z.unknown(), {
    error: 'Request body must be an object of field values',
  })
  .refine(obj => Object.keys(obj).length <= 200, {
    message: 'Zu viele Felder (max. 200)',
  });

// PATCH row — same but also allows optional _expected_updated_at for optimistic locking
const UpdateRowBody = z
  .record(z.string().max(200), z.unknown(), {
    error: 'Request body must be an object of field values',
  })
  .refine(obj => Object.keys(obj).length <= 200, {
    message: 'Zu viele Felder (max. 200)',
  });

module.exports = {
  NaturalQueryBody,
  SqlQueryBody,
  CreateTableBody,
  UpdateTableBody,
  CreateFieldBody,
  UpdateFieldBody,
  BulkCreateRowsBody,
  BulkDeleteRowsBody,
  CreateRowBody,
  UpdateRowBody,
};
