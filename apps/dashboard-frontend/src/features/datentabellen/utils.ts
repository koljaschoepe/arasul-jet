/**
 * Datentabellen - Shared utility functions and constants
 */

import { FIELD_TYPES, formatValue } from '../../components/editor/GridEditor/FieldTypes';

export const ROW_HEIGHT = 36;

export const FIELD_LABELS = Object.fromEntries(
  (FIELD_TYPES as Array<{ value: string; label: string }>).map(t => [t.value, t.label])
);

/** Reusable class strings */
export const menuItemCls =
  'flex items-center gap-2 w-full py-2 px-3 bg-transparent border-none rounded-md text-[var(--text-secondary)] text-sm cursor-pointer text-left transition-all hover:bg-[var(--primary-alpha-10)] hover:text-[var(--text-primary)]';

export const menuFormInputCls =
  'w-full p-2 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-md text-[var(--text-primary)] text-sm mb-2 outline-none focus:border-[var(--primary-color)]';

export const columnNameInputCls =
  'w-[120px] py-1.5 px-2 bg-[var(--bg-dark)] border border-[var(--primary-color)] rounded text-[var(--text-primary)] text-xs outline-none';

/** Convert 0-based index to column letter: 0->A, 1->B, ..., 25->Z, 26->AA */
export function getColumnLetter(index: number): string {
  let result = '';
  let i = index;
  while (i >= 0) {
    result = String.fromCharCode(65 + (i % 26)) + result;
    i = Math.floor(i / 26) - 1;
  }
  return result;
}

/** Format cell value for display */
export function formatCellValue(value: unknown, fieldType: string): string {
  if (value === null || value === undefined || value === '') return '';
  return formatValue(value, fieldType);
}
