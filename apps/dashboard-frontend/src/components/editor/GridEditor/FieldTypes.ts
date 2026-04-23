/**
 * FieldTypes - Constants and utilities for grid field types
 * Shared field type utilities for Datentabellen
 */

interface FieldTypeConfig {
  value: string;
  label: string;
  description: string;
  icon: string;
}

interface FieldDefinition {
  field_type?: string;
  type?: string;
  unit?: string;
  options?: { choices?: string[] } | string[];
}

interface FormatOptions {
  currency?: string;
}

// Anything a table cell may hold. Matches the JSONB surface the backend returns.
export type FieldValue = string | number | boolean | Date | null | undefined;

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

// Get field type configuration
export const getFieldType = (type: string): FieldTypeConfig => {
  return FIELD_TYPES.find(ft => ft.value === type) || FIELD_TYPES[0];
};

// Validation functions for field types
export const validateValue = (value: FieldValue, fieldType: string): string | null => {
  if (value === null || value === undefined || value === '') return null;

  const str = String(value);
  switch (fieldType) {
    case 'email': {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(str)) {
        return 'Ungültige E-Mail-Adresse';
      }
      break;
    }
    case 'url': {
      try {
        new URL(str);
      } catch {
        return 'Ungültige URL (muss mit http:// oder https:// beginnen)';
      }
      break;
    }
    case 'phone': {
      const phoneRegex = /^[+\d\s\-()]+$/;
      if (!phoneRegex.test(str)) {
        return 'Ungültige Telefonnummer';
      }
      break;
    }
    case 'number':
    case 'currency': {
      if (isNaN(parseFloat(str))) {
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
export const formatValue = (
  value: FieldValue,
  type: string,
  options: FormatOptions = {}
): string => {
  if (value === null || value === undefined || value === '') return '-';

  const str = String(value);
  switch (type) {
    case 'currency':
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: options.currency || 'EUR',
      }).format(parseFloat(str) || 0);
    case 'number':
      return new Intl.NumberFormat('de-DE').format(parseFloat(str) || 0);
    case 'date':
      return new Date(str).toLocaleDateString('de-DE');
    case 'datetime':
      return new Date(str).toLocaleString('de-DE');
    case 'checkbox':
      return value === true || value === 'true' ? '✓' : '✗';
    default:
      return str;
  }
};

// Create slug from name
export const toSlug = (name: string): string => {
  if (!name) return '';
  const charMap: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, c => charMap[c] || c)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
};

// Auto-detect field type from values
export const autoDetectType = (values: FieldValue[]): string => {
  const nonEmpty = values.filter(v => v !== '' && v !== null && v !== undefined);
  if (nonEmpty.length === 0) return 'text';

  if (nonEmpty.every(v => !isNaN(parseFloat(String(v))))) {
    if (nonEmpty.some(v => String(v).includes('€') || String(v).includes('$'))) {
      return 'currency';
    }
    return 'number';
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}|^\d{2}\.\d{2}\.\d{4}|^\d{2}\/\d{2}\/\d{4}/;
  if (nonEmpty.every(v => datePattern.test(String(v)))) {
    return 'date';
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (nonEmpty.every(v => emailPattern.test(String(v)))) {
    return 'email';
  }

  if (nonEmpty.every(v => String(v).startsWith('http://') || String(v).startsWith('https://'))) {
    return 'url';
  }

  const boolValues = ['true', 'false', 'yes', 'no', 'ja', 'nein', '1', '0'];
  if (nonEmpty.every(v => boolValues.includes(String(v).toLowerCase()))) {
    return 'checkbox';
  }

  return 'text';
};

// Format field label with optional unit (e.g. "Zahl | kg")
export const formatFieldLabel = (field: FieldDefinition): string => {
  const type = getFieldType(field.field_type || 'text');
  return field.unit ? `${type.label} | ${field.unit}` : type.label;
};

export default FIELD_TYPES;
