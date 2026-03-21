import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { Pencil, Type, Hash, Trash2 } from 'lucide-react';
import { useApi } from '../../../hooks/useApi';
import useConfirm from '../../../hooks/useConfirm';
import { FIELD_TYPES } from '../../../components/editor/GridEditor/FieldTypes';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/shadcn/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/shadcn/popover';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import type { Field } from '../types';

interface ColumnMenuProps {
  field: Field;
  tableSlug: string;
  onClose: () => void;
  onFieldUpdated: () => void;
  position: { top: number; left: number };
}

const ColumnMenu = memo(function ColumnMenu({
  field,
  tableSlug,
  onClose,
  onFieldUpdated,
  position,
}: ColumnMenuProps) {
  const api = useApi();
  const { confirm: showConfirm, ConfirmDialog } = useConfirm();
  const [mode, setMode] = useState<'menu' | 'rename' | 'type' | 'unit'>('menu');
  const [newName, setNewName] = useState(field.name);
  const [newType, setNewType] = useState(field.field_type);
  const [newUnit, setNewUnit] = useState(field.unit || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if ((mode === 'rename' || mode === 'unit') && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [mode]);

  const handlePatch = useCallback(
    async (body: Record<string, any>) => {
      setLoading(true);
      try {
        await api.patch(`/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`, body, {
          showError: false,
        });
        onFieldUpdated();
        onClose();
      } catch (err: any) {
        setError(err.data?.error || err.message);
      } finally {
        setLoading(false);
      }
    },
    [api, tableSlug, field.slug, onFieldUpdated, onClose]
  );

  const handleRename = () => {
    if (!newName.trim() || newName === field.name) {
      onClose();
      return;
    }
    handlePatch({ name: newName.trim() });
  };

  const handleTypeChange = () => {
    if (newType === field.field_type) {
      onClose();
      return;
    }
    handlePatch({ field_type: newType });
  };

  const handleUnitChange = () => {
    const trimmed = newUnit.trim();
    if (trimmed === (field.unit || '')) {
      onClose();
      return;
    }
    handlePatch({ unit: trimmed || null });
  };

  const handleDelete = async () => {
    if (!(await showConfirm({ message: `Spalte "${field.name}" wirklich löschen?` }))) return;
    setLoading(true);
    try {
      await api.del(`/v1/datentabellen/tables/${tableSlug}/fields/${field.slug}`, {
        showError: false,
      });
      onFieldUpdated();
      onClose();
    } catch (err: any) {
      setError(err.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  if (mode !== 'menu') {
    // Sub-form rendered as Popover at same position
    return (
      <>
        <Popover
          open
          onOpenChange={open => {
            if (!open) onClose();
          }}
        >
          <PopoverTrigger asChild>
            <div
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                width: 0,
                height: 0,
              }}
            />
          </PopoverTrigger>
          <PopoverContent
            className="w-56 p-3"
            align="start"
            sideOffset={0}
            onInteractOutside={e => e.preventDefault()}
          >
            {error && (
              <div className="py-1.5 px-2 bg-destructive/10 rounded text-destructive text-xs mb-2">
                {error}
              </div>
            )}

            {mode === 'rename' && (
              <div className="flex flex-col gap-2">
                <Input
                  ref={inputRef}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRename()}
                  placeholder="Neuer Name"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setMode('menu')}>
                    Zurück
                  </Button>
                  <Button size="sm" onClick={handleRename} disabled={loading}>
                    {loading ? '...' : 'Speichern'}
                  </Button>
                </div>
              </div>
            )}

            {mode === 'type' && (
              <div className="flex flex-col gap-2">
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value)}
                  className="w-full p-2 bg-background border border-border rounded-md text-foreground text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {(FIELD_TYPES as Array<{ value: string; label: string }>).map(t => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setMode('menu')}>
                    Zurück
                  </Button>
                  <Button size="sm" onClick={handleTypeChange} disabled={loading}>
                    {loading ? '...' : 'Ändern'}
                  </Button>
                </div>
              </div>
            )}

            {mode === 'unit' && (
              <div className="flex flex-col gap-2">
                <Input
                  ref={inputRef}
                  value={newUnit}
                  onChange={e => setNewUnit(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleUnitChange()}
                  placeholder="Einheit (z.B. kg, €, m)"
                />
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setMode('menu')}>
                    Zurück
                  </Button>
                  <Button size="sm" onClick={handleUnitChange} disabled={loading}>
                    {loading ? '...' : 'Speichern'}
                  </Button>
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>
        {ConfirmDialog}
      </>
    );
  }

  return (
    <>
      <DropdownMenu
        open
        onOpenChange={open => {
          if (!open) onClose();
        }}
      >
        <div
          style={{ position: 'fixed', top: position.top, left: position.left, width: 0, height: 0 }}
        />
        <DropdownMenuContent
          style={{ position: 'fixed', top: position.top, left: position.left }}
          align="start"
          sideOffset={0}
        >
          {error && (
            <div className="py-1.5 px-2 bg-destructive/10 rounded text-destructive text-xs mx-1 mb-1">
              {error}
            </div>
          )}
          <DropdownMenuItem onClick={() => setMode('rename')}>
            <Pencil className="size-3.5" /> Umbenennen
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode('type')}>
            <Type className="size-3.5" /> Typ ändern
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setMode('unit')}>
            <Hash className="size-3.5" /> Einheit ändern
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="size-3.5" /> Löschen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {ConfirmDialog}
    </>
  );
});

export default ColumnMenu;
