/**
 * Datentabellen - Shared type definitions
 */

export interface Field {
  slug: string;
  name: string;
  field_type: string;
  unit?: string;
  options?: any;
}

export interface TableData {
  name: string;
  description?: string;
  fields: Field[];
}

export interface Row {
  _id: string;
  _isGhost?: boolean;
  _created_at?: string;
  _updated_at?: string;
  [key: string]: any;
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
}
