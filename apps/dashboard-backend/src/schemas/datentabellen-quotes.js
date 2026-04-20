const { z } = require('zod');

const QUOTE_STATUSES = ['draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled'];

// Position in a quote — loose shape (route recalculates totals)
const QuotePosition = z
  .object({
    product_id: z.union([z.string(), z.number()]).optional().nullable(),
    product_table_slug: z.string().max(200).optional().nullable(),
    name: z.string().trim().min(1).max(500),
    description: z.string().max(5000).optional().nullable(),
    sku: z.string().max(200).optional().nullable(),
    quantity: z.union([z.number(), z.string()]).optional(),
    unit: z.string().max(50).optional(),
    unit_price: z.union([z.number(), z.string()]).optional(),
    discount_percent: z.union([z.number(), z.string()]).optional(),
    is_optional: z.boolean().optional(),
    is_alternative: z.boolean().optional(),
  })
  .passthrough();

// POST /quotes
const CreateQuoteBody = z
  .object({
    customer_email: z
      .string({ error: 'Kunden-E-Mail erforderlich' })
      .trim()
      .min(1, 'Kunden-E-Mail erforderlich')
      .max(320),
    customer_name: z.string().max(500).optional().nullable(),
    customer_company: z.string().max(500).optional().nullable(),
    customer_address: z.string().max(2000).optional().nullable(),
    customer_phone: z.string().max(100).optional().nullable(),
    customer_reference: z.string().max(500).optional().nullable(),
    positions: z
      .array(QuotePosition, { error: 'Mindestens eine Position erforderlich' })
      .min(1, 'Mindestens eine Position erforderlich')
      .max(500),
    introduction_text: z.string().max(20000).optional().nullable(),
    notes: z.string().max(20000).optional().nullable(),
    internal_notes: z.string().max(20000).optional().nullable(),
    template_id: z.union([z.string(), z.number()]).optional().nullable(),
    valid_days: z.number().int().positive().max(3650).optional(),
    discount_percent: z.union([z.number(), z.string()]).optional(),
  })
  .strict();

// PATCH /quotes/:quoteId
const UpdateQuoteBody = z
  .object({
    customer_email: z.string().trim().min(1).max(320).optional(),
    customer_name: z.string().max(500).optional().nullable(),
    customer_company: z.string().max(500).optional().nullable(),
    customer_address: z.string().max(2000).optional().nullable(),
    customer_phone: z.string().max(100).optional().nullable(),
    customer_reference: z.string().max(500).optional().nullable(),
    introduction_text: z.string().max(20000).optional().nullable(),
    notes: z.string().max(20000).optional().nullable(),
    internal_notes: z.string().max(20000).optional().nullable(),
  })
  .strict();

// POST /quotes/:quoteId/status
const UpdateQuoteStatusBody = z
  .object({
    status: z
      .string({ error: 'Ungültiger Status' })
      .refine(v => QUOTE_STATUSES.includes(v), { message: 'Ungültiger Status' }),
  })
  .strict();

// POST /templates
const CreateQuoteTemplateBody = z
  .object({
    name: z
      .string({ error: 'Vorlagenname erforderlich' })
      .trim()
      .min(1, 'Vorlagenname erforderlich')
      .max(200),
    is_default: z.boolean().optional(),
    company_name: z.string().max(500).optional().nullable(),
    company_address: z.string().max(2000).optional().nullable(),
    company_phone: z.string().max(100).optional().nullable(),
    company_email: z.string().max(320).optional().nullable(),
    company_website: z.string().max(500).optional().nullable(),
    company_tax_id: z.string().max(100).optional().nullable(),
    company_bank_details: z.string().max(2000).optional().nullable(),
    primary_color: z.string().max(50).optional().nullable(),
    tax_rate: z.union([z.number(), z.string()]).optional(),
    currency: z.string().max(10).optional(),
    pdf_validity_days: z.number().int().positive().max(3650).optional(),
    pdf_payment_terms: z.string().max(5000).optional().nullable(),
    email_subject_template: z.string().max(500).optional().nullable(),
    email_body_template: z.string().max(20000).optional().nullable(),
  })
  .strict();

// PATCH /templates/:templateId
const UpdateQuoteTemplateBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    is_default: z.boolean().optional(),
    company_name: z.string().max(500).optional().nullable(),
    company_address: z.string().max(2000).optional().nullable(),
    company_phone: z.string().max(100).optional().nullable(),
    company_email: z.string().max(320).optional().nullable(),
    company_website: z.string().max(500).optional().nullable(),
    company_tax_id: z.string().max(100).optional().nullable(),
    company_bank_details: z.string().max(2000).optional().nullable(),
    primary_color: z.string().max(50).optional().nullable(),
    secondary_color: z.string().max(50).optional().nullable(),
    tax_rate: z.union([z.number(), z.string()]).optional(),
    currency: z.string().max(10).optional(),
    currency_symbol: z.string().max(10).optional().nullable(),
    pdf_validity_days: z.number().int().positive().max(3650).optional(),
    pdf_payment_terms: z.string().max(5000).optional().nullable(),
    pdf_footer_text: z.string().max(5000).optional().nullable(),
    email_subject_template: z.string().max(500).optional().nullable(),
    email_body_template: z.string().max(20000).optional().nullable(),
  })
  .strict();

module.exports = {
  CreateQuoteBody,
  UpdateQuoteBody,
  UpdateQuoteStatusBody,
  CreateQuoteTemplateBody,
  UpdateQuoteTemplateBody,
};
