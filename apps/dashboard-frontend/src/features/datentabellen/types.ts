/**
 * Datentabellen - Shared type definitions
 */

export interface Field {
  slug: string;
  name: string;
  field_type: string;
  unit?: string;
  options?: Record<string, unknown>;
}

export interface TableData {
  name: string;
  description?: string;
  fields: Field[];
  needs_reindex?: boolean;
  last_indexed_at?: string | null;
  index_row_count?: number;
}

/** CellValue represents the possible types stored in a single cell. */
export type CellValue = string | number | boolean | null | undefined;

export interface Row {
  _id: string;
  _isGhost?: boolean;
  _created_at?: string;
  _updated_at?: string;
  [key: string]: CellValue | boolean | undefined;
}

export interface CellPosition {
  row: number;
  col: number;
}

export interface ColumnMenuState {
  field: Field;
  position: { top: number; left: number };
}

export interface ContextMenuState {
  position: { x: number; y: number };
  rowIdx: number;
  colIdx: number;
}

export interface ExcelEditorProps {
  tableSlug: string;
  tableName?: string;
  onClose?: () => void;
}
