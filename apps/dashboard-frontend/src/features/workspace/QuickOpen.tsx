/**
 * QuickOpen — Datei-Schnellsuche im Stil von VS Codes „Gehe zu Datei" (Strg/⌘+P,
 * Plan 022). Sucht serverseitig im aktiven Projekt (`/dateien/suche`) und öffnet
 * die gewählte Datei als Editor-Tab. Tastatur: ↑/↓ navigieren, Enter öffnet,
 * Esc schließt.
 */
import { useEffect, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useActiveProject } from './useProjects';

interface Treffer {
  pfad: string;
  name: string;
  typ: 'ordner' | 'datei';
}

export function QuickOpen() {
  const api = useApi();
  const { activeProject } = useActiveProject();
  const openTab = useWorkspaceStore(s => s.openTab);

  const [offen, setOffen] = useState(false);
  const [query, setQuery] = useState('');
  const [treffer, setTreffer] = useState<Treffer[]>([]);
  const [aktiv, setAktiv] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Strg/⌘+P öffnet die Schnellsuche (statt des Browser-Druckdialogs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setOffen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (offen) {
      setQuery('');
      setTreffer([]);
      setAktiv(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [offen]);

  // Entprellte Serversuche im aktiven Projekt.
  useEffect(() => {
    if (!offen) return undefined;
    const projectId = activeProject?.id;
    const q = query.trim();
    if (!projectId || q.length < 1) {
      setTreffer([]);
      return undefined;
    }
    const t = setTimeout(async () => {
      try {
        const res = await api.get<{ data: { eintraege: Treffer[] } }>(
          `/projects/${projectId}/dateien/suche?q=${encodeURIComponent(q)}`,
          { showError: false }
        );
        setTreffer((res.data?.eintraege || []).filter(e => e.typ === 'datei').slice(0, 50));
        setAktiv(0);
      } catch {
        setTreffer([]);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [query, offen, activeProject?.id, api]);

  const oeffne = (e: Treffer) => {
    if (!activeProject?.id) return;
    openTab({
      type: 'projektdatei',
      projectId: activeProject.id,
      filePath: e.pfad,
      title: e.name,
    });
    setOffen(false);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAktiv(a => Math.min(a + 1, treffer.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAktiv(a => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const t = treffer[aktiv];
      if (t) oeffne(t);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOffen(false);
    }
  };

  if (!offen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Datei-Schnellsuche"
      data-testid="quick-open"
    >
      {/* Klickbarer Hintergrund zum Schließen — ein echtes Button-Element
          (a11y), das die Panel-Klicks nicht abfängt (Geschwister, nicht Eltern). */}
      <button
        type="button"
        aria-label="Schließen"
        tabIndex={-1}
        onClick={() => setOffen(false)}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Datei im Projekt suchen …"
          aria-label="Datei-Schnellsuche"
          className="w-full border-b border-border bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <ul className="max-h-72 overflow-auto py-1" data-testid="quick-open-liste">
          {treffer.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              {query.trim() ? 'Keine Treffer' : 'Tippe zum Suchen …'}
            </li>
          ) : (
            treffer.map((e, i) => (
              <li key={e.pfad}>
                <button
                  type="button"
                  onClick={() => oeffne(e)}
                  onMouseEnter={() => setAktiv(i)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm',
                    i === aktiv
                      ? 'bg-accent text-foreground'
                      : 'text-muted-foreground hover:bg-accent/50'
                  )}
                >
                  <FileText className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                  <span className="truncate font-medium text-foreground">{e.name}</span>
                  <span className="ml-auto max-w-[55%] truncate text-xs text-muted-foreground/60">
                    {e.pfad}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
