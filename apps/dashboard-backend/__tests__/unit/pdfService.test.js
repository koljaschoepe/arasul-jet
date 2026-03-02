/**
 * PDF Service Tests
 *
 * Tests for pdfService.generateQuotePDF:
 * - PDF buffer generation
 * - Text content via mocked PDFDocument
 * - Optional/alternative positions
 * - Discount handling
 * - Notes and payment terms
 * - Footer with bank details
 * - Page break for many positions
 * - Error handling
 */

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

// Track all doc.text() calls to verify content without parsing PDF binary
// Jest requires variables referenced in jest.mock() to be prefixed with "mock"
let mockTextCalls = [];
let mockFontCalls = [];
let mockAddPageCalls = 0;

// Spy on PDFDocument via a wrapping mock
jest.mock('pdfkit', () => {
  const { EventEmitter } = require('events');

  return class MockPDFDocument extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      mockTextCalls = [];
      mockFontCalls = [];
      mockAddPageCalls = 0;

      // Emit data/end on next tick to simulate real PDFKit
      process.nextTick(() => {
        this.emit('data', Buffer.from('%PDF-1.3\nmocked'));
        this.emit('end');
      });
    }

    // Chainable drawing methods
    font(name) { mockFontCalls.push(name); return this; }
    fontSize() { return this; }
    fillColor() { return this; }
    strokeColor() { return this; }
    lineWidth() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    stroke() { return this; }
    rect() { return this; }
    fill() { return this; }

    text(str, ...args) {
      if (typeof str === 'string') mockTextCalls.push(str);
      return this;
    }

    addPage() {
      mockAddPageCalls++;
      return this;
    }

    heightOfString() { return 15; }
    end() { /* already emitted via nextTick */ }
    on(event, handler) { super.on(event, handler); return this; }
  };
});

const { generateQuotePDF } = require('../../src/services/app/pdfService');

// Minimal quote fixture
const createQuote = (overrides = {}) => ({
  quote_number: 'ANG-2025-001',
  company_name: 'Test GmbH',
  company_address: 'Musterstr. 1\n12345 Berlin',
  company_phone: '+49 30 1234567',
  company_email: 'info@test.de',
  company_website: 'www.test.de',
  company_tax_id: 'DE123456789',
  company_bank_details: 'IBAN: DE89370400440532013000\nBIC: COBADEFFXXX',
  customer_company: 'Kunde AG',
  customer_name: 'Max Mustermann',
  customer_address: 'Kundenstr. 5\n80000 München',
  customer_email: 'max@kunde.de',
  introduction_text: 'Vielen Dank für Ihre Anfrage.',
  created_at: '2025-06-15T10:00:00Z',
  valid_until: '2025-07-15T10:00:00Z',
  subtotal: 1000,
  discount_amount: 0,
  discount_percent: 0,
  tax_rate: 19,
  tax_label: 'MwSt.',
  tax_amount: 190,
  total: 1190,
  currency: 'EUR',
  currency_symbol: '€',
  primary_color: '#45ADFF',
  notes: null,
  pdf_payment_terms: null,
  pdf_show_bank_details: false,
  pdf_footer_text: null,
  ...overrides,
});

const createPosition = (overrides = {}) => ({
  position_number: 1,
  name: 'Beratungsleistung',
  description: 'Strategische Beratung',
  quantity: 10,
  unit: 'Std.',
  unit_price: 100,
  total_price: 1000,
  is_optional: false,
  is_alternative: false,
  ...overrides,
});

// Helper: join all text calls for assertion
const allText = () => mockTextCalls.join(' ');

