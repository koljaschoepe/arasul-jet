-- Quotes Schema (Angebotssystem)
-- Templates and history for automated quote generation

-- Quote templates (company branding & settings)
CREATE TABLE IF NOT EXISTS dt_quote_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,

    -- Logo & Branding
    logo_path VARCHAR(500),
    letterhead_path VARCHAR(500),
    primary_color VARCHAR(7) DEFAULT '#45ADFF',
    secondary_color VARCHAR(7) DEFAULT '#1A2330',

    -- Company Information
    company_name VARCHAR(255),
    company_address TEXT,
    company_phone VARCHAR(50),
    company_email VARCHAR(255),
    company_website VARCHAR(255),
    company_tax_id VARCHAR(50),
    company_registration VARCHAR(100),
    company_bank_details TEXT,

    -- Email Templates
    email_subject_template VARCHAR(255) DEFAULT 'Ihr Angebot Nr. {{quote_number}}',
    email_body_template TEXT DEFAULT 'Sehr geehrte Damen und Herren,

anbei erhalten Sie unser Angebot Nr. {{quote_number}}.

Das Angebot ist gültig bis zum {{valid_until}}.

Bei Fragen stehen wir Ihnen gerne zur Verfügung.

Mit freundlichen Grüßen
{{company_name}}',

    -- PDF Settings
    pdf_footer_text TEXT,
    pdf_payment_terms TEXT DEFAULT 'Zahlbar innerhalb von 14 Tagen nach Rechnungserhalt ohne Abzug.',
    pdf_validity_days INTEGER DEFAULT 30,
    pdf_show_bank_details BOOLEAN DEFAULT TRUE,

    -- Tax Settings
    tax_rate DECIMAL(5,2) DEFAULT 19.00,
    tax_label VARCHAR(50) DEFAULT 'MwSt.',
    currency VARCHAR(3) DEFAULT 'EUR',
    currency_symbol VARCHAR(5) DEFAULT '€',

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_primary_color CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
    CONSTRAINT valid_secondary_color CHECK (secondary_color ~ '^#[0-9A-Fa-f]{6}$')
);

-- Quotes (Angebote)
CREATE TABLE IF NOT EXISTS dt_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_number VARCHAR(50) NOT NULL UNIQUE,

    -- Customer Information
    customer_email VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255),
    customer_company VARCHAR(255),
    customer_address TEXT,
    customer_phone VARCHAR(50),
    customer_reference VARCHAR(100),

    -- Financial Summary
    positions JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 19.00,
    tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total DECIMAL(12,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) DEFAULT 'EUR',

    -- Dates
    valid_until DATE,
    sent_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,

    -- Content
    introduction_text TEXT,
    notes TEXT,
    internal_notes TEXT,

    -- Status
    status VARCHAR(20) DEFAULT 'draft',

    -- Files
    pdf_path VARCHAR(500),
    pdf_generated_at TIMESTAMPTZ,

    -- Source tracking (for automation)
    source_type VARCHAR(50) DEFAULT 'manual',
    source_email_id VARCHAR(255),
    source_workflow_id VARCHAR(255),

    -- Template reference
    template_id UUID REFERENCES dt_quote_templates(id) ON DELETE SET NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(100),

    CONSTRAINT valid_status CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled'))
);

-- Quote positions (line items)
CREATE TABLE IF NOT EXISTS dt_quote_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES dt_quotes(id) ON DELETE CASCADE,
    position_number INTEGER NOT NULL,

    -- Product reference (optional - links to dynamic product table)
    product_id UUID,
    product_table_slug VARCHAR(100),

    -- Position details
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sku VARCHAR(100),

    -- Quantities
    quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
    unit VARCHAR(50) DEFAULT 'Stück',

    -- Pricing
    unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_percent DECIMAL(5,2) DEFAULT 0,
    discount_amount DECIMAL(12,2) DEFAULT 0,
    total_price DECIMAL(12,2) NOT NULL DEFAULT 0,

    -- Flags
    is_optional BOOLEAN DEFAULT FALSE,
    is_alternative BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_position_number CHECK (position_number > 0)
);

