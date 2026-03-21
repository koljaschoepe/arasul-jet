import { memo } from 'react';

interface EditorStatusBarProps {
  rows: number;
  fields: number;
  selectedCount: number;
}

const EditorStatusBar = memo(function EditorStatusBar({
  rows,
  fields,
  selectedCount,
}: EditorStatusBarProps) {
  return (
    <div className="flex items-center gap-6 py-2 px-6 bg-card border-t border-border shrink-0 text-xs text-muted-foreground">
      <span>{rows} Zeilen</span>
      <span>{fields} Spalten</span>
      {selectedCount > 0 && <span>{selectedCount} ausgewählt</span>}
    </div>
  );
});

export default EditorStatusBar;
