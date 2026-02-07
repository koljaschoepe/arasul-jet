/**
 * PDF Service - Quote PDF Generation with PDFKit
 * Lightweight PDF generation optimized for Jetson devices
 */

const PDFDocument = require('pdfkit');
const logger = require('../utils/logger');

// Color constants
const COLORS = {
    primary: '#45ADFF',
    dark: '#1A2330',
    text: '#333333',
    muted: '#666666',
    light: '#888888',
    border: '#CCCCCC',
    background: '#F8F9FA'
};

// Fonts (PDFKit built-in)
const FONTS = {
    regular: 'Helvetica',
    bold: 'Helvetica-Bold',
    italic: 'Helvetica-Oblique'
};

/**
 * Format currency value
 */
function formatCurrency(value, currency = 'EUR', symbol = '€') {
    const num = parseFloat(value) || 0;
    const formatted = num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${formatted} ${symbol}`;
}

/**
 * Format date
 */
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Draw a horizontal line
 */
function drawLine(doc, y, width = 500, color = COLORS.border) {
    doc.strokeColor(color)
       .lineWidth(0.5)
       .moveTo(50, y)
       .lineTo(50 + width, y)
       .stroke();
}

/**
 * Generate Quote PDF
 * @param {Object} quote - Quote data from database
 * @param {Array} positions - Quote positions/line items
 * @returns {Promise<Buffer>} PDF as buffer
 */
async function generateQuotePDF(quote, positions) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 50, bottom: 50, left: 50, right: 50 },
                info: {
                    Title: `Angebot ${quote.quote_number}`,
                    Author: quote.company_name || 'Arasul Platform',
                    Subject: 'Angebot',
                    Creator: 'Arasul Datentabellen'
                }
            });

            const chunks = [];
            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            const primaryColor = quote.primary_color || COLORS.primary;
            const pageWidth = 495; // A4 width minus margins

            // === HEADER ===
            let y = 50;

            // Company info (left side)
            doc.font(FONTS.bold)
               .fontSize(16)
               .fillColor(primaryColor)
               .text(quote.company_name || 'Mein Unternehmen', 50, y);

            y += 25;

            if (quote.company_address) {
                doc.font(FONTS.regular)
                   .fontSize(9)
                   .fillColor(COLORS.muted)
                   .text(quote.company_address.replace(/\n/g, ' | '), 50, y);
                y += 12;
            }

            // Contact line
            const contactParts = [];
            if (quote.company_phone) contactParts.push(`Tel: ${quote.company_phone}`);
            if (quote.company_email) contactParts.push(quote.company_email);
            if (quote.company_website) contactParts.push(quote.company_website);

            if (contactParts.length > 0) {
                doc.text(contactParts.join(' | '), 50, y);
                y += 12;
            }

            // Quote number (right side)
            doc.font(FONTS.bold)
               .fontSize(24)
               .fillColor(COLORS.dark)
               .text('ANGEBOT', 350, 50, { align: 'right', width: 195 });

            doc.font(FONTS.regular)
               .fontSize(11)
               .fillColor(COLORS.text)
               .text(`Nr. ${quote.quote_number}`, 350, 80, { align: 'right', width: 195 });

            doc.fontSize(9)
               .fillColor(COLORS.muted)
               .text(`Datum: ${formatDate(quote.created_at)}`, 350, 95, { align: 'right', width: 195 })
               .text(`Gültig bis: ${formatDate(quote.valid_until)}`, 350, 107, { align: 'right', width: 195 });

            y = Math.max(y, 130);
            drawLine(doc, y);
            y += 20;

            // === CUSTOMER ADDRESS ===
            doc.font(FONTS.regular)
               .fontSize(9)
               .fillColor(COLORS.muted)
               .text('Empfänger:', 50, y);

            y += 15;

            doc.font(FONTS.bold)
               .fontSize(11)
               .fillColor(COLORS.text);

            if (quote.customer_company) {
                doc.text(quote.customer_company, 50, y);
                y += 14;
            }

            if (quote.customer_name) {
                doc.font(quote.customer_company ? FONTS.regular : FONTS.bold)
                   .text(quote.customer_name, 50, y);
                y += 14;
            }

            if (quote.customer_address) {
                doc.font(FONTS.regular)
                   .fontSize(10)
                   .text(quote.customer_address, 50, y);
                y += quote.customer_address.split('\n').length * 14;
            }

            doc.text(quote.customer_email, 50, y);
            y += 30;

            // === INTRODUCTION TEXT ===
            if (quote.introduction_text) {
                doc.font(FONTS.regular)
                   .fontSize(10)
                   .fillColor(COLORS.text)
                   .text(quote.introduction_text, 50, y, { width: pageWidth });
                y += doc.heightOfString(quote.introduction_text, { width: pageWidth }) + 20;
            }

            // === POSITIONS TABLE ===
            // Table header
            const tableTop = y;
            const colWidths = { pos: 30, name: 210, qty: 50, unit: 45, price: 70, total: 90 };

            doc.rect(50, tableTop, pageWidth, 25)
               .fill(primaryColor);

            doc.font(FONTS.bold)
               .fontSize(9)
               .fillColor('#FFFFFF');

            let x = 55;
            doc.text('Pos', x, tableTop + 8, { width: colWidths.pos });
            x += colWidths.pos;
            doc.text('Beschreibung', x, tableTop + 8, { width: colWidths.name });
            x += colWidths.name;
            doc.text('Menge', x, tableTop + 8, { width: colWidths.qty, align: 'right' });
            x += colWidths.qty;
            doc.text('Einheit', x, tableTop + 8, { width: colWidths.unit, align: 'center' });
            x += colWidths.unit;
            doc.text('Einzelpreis', x, tableTop + 8, { width: colWidths.price, align: 'right' });
            x += colWidths.price;
            doc.text('Gesamt', x, tableTop + 8, { width: colWidths.total, align: 'right' });

            y = tableTop + 30;

            // Table rows
            doc.font(FONTS.regular)
               .fontSize(9)
               .fillColor(COLORS.text);

            for (const pos of positions) {
                const rowHeight = 25 + (pos.description ? Math.min(doc.heightOfString(pos.description, { width: colWidths.name }), 30) : 0);

                // Check for page break
                if (y + rowHeight > 750) {
                    doc.addPage();
                    y = 50;
                }

                // Alternate row background
                if (pos.position_number % 2 === 0) {
                    doc.rect(50, y - 5, pageWidth, rowHeight)
                       .fill(COLORS.background);
                }

                // Optional/Alternative indicator
                let prefix = '';
                if (pos.is_optional) prefix = '[Optional] ';
                if (pos.is_alternative) prefix = '[Alternative] ';

                x = 55;
                doc.fillColor(COLORS.text)
                   .text(pos.position_number.toString(), x, y, { width: colWidths.pos });

                x += colWidths.pos;

                // Name and description
                doc.font(FONTS.bold)
                   .text(prefix + pos.name, x, y, { width: colWidths.name });

                if (pos.description) {
                    doc.font(FONTS.regular)
                       .fontSize(8)
                       .fillColor(COLORS.muted)
                       .text(pos.description, x, y + 12, { width: colWidths.name, lineGap: 1 });
                }

                doc.font(FONTS.regular)
                   .fontSize(9)
                   .fillColor(COLORS.text);

                x += colWidths.name;
                doc.text(pos.quantity.toString().replace('.', ','), x, y, { width: colWidths.qty, align: 'right' });

                x += colWidths.qty;
                doc.text(pos.unit, x, y, { width: colWidths.unit, align: 'center' });

                x += colWidths.unit;
                doc.text(formatCurrency(pos.unit_price, quote.currency, quote.currency_symbol), x, y, { width: colWidths.price, align: 'right' });

                x += colWidths.price;

                // Strike through optional/alternative totals
                if (pos.is_optional || pos.is_alternative) {
                    doc.fillColor(COLORS.muted);
                }
                doc.text(formatCurrency(pos.total_price, quote.currency, quote.currency_symbol), x, y, { width: colWidths.total, align: 'right' });
                doc.fillColor(COLORS.text);

                y += rowHeight;
            }

            y += 10;
            drawLine(doc, y);
            y += 15;

            // === TOTALS ===
            const totalsX = 350;
            const totalsWidth = 195;

            // Subtotal
            doc.font(FONTS.regular)
               .fontSize(10)
               .text('Zwischensumme (netto):', totalsX, y, { width: totalsWidth - 100 });
            doc.text(formatCurrency(quote.subtotal, quote.currency, quote.currency_symbol), totalsX + 95, y, { width: 100, align: 'right' });
            y += 18;

            // Discount
            if (parseFloat(quote.discount_amount) > 0) {
                doc.fillColor(COLORS.muted)
                   .text(`Rabatt (${quote.discount_percent}%):`, totalsX, y, { width: totalsWidth - 100 });
                doc.text(`-${formatCurrency(quote.discount_amount, quote.currency, quote.currency_symbol)}`, totalsX + 95, y, { width: 100, align: 'right' });
                y += 18;
                doc.fillColor(COLORS.text);
            }

            // Tax
            const taxLabel = quote.tax_label || 'MwSt.';
            doc.text(`${taxLabel} (${quote.tax_rate}%):`, totalsX, y, { width: totalsWidth - 100 });
            doc.text(formatCurrency(quote.tax_amount, quote.currency, quote.currency_symbol), totalsX + 95, y, { width: 100, align: 'right' });
            y += 20;

            // Total
            drawLine(doc, y, totalsWidth, primaryColor);
            y += 8;

            doc.font(FONTS.bold)
               .fontSize(12)
               .fillColor(primaryColor)
               .text('Gesamtbetrag:', totalsX, y, { width: totalsWidth - 100 });
            doc.text(formatCurrency(quote.total, quote.currency, quote.currency_symbol), totalsX + 95, y, { width: 100, align: 'right' });

            y += 40;

            // === NOTES ===
            if (quote.notes) {
                doc.font(FONTS.bold)
                   .fontSize(10)
                   .fillColor(COLORS.text)
                   .text('Anmerkungen:', 50, y);
                y += 15;

                doc.font(FONTS.regular)
                   .fontSize(9)
                   .text(quote.notes, 50, y, { width: pageWidth });
                y += doc.heightOfString(quote.notes, { width: pageWidth }) + 20;
            }

            // === PAYMENT TERMS ===
            if (quote.pdf_payment_terms) {
                doc.font(FONTS.bold)
                   .fontSize(10)
                   .text('Zahlungsbedingungen:', 50, y);
                y += 15;

                doc.font(FONTS.regular)
                   .fontSize(9)
                   .text(quote.pdf_payment_terms, 50, y, { width: pageWidth });
                y += 30;
            }

            // === FOOTER ===
            const footerY = 780;

            drawLine(doc, footerY - 10, pageWidth, COLORS.border);

            doc.font(FONTS.regular)
               .fontSize(8)
               .fillColor(COLORS.light);

            // Company details in footer
            const footerParts = [];
            if (quote.company_name) footerParts.push(quote.company_name);
            if (quote.company_tax_id) footerParts.push(`USt-IdNr.: ${quote.company_tax_id}`);

            if (footerParts.length > 0) {
                doc.text(footerParts.join(' | '), 50, footerY, { width: pageWidth, align: 'center' });
            }

            // Bank details
            if (quote.pdf_show_bank_details && quote.company_bank_details) {
                doc.text(quote.company_bank_details.replace(/\n/g, ' | '), 50, footerY + 12, { width: pageWidth, align: 'center' });
            }

            // Footer text
            if (quote.pdf_footer_text) {
                doc.text(quote.pdf_footer_text, 50, footerY + 24, { width: pageWidth, align: 'center' });
            }

            doc.end();

        } catch (error) {
            logger.error(`[PDFService] Error generating quote PDF: ${error.message}`);
            reject(error);
        }
    });
}

module.exports = {
    generateQuotePDF
};
