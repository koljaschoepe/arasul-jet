/**
 * Datentabellen - Shared utility functions and constants
 */

import { FIELD_TYPES, formatValue } from '../../components/editor/GridEditor/FieldTypes';

export const ROW_HEIGHT = 36;

export const FIELD_LABELS = Object.fromEntries(
  (FIELD_TYPES as Array<{ value: string; label: string }>).map(t => [t.value, t.label])
);

/** Reusable class strings */

export const columnNameInputCls =
  'w-[120px] py-1.5 px-2 bg-[var(--bg-dark)] border border-[var(--primary-color)] rounded text-[var(--text-primary)] text-xs outline-none';

/** Convert 0-based index to column letter: 0->A, 1->B, ..., 25->Z, 26->AA */

/** Format cell value for display */
export function formatCellValue(value: unknown, fieldType: string): string {
  if (value === null || value === undefined || value === '') return '';
  return formatValue(value, fieldType);
}
