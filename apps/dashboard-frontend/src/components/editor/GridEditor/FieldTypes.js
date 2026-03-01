/**
 * FieldTypes - Constants and utilities for grid field types
 * Shared field type utilities for Datentabellen
 */

// Supported field types with their configuration
export const FIELD_TYPES = [
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
export const getFieldType = type => {
  return FIELD_TYPES.find(ft => ft.value === type) || FIELD_TYPES[0];
};

// Validation functions for field types
export const validateValue = (value, fieldType) => {
  if (!value || value === '') return null; // Empty is OK (unless required)

  switch (fieldType) {
    case 'email': {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        return 'Ungültige E-Mail-Adresse';
      }
      break;
    }
    case 'url': {
      try {
        new URL(value);
      } catch {
        return 'Ungültige URL (muss mit http:// oder https:// beginnen)';
      }
      break;
    }
    case 'phone': {
      const phoneRegex = /^[+\d\s\-()]+$/;
      if (!phoneRegex.test(value)) {
        return 'Ungültige Telefonnummer';
      }
      break;
    }
    case 'number':
    case 'currency': {
      if (isNaN(parseFloat(value))) {
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
export const formatValue = (value, type, options = {}) => {
  if (value === null || value === undefined || value === '') return '-';

  switch (type) {
    case 'currency':
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: options.currency || 'EUR',
      }).format(parseFloat(value) || 0);
    case 'number':
      return new Intl.NumberFormat('de-DE').format(parseFloat(value) || 0);
    case 'date':
      return new Date(value).toLocaleDateString('de-DE');
    case 'datetime':
      return new Date(value).toLocaleString('de-DE');
    case 'checkbox':
      return value === true || value === 'true' ? '✓' : '✗';
    default:
      return String(value);
  }
};

// Create slug from name
export const toSlug = name => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[äöüß]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[c] || c)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
};

// Auto-detect field type from values
export const autoDetectType = values => {
  const nonEmpty = values.filter(v => v !== '' && v !== null && v !== undefined);
  if (nonEmpty.length === 0) return 'text';

  // Check if all values are numbers
  if (nonEmpty.every(v => !isNaN(parseFloat(v)))) {
    // Check if it looks like currency
    if (nonEmpty.some(v => String(v).includes('€') || String(v).includes('$'))) {
      return 'currency';
    }
    return 'number';
  }

  // Check for dates
  const datePattern = /^\d{4}-\d{2}-\d{2}|^\d{2}\.\d{2}\.\d{4}|^\d{2}\/\d{2}\/\d{4}/;
  if (nonEmpty.every(v => datePattern.test(String(v)))) {
    return 'date';
  }

  // Check for emails
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (nonEmpty.every(v => emailPattern.test(String(v)))) {
    return 'email';
  }

  // Check for URLs
  if (nonEmpty.every(v => String(v).startsWith('http://') || String(v).startsWith('https://'))) {
    return 'url';
  }

  // Check for checkboxes
  const boolValues = ['true', 'false', 'yes', 'no', 'ja', 'nein', '1', '0'];
  if (nonEmpty.every(v => boolValues.includes(String(v).toLowerCase()))) {
    return 'checkbox';
  }

  return 'text';
};

export default FIELD_TYPES;