-- Quote history (audit trail)
CREATE TABLE IF NOT EXISTS dt_quote_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES dt_quotes(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    details JSONB,
    performed_by VARCHAR(100),
    performed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quote number sequence
CREATE SEQUENCE IF NOT EXISTS dt_quote_number_seq START 1000;

-- Function to generate quote numbers
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TEXT AS $$
DECLARE
    year_part TEXT;
    seq_part TEXT;
BEGIN
    year_part := TO_CHAR(NOW(), 'YYYY');
    seq_part := LPAD(NEXTVAL('dt_quote_number_seq')::TEXT, 5, '0');
    RETURN 'ANG-' || year_part || '-' || seq_part;
END;
$$ LANGUAGE plpgsql;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dt_quotes_customer ON dt_quotes(customer_email);
CREATE INDEX IF NOT EXISTS idx_dt_quotes_status ON dt_quotes(status);
CREATE INDEX IF NOT EXISTS idx_dt_quotes_created ON dt_quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dt_quotes_number ON dt_quotes(quote_number);
CREATE INDEX IF NOT EXISTS idx_dt_quote_positions_quote ON dt_quote_positions(quote_id);
CREATE INDEX IF NOT EXISTS idx_dt_quote_positions_product ON dt_quote_positions(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dt_quote_history_quote ON dt_quote_history(quote_id);

-- Ensure only one default template
CREATE UNIQUE INDEX IF NOT EXISTS idx_dt_quote_templates_default
    ON dt_quote_templates(is_default)
    WHERE is_default = TRUE;

-- Triggers
DROP TRIGGER IF EXISTS trigger_dt_quote_templates_updated_at ON dt_quote_templates;
CREATE TRIGGER trigger_dt_quote_templates_updated_at
    BEFORE UPDATE ON dt_quote_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_dt_updated_at();

DROP TRIGGER IF EXISTS trigger_dt_quotes_updated_at ON dt_quotes;
CREATE TRIGGER trigger_dt_quotes_updated_at
    BEFORE UPDATE ON dt_quotes
    FOR EACH ROW
    EXECUTE FUNCTION update_dt_updated_at();

-- Auto-generate quote number if not provided
CREATE OR REPLACE FUNCTION auto_generate_quote_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quote_number IS NULL OR NEW.quote_number = '' THEN
        NEW.quote_number := generate_quote_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_quote_number ON dt_quotes;
CREATE TRIGGER trigger_auto_quote_number
    BEFORE INSERT ON dt_quotes
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_quote_number();

-- Function to calculate quote totals
CREATE OR REPLACE FUNCTION calculate_quote_totals(p_quote_id UUID)
RETURNS TABLE(subtotal DECIMAL, tax_amount DECIMAL, total DECIMAL) AS $$
DECLARE
    v_subtotal DECIMAL(12,2);
    v_tax_rate DECIMAL(5,2);
    v_discount_percent DECIMAL(5,2);
    v_discount_amount DECIMAL(12,2);
    v_tax_amount DECIMAL(12,2);
    v_total DECIMAL(12,2);
BEGIN
    -- Get quote discount and tax rate
    SELECT q.tax_rate, q.discount_percent, COALESCE(q.discount_amount, 0)
    INTO v_tax_rate, v_discount_percent, v_discount_amount
    FROM dt_quotes q
    WHERE q.id = p_quote_id;

    -- Calculate subtotal from positions (excluding optional items)
    SELECT COALESCE(SUM(total_price), 0)
    INTO v_subtotal
    FROM dt_quote_positions
    WHERE quote_id = p_quote_id AND NOT is_optional AND NOT is_alternative;

    -- Apply discount
    IF v_discount_percent > 0 THEN
        v_discount_amount := v_subtotal * (v_discount_percent / 100);
    END IF;
    v_subtotal := v_subtotal - v_discount_amount;

    -- Calculate tax
    v_tax_amount := v_subtotal * (v_tax_rate / 100);

    -- Calculate total
    v_total := v_subtotal + v_tax_amount;

    RETURN QUERY SELECT v_subtotal, v_tax_amount, v_total;
END;
$$ LANGUAGE plpgsql;

-- Insert default quote template
INSERT INTO dt_quote_templates (
    name,
    is_default,
    company_name,
    pdf_validity_days,
    tax_rate,
    currency,
    currency_symbol
) VALUES (
    'Standard-Vorlage',
    TRUE,
    'Meine Firma GmbH',
    30,
    19.00,
    'EUR',
    '€'
) ON CONFLICT DO NOTHING;

-- Comments
COMMENT ON TABLE dt_quote_templates IS 'Templates for quote PDF generation with company branding';
COMMENT ON TABLE dt_quotes IS 'Customer quotes/offers with pricing and status tracking';
COMMENT ON TABLE dt_quote_positions IS 'Line items within quotes';
COMMENT ON TABLE dt_quote_history IS 'Audit trail of quote status changes';
COMMENT ON FUNCTION generate_quote_number() IS 'Generates unique quote numbers in format ANG-YYYY-NNNNN';
COMMENT ON FUNCTION calculate_quote_totals(UUID) IS 'Calculates subtotal, tax, and total for a quote';