describe('pdfService', () => {
  describe('generateQuotePDF', () => {
    it('should return a Buffer', async () => {
      const result = await generateQuotePDF(createQuote(), [createPosition()]);
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('should produce a buffer starting with %PDF-', async () => {
      const buffer = await generateQuotePDF(createQuote(), [createPosition()]);
      expect(buffer.toString('ascii', 0, 5)).toBe('%PDF-');
    });

    it('should contain the quote number', async () => {
      await generateQuotePDF(createQuote({ quote_number: 'ANG-2025-042' }), [createPosition()]);
      expect(allText()).toContain('ANG-2025-042');
    });

    it('should contain the company name', async () => {
      await generateQuotePDF(createQuote({ company_name: 'Arasul Solutions' }), [createPosition()]);
      expect(allText()).toContain('Arasul Solutions');
    });

    it('should contain customer information', async () => {
      await generateQuotePDF(
        createQuote({ customer_company: 'Kunde Corp', customer_name: 'Anna Schmidt' }),
        [createPosition()]
      );
      expect(allText()).toContain('Kunde Corp');
      expect(allText()).toContain('Anna Schmidt');
    });

    it('should contain position names', async () => {
      const positions = [
        createPosition({ position_number: 1, name: 'Webentwicklung' }),
        createPosition({ position_number: 2, name: 'Design-Arbeit' }),
      ];
      await generateQuotePDF(createQuote(), positions);
      expect(allText()).toContain('Webentwicklung');
      expect(allText()).toContain('Design-Arbeit');
    });

    it('should handle optional positions with [Optional] prefix', async () => {
      const positions = [
        createPosition({ position_number: 1, name: 'Standard', is_optional: false }),
        createPosition({ position_number: 2, name: 'Extra', is_optional: true }),
      ];
      await generateQuotePDF(createQuote(), positions);
      expect(allText()).toContain('[Optional]');
    });

    it('should handle alternative positions with [Alternative] prefix', async () => {
      const positions = [
        createPosition({ position_number: 1, name: 'A', is_alternative: false }),
        createPosition({ position_number: 2, name: 'B', is_alternative: true }),
      ];
      await generateQuotePDF(createQuote(), positions);
      expect(allText()).toContain('[Alternative]');
    });

    it('should include discount when discount_amount > 0', async () => {
      await generateQuotePDF(
        createQuote({ discount_amount: 100, discount_percent: 10 }),
        [createPosition()]
      );
      expect(allText()).toContain('Rabatt');
      expect(allText()).toContain('10%');
    });

    it('should not include discount when discount_amount is 0', async () => {
      await generateQuotePDF(
        createQuote({ discount_amount: 0, discount_percent: 0 }),
        [createPosition()]
      );
      expect(allText()).not.toContain('Rabatt');
    });

    it('should include notes when provided', async () => {
      await generateQuotePDF(
        createQuote({ notes: 'Lieferung innerhalb von 14 Tagen' }),
        [createPosition()]
      );
      expect(allText()).toContain('Anmerkungen');
      expect(allText()).toContain('Lieferung innerhalb von 14 Tagen');
    });

    it('should not include notes section when notes is null', async () => {
      await generateQuotePDF(createQuote({ notes: null }), [createPosition()]);
      expect(allText()).not.toContain('Anmerkungen');
    });

    it('should include payment terms when provided', async () => {
      await generateQuotePDF(
        createQuote({ pdf_payment_terms: 'Zahlbar innerhalb 30 Tage netto' }),
        [createPosition()]
      );
      expect(allText()).toContain('Zahlungsbedingungen');
      expect(allText()).toContain('Zahlbar innerhalb 30 Tage netto');
    });

    it('should include bank details in footer when enabled', async () => {
      await generateQuotePDF(
        createQuote({
          pdf_show_bank_details: true,
          company_bank_details: 'IBAN: DE89370400440532013000',
        }),
        [createPosition()]
      );
      expect(allText()).toContain('DE89370400440532013000');
    });

    it('should not show bank details when disabled', async () => {
      await generateQuotePDF(
        createQuote({ pdf_show_bank_details: false, company_bank_details: 'IBAN: SECRET' }),
        [createPosition()]
      );
      expect(allText()).not.toContain('SECRET');
    });

    it('should include footer text when provided', async () => {
      await generateQuotePDF(
        createQuote({ pdf_footer_text: 'Vielen Dank fuer Ihr Vertrauen' }),
        [createPosition()]
      );
      expect(allText()).toContain('Vielen Dank fuer Ihr Vertrauen');
    });

    it('should include tax label and rate', async () => {
      await generateQuotePDF(
        createQuote({ tax_label: 'USt.', tax_rate: 7 }),
        [createPosition()]
      );
      expect(allText()).toContain('USt.');
      expect(allText()).toContain('7%');
    });

    it('should include introduction text', async () => {
      await generateQuotePDF(
        createQuote({ introduction_text: 'Sehr geehrte Damen und Herren' }),
        [createPosition()]
      );
      expect(allText()).toContain('Sehr geehrte Damen und Herren');
    });

    it('should contain ANGEBOT heading', async () => {
      await generateQuotePDF(createQuote(), [createPosition()]);
      expect(allText()).toContain('ANGEBOT');
    });

    it('should contain Gesamtbetrag label', async () => {
      await generateQuotePDF(createQuote(), [createPosition()]);
      expect(allText()).toContain('Gesamtbetrag');
    });

    it('should contain Zwischensumme label', async () => {
      await generateQuotePDF(createQuote(), [createPosition()]);
      expect(allText()).toContain('Zwischensumme');
    });

    it('should contain position descriptions', async () => {
      await generateQuotePDF(createQuote(), [
        createPosition({ description: 'Inklusive Dokumentation' }),
      ]);
      expect(allText()).toContain('Inklusive Dokumentation');
    });

    it('should show Empfaenger label', async () => {
      await generateQuotePDF(createQuote(), [createPosition()]);
      // The service uses 'Empfänger:' but with ä which may vary
      const hasRecipient = mockTextCalls.some(t => t.includes('Empf'));
      expect(hasRecipient).toBe(true);
    });

    it('should handle many positions (triggering page break)', async () => {
      const positions = Array.from({ length: 40 }, (_, i) =>
        createPosition({
          position_number: i + 1,
          name: `Position ${i + 1}`,
          quantity: i + 1,
          unit_price: 50,
          total_price: (i + 1) * 50,
        })
      );
      await generateQuotePDF(createQuote(), positions);

      // heightOfString returns 15, rowHeight = 25 + 15 = 40
      // Page break triggers at y > 750, starting at ~300 → ~11 positions per page
      // With 40 positions, should add pages
      expect(mockAddPageCalls).toBeGreaterThan(0);
    });

    it('should handle missing optional fields gracefully', async () => {
      const quote = createQuote({
        company_address: null,
        company_phone: null,
        company_email: null,
        company_website: null,
        customer_company: null,
        customer_address: null,
        introduction_text: null,
        notes: null,
        pdf_payment_terms: null,
        pdf_footer_text: null,
        pdf_show_bank_details: false,
        company_tax_id: null,
        company_bank_details: null,
      });

      const buffer = await generateQuotePDF(quote, [createPosition()]);
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it('should use default company name when not provided', async () => {
      await generateQuotePDF(createQuote({ company_name: null }), [createPosition()]);
      expect(allText()).toContain('Mein Unternehmen');
    });

    it('should use default primary color when not provided', async () => {
      // Should not throw
      const buffer = await generateQuotePDF(createQuote({ primary_color: null }), [createPosition()]);
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it('should format currency with German locale (comma separator)', async () => {
      await generateQuotePDF(createQuote({ subtotal: 1234.56 }), [createPosition()]);
      expect(allText()).toContain('1.234,56');
    });

    it('should use correct fonts', async () => {
      await generateQuotePDF(createQuote(), [createPosition()]);
      expect(mockFontCalls).toContain('Helvetica-Bold');
      expect(mockFontCalls).toContain('Helvetica');
    });

    it('should handle empty positions array', async () => {
      const buffer = await generateQuotePDF(createQuote(), []);
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it('should handle positions without description', async () => {
      const buffer = await generateQuotePDF(createQuote(), [
        createPosition({ description: null }),
      ]);
      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it('should include company contact info', async () => {
      await generateQuotePDF(
        createQuote({ company_phone: '+49 30 555', company_email: 'a@b.de' }),
        [createPosition()]
      );
      const joined = allText();
      expect(joined).toContain('+49 30 555');
      expect(joined).toContain('a@b.de');
    });

    it('should include company_tax_id in footer', async () => {
      await generateQuotePDF(createQuote({ company_tax_id: 'DE999888777' }), [createPosition()]);
      expect(allText()).toContain('DE999888777');
    });

    it('should include date formatting', async () => {
      await generateQuotePDF(
        createQuote({ created_at: '2025-06-15T10:00:00Z' }),
        [createPosition()]
      );
      // German date format: DD.MM.YYYY
      expect(allText()).toContain('15.06.2025');
    });
  });
});
