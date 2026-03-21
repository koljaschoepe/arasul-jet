import { memo, useEffect, useRef } from 'react';
import { Copy, ClipboardPaste, Scissors, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from '@/components/ui/shadcn/dropdown-menu';

interface CellContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onCut: () => void;
  onDelete: () => void;
  hasClipboard: boolean;
}

const CellContextMenu = memo(function CellContextMenu({
  position,
  onClose,
  onCopy,
  onPaste,
  onCut,
  onDelete,
  hasClipboard,
}: CellContextMenuProps) {
  // Use a hidden trigger element positioned at click location
  const triggerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-open on mount
    triggerRef.current?.click();
  }, []);

  return (
    <DropdownMenu
      open
      onOpenChange={open => {
        if (!open) onClose();
      }}
    >
      <div
        ref={triggerRef}
        style={{
          position: 'fixed',
          top: position.y,
          left: position.x,
          width: 0,
          height: 0,
        }}
      />
      <DropdownMenuContent
        style={{ position: 'fixed', top: position.y, left: position.x }}
        align="start"
        sideOffset={0}
      >
        <DropdownMenuItem onClick={onCopy}>
          <Copy className="size-3.5" /> Kopieren
          <DropdownMenuShortcut>Strg+C</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCut}>
          <Scissors className="size-3.5" /> Ausschneiden
          <DropdownMenuShortcut>Strg+X</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onPaste} disabled={!hasClipboard}>
          <ClipboardPaste className="size-3.5" /> Einfügen
          <DropdownMenuShortcut>Strg+V</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="size-3.5" /> Löschen
          <DropdownMenuShortcut>Entf</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

export default CellContextMenu;
