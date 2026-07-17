/**
 * FieldTypes - Constants and utilities for grid field types
 * Shared field type utilities for the documents grid editor (GridEditor).
 */

interface FieldTypeConfig {
  value: string;
  label: string;
  description: string;
  icon: string;
}

interface FormatOptions {
  currency?: string;
}

// Supported field types with their configuration
export const FIELD_TYPES: FieldTypeConfig[] = [
  { value: 'text', label: 'Text', description: 'Einzeiliger Text', icon: 'T' },
  {
    value: 'textarea',
    label: 'Mehrzeiliger Text',
    description: 'Längere Beschreibungen',
    icon: 'Tt',
  },
  { value: 'number', label: 'Zahl', description: 'Numerische Werte', icon: '#' },
  { value: 'currency', label: 'Währung', description: 'Geldbeträge', icon: '€' },
  { value: 'date', label: 'Datum', description: 'Nur Datum', icon: 'D' },
  { value: 'datetime', label: 'Datum & Zeit', description: 'Datum mit Uhrzeit', icon: 'DT' },
  { value: 'select', label: 'Auswahl', description: 'Einzelauswahl aus Liste', icon: '▼' },
  { value: 'checkbox', label: 'Checkbox', description: 'Ja/Nein', icon: '☑' },
  { value: 'email', label: 'E-Mail', description: 'E-Mail-Adresse', icon: '@' },
  { value: 'url', label: 'URL', description: 'Webadresse', icon: '🔗' },
  { value: 'phone', label: 'Telefon', description: 'Telefonnummer', icon: '📞' },
];

// Validation functions for field types
export const validateValue = (value: unknown, fieldType: string): string | null => {
  if (!value || value === '') return null;
  const strVal = String(value);

  switch (fieldType) {
    case 'email': {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(strVal)) {
        return 'Ungültige E-Mail-Adresse';
      }
      break;
    }
    case 'url': {
      try {
        new URL(strVal);
      } catch {
        return 'Ungültige URL (muss mit http:// oder https:// beginnen)';
      }
      break;
    }
    case 'phone': {
      const phoneRegex = /^[+\d\s\-()]+$/;
      if (!phoneRegex.test(strVal)) {
        return 'Ungültige Telefonnummer';
      }
      break;
    }
    case 'number':
    case 'currency': {
      if (isNaN(parseFloat(strVal))) {
        return 'Ungültiger numerischer Wert';
      }
      break;
    }
    default:
      break;
  }
  return null;
};

// Format value for display
export type FieldValue = string | number | boolean | null | undefined;

// `unknown`, not `FieldValue`: this is a display formatter that stringifies
// whatever a cell holds (including JSON/object cells). It is
// type-safe — every branch guards or routes through String(value).
export const formatValue = (value: unknown, type: string, options: FormatOptions = {}): string => {
  if (value === null || value === undefined || value === '') return '-';

  switch (type) {
    case 'currency':
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: options.currency || 'EUR',
      }).format(parseFloat(String(value)) || 0);
    case 'number':
      return new Intl.NumberFormat('de-DE').format(parseFloat(String(value)) || 0);
    case 'date':
      return new Date(String(value)).toLocaleDateString('de-DE');
    case 'datetime':
      return new Date(String(value)).toLocaleString('de-DE');
    case 'checkbox':
      return value === true || value === 'true' ? '✓' : '✗';
    default:
      return String(value);
  }
};
