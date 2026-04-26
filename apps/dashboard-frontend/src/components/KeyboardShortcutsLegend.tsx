import { useEffect, useState } from 'react';
import { Keyboard } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';

interface Shortcut {
  keys: string[];
  description: string;
  scope?: string;
}

const GLOBAL_SHORTCUTS: Shortcut[] = [
  { keys: ['?'], description: 'Diese Hilfe öffnen', scope: 'Global' },
  { keys: ['Ctrl', 'B'], description: 'Sidebar ein-/ausblenden', scope: 'Navigation' },
];

const EDITOR_SHORTCUTS: Shortcut[] = [
  { keys: ['Ctrl', 'S'], description: 'Speichern', scope: 'Editor' },
  { keys: ['Esc'], description: 'Schließen / Bearbeitung abbrechen', scope: 'Editor / Modals' },
  { keys: ['Enter'], description: 'Bestätigen / Eingabe absenden', scope: 'Forms' },
];

const TABLE_SHORTCUTS: Shortcut[] = [
  { keys: ['↑', '↓', '←', '→'], description: 'Zelle navigieren', scope: 'Datentabellen' },
  { keys: ['Tab'], description: 'Nächste Zelle', scope: 'Datentabellen' },
  { keys: ['F2', 'Enter'], description: 'Zelle bearbeiten', scope: 'Datentabellen' },
  { keys: ['Delete'], description: 'Zelle leeren', scope: 'Datentabellen' },
  { keys: ['Ctrl', 'Z'], description: 'Rückgängig', scope: 'Datentabellen' },
  { keys: ['Ctrl', 'Y'], description: 'Wiederholen', scope: 'Datentabellen' },
  {
    keys: ['Ctrl', 'C', '/', 'X', '/', 'V'],
    description: 'Kopieren / Ausschneiden / Einfügen',
    scope: 'Datentabellen',
  },
];

const ALL_SHORTCUTS = [...GLOBAL_SHORTCUTS, ...EDITOR_SHORTCUTS, ...TABLE_SHORTCUTS];

/**
 * KeyboardShortcutsLegend — Listens for `?` keypress (without modifiers)
 * and toggles a modal listing all global keyboard shortcuts. Mounted
 * once at the app shell level.
 *
 * `?` is chosen because it's standard (GitHub, Linear, Slack all use it)
 * and does not conflict with browser shortcuts. We ignore it inside text
 * inputs so users can still type literal `?` characters.
 */
export default function KeyboardShortcutsLegend() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when typing into a text field
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) return;
      // No modifiers (so Ctrl+? doesn't trigger)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === '?') {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-5 text-primary" /> Tastatur-Kürzel
          </DialogTitle>
          <DialogDescription>
            Drücke{' '}
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs">?</kbd>{' '}
            jederzeit, um diese Übersicht zu öffnen.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-1 max-h-[60vh] overflow-y-auto">
          {ALL_SHORTCUTS.map((shortcut, i) => {
            const prevScope = i > 0 ? ALL_SHORTCUTS[i - 1]?.scope : undefined;
            const showScope = shortcut.scope && shortcut.scope !== prevScope;
            return (
              <div key={i}>
                {showScope && (
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-1.5">
                    {shortcut.scope}
                  </h4>
                )}
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-foreground">{shortcut.description}</span>
                  <span className="flex items-center gap-1">
                    {shortcut.keys.map((k, j) => (
                      <kbd
                        key={j}
                        className="rounded border border-border bg-muted px-2 py-0.5 text-xs font-mono"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
