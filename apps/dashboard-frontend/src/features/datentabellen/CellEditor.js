/**
 * CellEditor re-export for DataTable compatibility
 * Uses the consolidated GridEditor CellEditor with dt-* CSS classes and no validation
 */

import React, { memo } from 'react';
import GridCellEditor from '../../components/editor/GridEditor/CellEditor';

const CellEditor = memo(function CellEditor(props) {
  return <GridCellEditor {...props} classPrefix="dt" validate={false} />;
});

export default CellEditor;
