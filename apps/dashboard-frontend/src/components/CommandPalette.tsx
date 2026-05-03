/**
 * CommandPalette — Phase 3.6
 *
 * Cmd+K (macOS) / Ctrl+K (Win/Linux) öffnet eine globale Suche über
 * Chats, Dokumente, Knowledge-Spaces und Settings-Tabs. Backend-Endpoint
 * /api/search respektiert Multi-User-ACL aus Phase 1.1.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MessageSquare, FileText, Folder, Settings, Loader2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';

interface SearchResult {
  query: string;
  chats: Array<{ id: number; title: string }>;
  documents: Array<{ id: string; filename: string; title: string | null }>;
  spaces: Array<{ id: string; name: string; slug: string; description: string }>;
  settings: Array<{ id: string; label: string; tab: string }>;
}

const EMPTY_RESULT: SearchResult = {
  query: '',
  chats: [],
  documents: [],
  spaces: [],
  settings: [],
};

export default function CommandPalette() {
  const api = useApi();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult>(EMPTY_RESULT);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Toggle via Cmd+K / Ctrl+K
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [open]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    setQuery('');
    setResults(EMPTY_RESULT);
    setActiveIndex(0);
    return undefined;
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open || !query.trim()) {
      setResults(EMPTY_RESULT);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.get<SearchResult>(`/search?q=${encodeURIComponent(query.trim())}`, {
          showError: false,
        });
        setResults(data);
        setActiveIndex(0);
      } catch {
        setResults(EMPTY_RESULT);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, [query, open, api]);

  // Build flat list for keyboard nav
  const items: Array<{ kind: string; label: string; sub?: string; nav: () => void }> = [];
  for (const c of results.chats) {
    items.push({ kind: 'chat', label: c.title, nav: () => navigate(`/chat/${c.id}`) });
  }
  for (const d of results.documents) {
    items.push({
      kind: 'doc',
      label: d.title || d.filename,
      sub: d.filename,
      nav: () => navigate('/data'),
    });
  }
  for (const s of results.spaces) {
    items.push({
      kind: 'space',
      label: s.name,
      sub: s.description?.slice(0, 80),
      nav: () => navigate('/data'),
    });
  }
  for (const s of results.settings) {
    items.push({
      kind: 'setting',
      label: s.label,
      nav: () => navigate(`/settings?tab=${s.tab}`),
    });
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, Math.max(0, items.length - 1)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && items[activeIndex]) {
        e.preventDefault();
        items[activeIndex].nav();
        setOpen(false);
      }
    },
    [items, activeIndex]
  );

  if (!open) return null;

  const iconFor = (kind: string) => {
    switch (kind) {
      case 'chat':
        return <MessageSquare className="size-4 text-primary" />;
      case 'doc':
        return <FileText className="size-4 text-primary" />;
      case 'space':
        return <Folder className="size-4 text-primary" />;
      case 'setting':
        return <Settings className="size-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-start justify-center pt-[15vh]"
      role="dialog"
      aria-label="Befehlspalette"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-[600px] max-w-[92vw] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="size-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Chats, Dokumente, Spaces, Einstellungen suchen..."
            className="flex-1 bg-transparent border-0 outline-none text-foreground placeholder:text-muted-foreground"
            autoComplete="off"
          />
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <kbd className="text-[10px] bg-muted text-muted-foreground rounded px-1.5 py-0.5 border border-border">
            ESC
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground text-center">
              {query.trim() ? 'Keine Treffer.' : 'Beginnen Sie zu tippen.'}
            </div>
          ) : (
            items.map((item, idx) => (
              <button
                key={`${item.kind}-${idx}`}
                type="button"
                onClick={() => {
                  item.nav();
                  setOpen(false);
                }}
                className={`flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors ${
                  idx === activeIndex ? 'bg-accent' : ''
                }`}
              >
                {iconFor(item.kind)}
                <div className="flex-1 min-w-0">
                  <div className="text-foreground truncate">{item.label}</div>
                  {item.sub && (
                    <div className="text-xs text-muted-foreground truncate">{item.sub}</div>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground uppercase">{item.kind}</span>
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground flex justify-between">
          <span>↑ ↓ navigieren · Enter öffnen</span>
          <span>Cmd/Ctrl + K</span>
        </div>
      </div>
    </div>
  );
}
