/**
 * DataTable shared constants
 */

// Maximum undo history size
export const MAX_UNDO_HISTORY = 50;

// Page size options
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

// Field types configuration
export const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Mehrzeilig' },
  { value: 'number', label: 'Zahl' },
  { value: 'currency', label: 'Währung' },
  { value: 'date', label: 'Datum' },
  { value: 'datetime', label: 'Datum & Zeit' },
  { value: 'select', label: 'Auswahl' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'email', label: 'E-Mail' },
  { value: 'url', label: 'URL' },
  { value: 'phone', label: 'Telefon' },
];
